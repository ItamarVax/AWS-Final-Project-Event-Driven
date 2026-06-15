# Design Decisions — Event-Driven Serverless Order Management System

> Final Project, Part B. This document records the architectural decisions made
> for the system: the options we considered, the trade-offs we weighed, and why
> we landed where we did. It feeds directly into the "why did you choose this
> service" sections of the final submission.

**Status:** living document — updated as decisions are made.
**Last updated:** 2026-06-15

---

## Decision 1 — How we build: console vs. infrastructure-as-code

### The question
Do we click resources together in the AWS Console, or define everything as code
and deploy via API/CLI?

### Options considered
- **AWS Console (manual)** — point-and-click in the browser.
- **Plain AWS CLI shell scripts** — `aws <service>` commands in a script.
- **AWS SAM** — serverless-focused IaC on top of CloudFormation.
- **CloudFormation** — native AWS infrastructure-as-code (YAML/JSON template).
- **CDK / Terraform** — higher-level / third-party IaC.

### What we weighed
- We want a reproducible, reviewable build — not manual clicking that's hard to
  repeat or document.
- The assignment requires a **runnable CLI command per service** for grading, so
  building with code/CLI means the build *is* the documentation (done once, not
  twice).
- The environment is the **AWS Learner Lab**, which constrains some IaC choices
  (see Decision 2).
- CLI scripts are simple but verbose, especially for wiring API Gateway to
  Lambda. SAM hides that plumbing but is an extra tool. CDK/Terraform are
  powerful but overkill here and add friction in the Learner Lab.

### Decision
**CloudFormation.** Native AWS IaC, no extra tooling to install, one template
describing the whole system, one `deploy` command. The template doubles as
architecture documentation, and **stack Outputs** surface the API Gateway URL,
bucket names, etc. for free (useful for the APIs/services deliverable tables).

Build flow:
1. `aws cloudformation package` — zips Lambda source, uploads to S3, rewrites the
   template with the S3 code locations.
2. `aws cloudformation deploy` — creates/updates the stack.

### Why not the others
- **Console** — not reproducible, hard to document, against the "everything as
  code" goal.
- **Plain CLI** — works, but verbose for API Gateway↔Lambda wiring; CloudFormation
  is cleaner and still exposes CLI commands for verification.
- **SAM** — would reduce API Gateway boilerplate, but it's an extra layer; we
  preferred staying on native CloudFormation.
- **CDK / Terraform** — overkill for this scope and more friction in Learner Lab.

---

## Decision 2 — Environment constraints (AWS Learner Lab)

Not a free choice, but it shapes everything, so it's recorded here.

- **IAM is locked down.** We **cannot create IAM roles**. There is a pre-existing
  role, **`LabRole`**, that must be reused as the execution role for every Lambda.
  → In the CloudFormation template we do **not** define roles; we add a parameter
  for the `LabRole` ARN and point every Lambda's `Role:` at it.
- **Credentials rotate every session.** Fresh temporary credentials must be
  copied from the lab's "AWS Details" into `~/.aws/credentials` each session.
- **SNS email confirmation is inherently manual** — a subscriber must click the
  confirmation link in their inbox. This is outside AWS and unavoidable.
- **Amplify hosting** is required for the web client; it's the one place the
  console is the path of least resistance for a one-time static deploy (still
  scriptable if desired).

---

## Decision 3 — Client implementation

### The question
The assignment offers two equally-valid client options: a web client
(HTML/CSS/JS) or a Python menu program. Which one?

### Options considered
- **Web client (HTML/CSS/JS)** hosted on AWS Amplify.
- **Python menu** (CLI) using `requests`, self-installing dependencies.

### Decision
**Web client (HTML/CSS/JS) on AWS Amplify**, with a **Python backend** (the
Lambdas). The web app is the "client"; the Python Lambdas are the backend. This
respects the rule that the **client contains no business logic** — it only calls
the REST APIs and displays results.

