# Resource List — CloudFormation Template Inventory

> Every AWS resource that will live in `template.yaml`, what it is, why it's in
> our design, and the config that matters. Written to be readable by someone
> newer to AWS. Companion to `design-decisions.md` (the *why* behind the
> architecture) — this doc is the *what* we will actually build.

**Last updated:** 2026-06-15

---

## CloudFormation in one paragraph

A template is a **list of resources**. Each resource has a **Type** (e.g.
`AWS::DynamoDB::Table`) and **Properties** (its config). CloudFormation creates
them all in dependency order. Two supporting pieces:
- **Parameters** — inputs passed at deploy time (we use one: the `LabRole` ARN).
- **Outputs** — values returned after deploy (API URL, bucket names, topic ARN).

An **ARN** (Amazon Resource Name) is the globally-unique ID of a resource, e.g.
`arn:aws:dynamodb:us-east-1:123456789:table/orders`. Resources reference each
other by ARN.

---

## 1. DynamoDB — the database (1 resource)

`AWS::DynamoDB::Table` named `orders`. NoSQL key-value store, serverless,
auto-scaling. Source of truth for orders.

- **Partition key**: `orderId` (string, UUID) — unique identifier + determines
  physical partition.
- **GSI** (defined inside the table): partition key = constant `"ORDER"`, sort
  key = `creationDate`, projection = `ALL`. Powers "get all orders sorted by
  creation date" in a single Query. See `design-decisions.md` Decisions 5 & 6.
- **Billing**: `PAY_PER_REQUEST` (on-demand) — no capacity planning.

---

## 2. S3 — object storage (2 resources)

S3 stores files ("objects") in "buckets" (globally-unique names).

- `AWS::S3::Bucket` **backups** — one `{orderId}.txt` per deleted order.
- `AWS::S3::Bucket` **PDF summaries** — generated summary PDFs for download.

Two buckets (not one with folders) for clean separation: the summary Lambda
reads the backups bucket and writes to the PDFs bucket. The download URL will be
a **pre-signed URL** (temporary secure link to a private object).

---

## 3. SNS — email notification channel (1 resource)

`AWS::SNS::Topic`. Pub/sub: publish a message to the topic, SNS delivers to all
subscribers (emails here).

- `subscribe` Lambda adds an email subscriber at runtime.
- EventBridge publishes the "order deleted" message; SNS emails subscribers.
- Subscriptions are **not** in the template — created at runtime by the API, and
  each subscriber must click an email confirmation link.

---

## 4. Lambda — the compute (10 resources)

`AWS::Lambda::Function` per function. Upload code, AWS runs it on demand.

Shared config:
- **Runtime**: `python3.x`; **Handler**: e.g. `app.lambda_handler`.
- **Role**: `!Ref LabRoleParam` — reuse `LabRole` (Learner Lab can't create IAM
  roles).
- **Code**: pointer to zipped source in S3 (filled by `cloudformation package`).
- **Environment variables**: pass resource names/ARNs (table, buckets, topic,
  bus) into the code instead of hardcoding.

| Lambda | Triggered by | Touches |
|---|---|---|
| `createOrder` | API `POST /orders` | DynamoDB (put) |
| `getAllOrders` | API `GET /orders` | DynamoDB (query GSI) |
| `getOrder` | API `GET /orders/{orderId}` | DynamoDB (get) |
| `updateOrder` | API `PUT /orders/{orderId}` | DynamoDB (update) |
| `deleteOrder` | API `DELETE /orders/{orderId}` | DynamoDB (delete) + EventBridge (PutEvents) |
| `subscribe` | API `POST /subscriptions` | SNS (subscribe) |
| `unsubscribe` | API `DELETE /subscriptions` | SNS (unsubscribe) |
| `generateSummary` | API `GET /summary` | S3 (read backups, write PDF) |
| `backupDeletedOrder` | EventBridge rule | S3 (write `{orderId}.txt`) |
| `analyzeImage` | API `POST /orders/analyze-image` | Rekognition (`detect_labels`) + hardcoded price map |

---

## 5. API Gateway — the HTTP front door (~25 resources)

Managed HTTP entry point that forwards requests to Lambdas. Using **REST API**
flavor (assignment says REST; classic and well-documented). Several cooperating
resource types:

- `AWS::ApiGateway::RestApi` — the API container. **1**
- `AWS::ApiGateway::Resource` — one per path segment: `/orders`,
  `/orders/{orderId}` (`{orderId}` = path parameter), `/subscriptions`,
  `/summary`. **~4**
- `AWS::ApiGateway::Method` — one per method-on-path, each integrated to a
  Lambda (8 methods), plus an `OPTIONS` method per path for **CORS** preflight
  (browser cross-origin check). **~10–12**
- `AWS::Lambda::Permission` — **critical glue**: API Gateway can't invoke a
  Lambda without explicit permission. One per API-invoked Lambda (8). Missing
  ones → silent 500s. **~8**
- `AWS::ApiGateway::Deployment` + `AWS::ApiGateway::Stage` — an API isn't live
  until deployed to a stage (e.g. `prod`); stage name is in the URL:
  `https://{id}.execute-api.{region}.amazonaws.com/prod/orders`. **2**

Mechanical pattern, repeated per endpoint: *path → method → integration to
Lambda → permission*.

---

## 6. EventBridge — the event router (~3 resources)

Decouples the delete from its reactions.

- `AWS::Events::EventBus` — custom bus for app events (clearer than the default
  bus). **1**
- `AWS::Events::Rule` — matches `detail-type = OrderDeleted`, routes to targets
  defined inside the rule:
  - **Target 1**: SNS topic, with an **Input Transformer** (reshapes the event
    into a friendly email body).
  - **Target 2**: `backupDeletedOrder` Lambda.
  **1**
- **Permissions**: `AWS::Lambda::Permission` so EventBridge can invoke the backup
  Lambda; `AWS::SNS::TopicPolicy` so the rule can publish to the topic. **~2**

---

## Totals

| Service | Resources (approx) |
|---|---|
| DynamoDB table (+ GSI inside) | 1 |
| S3 buckets | 2 |
| SNS topic | 1 |
| Lambda functions | 10 |
| API Gateway (api + paths + methods + perms + deploy/stage) | ~25 |
| EventBridge (bus + rule + perms/policy) | ~3 |
| **Total** | **~40 resources in one template** |

~25 are the repetitive API Gateway pattern; the conceptually distinct pieces are
just the six services above.

**Non-resource pieces:**
- **Parameter**: `LabRole` ARN.
- **Outputs**: API base URL, both bucket names, SNS topic ARN — copy straight
  into the client config and the deliverable tables.

---

## Newcomer gotchas (called out so we don't get bitten)

1. **Permissions are explicit** — every "X invokes Y" needs a permission
   resource. Missing ones cause silent 500s.
2. **CORS** — browser client is on a different domain than the API, so we need
   `OPTIONS` methods + correct response headers in the Lambdas.
3. **API Gateway must be deployed to a stage** to get a live URL — defining
   methods isn't enough.
4. **No IAM role creation** in Learner Lab — every Lambda uses `LabRole`.