### Why
- A web UI demonstrates the real API calls visually and is easy to screenshot for
  the "tested flows" deliverable.
- Amplify hosting is explicitly supported by the assignment.
- Python on the backend fits the AWS Learner Lab, `boto3`, and PDF generation.

---

## Decision 4 — The asynchronous delete fan-out (the core "event-driven" decision)

### The question
When an order is deleted, two things must happen **asynchronously, without
blocking or delaying the delete response**: (a) email subscribers the deleted
order details, and (b) write a TXT backup to S3. What mechanism triggers and
fans out these reactions?

### Options considered
- **Option A — DynamoDB Streams (event-sourced).** The delete Lambda only
  deletes the item; DynamoDB emits a REMOVE stream event that triggers a
  processor Lambda, which publishes to SNS and writes the S3 backup.
- **Option B — SNS fan-out (publish from the delete Lambda).** The delete Lambda
  deletes, then publishes to an SNS topic and returns. SNS fans out to email
  subscribers and a backup Lambda.
- **Option C — EventBridge as the fan-out hub.** The delete Lambda deletes, then
  `PutEvents` an `OrderDeleted` event to EventBridge and returns. An EventBridge
  rule routes the event to multiple targets: the SNS topic (email) and a backup
  Lambda (S3).

### What we weighed
| | A — Streams | B — SNS hub | C — EventBridge |
|---|---|---|---|
| Trigger fully off the response path | Yes (DynamoDB emits automatically) | No (in-line publish) | No (in-line PutEvents) |
| Fan-out to SNS **and** Lambda | needs a processor Lambda | awkward | native, one rule |
| Diagram clarity / "event-driven" story | strong | medium | strongest |
| Pieces to configure | stream + 1 Lambda | topic + sub | bus + rule + targets + perms |

- All three satisfy "async, non-blocking": in B and C the actual heavy work
  (email, S3 write) runs in separate invocations off the response path; only the
  fast trigger call (`publish` / `PutEvents`, ~tens of ms) is in-line. In A even
  the trigger is off-path.
- EventBridge natively fans out to **heterogeneous** targets (an SNS topic *and*
  a Lambda) from a single rule, with content-based routing and easy
  extensibility — the cleanest, most extensible event-driven picture.

### Decision
**Option C — EventBridge as the delete fan-out hub.** Chosen for the strongest
event-driven architecture, native multi-target fan-out, and the clearest
diagram. SNS remains the email-delivery mechanism (it's an EventBridge target);
a dedicated backup Lambda handles the S3 TXT write (EventBridge has no native S3
target).

### Why not the others
- **A (Streams)** — purest non-blocking guarantee and fewest concepts, but less
  flexible fan-out and a less striking diagram than a central event bus.
- **B (SNS hub)** — fewer pieces, but triggering a Lambda *and* formatting emails
  cleanly off one topic is awkward; EventBridge does both effortlessly.

### Consequence
Because EventBridge is used in the **core** flow, the **freestyle enhancement
(5 pts) must be a different service** (e.g. Bedrock, CloudWatch dashboard, Step
Functions) to avoid double-counting one service. Freestyle is still TBD.

---

## Decision 5 — The `orders` table key design

### The question
The table stores: Order ID, Creation date, Price, Order description, Last
modified date. It must have **a primary key that uniquely identifies each order**
(key type our choice, but justified) and **proper primary and sort keys**, and it
must support **"get all orders sorted by creation date."**

The hard part: DynamoDB only sorts *within a partition*, by the sort key — it
does **not** sort across the whole table. So "all orders, sorted by date" forces
a deliberate key design.

### Options considered
- **Design 1 — Simple key, sort in the Lambda.** Partition key = `orderId`, no
  sort key. Get-all = `Scan` + sort by `creationDate` in the Lambda.
- **Design 2 — Single-partition composite key.** Partition key = a constant
  (`"ORDER"`), sort key = `creationDate#orderId`. Get-all = one `Query` returns
  items already sorted by date.
- **Design 3 — Simple key + GSI.** Base table partition key = `orderId`; a Global
  Secondary Index keyed on a constant partition + `creationDate` sort key serves
  the sorted get-all query.

### What we weighed
- **Design 1** is simplest but doesn't really use a sort key (the assignment asks
  for "proper primary *and sort* keys") and sorts in code rather than in the DB.
- **Design 2** sorts natively in a single Query and does use a sort key — but its
  uniqueness only works because `orderId` is **smuggled into the sort key**.
  Creation date alone does **not** identify an order (two orders can share a
  timestamp), so the identifier is awkwardly buried in a composite sort key. That
  invites exactly the question "is identifying by creation date really
  identifying?" — a weak story for a requirement that demands a primary key that
  *uniquely identifies each order*.
- **Design 3** answers the two requirements with **two different keys**, each
  doing its proper job: `orderId` is the primary key (clean, unambiguous unique
  identity), and the GSI provides chronological retrieval. Cost: one extra GSI in
  the template. It also avoids any single hot partition on the base table.

### Decision
**Design 3.** Base table simple primary key = **`orderId`** (a UUID string,
generated with `uuid4()` in the create Lambda). A **Global Secondary Index** with
partition key = constant `"ORDER"` and sort key = `creationDate` serves
"get all orders sorted by creation date."

Key-type justifications:
- **`orderId` = UUID string** — globally unique without coordination, no
  collisions, distributes evenly across partitions. (DynamoDB has no native
  auto-increment, so a UUID is the natural unique identifier.)
- **`creationDate` = ISO-8601 string** (e.g. `2026-06-15T13:45:00Z`) —
  lexicographic order equals chronological order, so sort-key ordering "just
  works."

### Why not the others
- **Design 1** — ignores the "proper sort keys" instruction; sorting in code.
- **Design 2** — identity is buried in the sort key; "creation date as identifier"
  is hard to justify and a hot single partition limits scalability.

---

## Decision 6 — GSI projection type

### The question
A GSI keeps its own copy of the projected attributes. How much of each order do
we copy into the index?

### Options considered
- **`KEYS_ONLY`** — index stores only keys (`"ORDER"` + `creationDate` + the base
  key `orderId`). Minimal storage; get-all must then `BatchGetItem` the base
  table for full details and re-apply the sort order.
- **`INCLUDE`** — keys plus a chosen subset of attributes (e.g. `price`,
  `description`). Single-query get-all; copies only display fields.
- **`ALL`** — every attribute copied. Single-query get-all; full duplication.

### What we weighed
- The initial instinct was to avoid duplicating data (`KEYS_ONLY`/`INCLUDE`).
- But in DynamoDB, **storage is the cheapest resource** (~$0.25/GB-month) and a
  GSI duplicating data is the *intended* cost of buying fast sorted reads. The
  expensive resources are **read operations/latency** (a `KEYS_ONLY` projection
  forces a second `BatchGetItem` on every get-all) and **write capacity**.
- In production, `ALL` is common even at millions of items, because avoiding a
  second round trip beats saving negligible storage. The real reason pros
  restrict projection is to limit **write amplification** (every projected
  attribute updated = an extra GSI write) — relevant only for **write-heavy** or
  **large-item** tables.
- This system is **read-heavy, write-light, with tiny items** (orders are listed
  often, created/updated occasionally) — the textbook case for `ALL`.

### Decision
**`ALL`.** Keeps the get-all endpoint a single `Query`, and storage duplication is
negligible at this scale. Justification: "read-heavy access pattern with tiny
items; full projection keeps get-all a single query, and the storage duplication
is immaterial; write amplification is a non-issue given low write volume."

### Why not the others
- **`KEYS_ONLY`** — minimal storage but adds a second `BatchGetItem` + re-sort on
  every get-all; optimizes the cheap resource at the cost of the expensive one.
- **`INCLUDE`** — a valid middle ground (and a good way to show awareness of the
  write-amplification lever), but unnecessary here since writes are light and
  items are tiny.

---

## Decision 7 — Lambda granularity (one per endpoint vs. monolith)

### The question
Do we use one Lambda per REST endpoint, or a single "monolith" Lambda that
internally routes on HTTP method + path?

### Options considered
- **One Lambda per endpoint** — a dedicated function per API operation.
- **Monolith Lambda** — one function with internal routing for all CRUD.

### Decision
**One Lambda per endpoint.** Each function does exactly one thing, maps 1:1 to a
row in the deliverable's APIs table, has the smallest blast radius, and produces
the cleanest diagram and "one Lambda per responsibility" story. The extra
functions are just more YAML in the single CloudFormation template — not more
manual work.

### Why not the monolith
Less boilerplate, but it mixes all CRUD concerns in one function, enlarges the
blast radius, and muddies the per-API documentation.

---

## Decision 8 — How the deleted-order backup is written to S3

### The question
The backup must be a **TXT file in object storage** (S3), written
asynchronously. Should a Lambda write it, or is there a target **native to
EventBridge** that can land the backup without custom code?

### Options considered (EventBridge native targets)
- **Lambda → S3** — a tiny function formats the event as text and `put_object`s
  it as `{orderId}.txt`.
- **Kinesis Data Firehose → S3** — the only no-Lambda EventBridge path that
  reaches S3.
- **SQS / SNS / CloudWatch Logs / Step Functions** — none persist a per-order
  TXT file in object storage (messages expire, logs aren't object storage, etc.).

### What we weighed
- The requirement (TXT file in object storage, and the PDF summary iterating
  "all TXT files in object storage") effectively **fixes the destination to S3**.
- EventBridge has **no direct `S3:PutObject` target**, so Firehose is the closest
  "native" option — but it's a poor fit:
  - Firehose **batches** records into files on a size/time buffer → one file with
    many records, **not one TXT per deleted order** (the model the assignment and
    the PDF summary assume).
  - Firehose imposes its own object naming and a default newline-delimited-JSON
    format, not our TXT layout.
  - Shaping it into clean per-order text needs a **Firehose transformation
    Lambda** anyway — so it doesn't remove the Lambda, it just adds a buffering
    service on top.

### Decision
**A small `backupDeletedOrder` Lambda writes the TXT to S3** (EventBridge rule →
Lambda → S3). This *is* the idiomatic native pattern, not a workaround: the
function formats the deleted-order event and writes one `{orderId}.txt` object —
exactly the per-order layout the PDF-summary Lambda later iterates over.

### Why not Firehose
Strictly more complex for a worse-shaped result (batched multi-record files
instead of one TXT per order), and it still requires a transformation Lambda.

---

## Summary of locked decisions

| Area | Decision |
|---|---|
| Build method | CloudFormation (package + deploy); CLI commands as verification/docs |
| Environment | AWS Learner Lab; reuse `LabRole` (no IAM creation); credentials rotate |
| Client | Web (HTML/CSS/JS) on Amplify; Python Lambda backend; no client logic |
| Delete fan-out | EventBridge hub → SNS (email) + backup Lambda (S3 TXT) |
| Table key | Simple PK `orderId` (UUID) + GSI (constant PK, `creationDate` SK) |
| GSI projection | `ALL` |
| Lambda granularity | One Lambda per endpoint (9 Lambdas total) |
| Backup write | `backupDeletedOrder` Lambda → S3 (`{orderId}.txt`); not Firehose |
| Freestyle (5 pts) | TBD — must differ from EventBridge |

## Open decisions
- Freestyle enhancement service.
- Final route paths (e.g. `DELETE /subscriptions` vs `POST /unsubscribe`;
  `GET /summary` method).
- Per-service resource list for the CloudFormation template.
