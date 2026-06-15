<!-- BEGIN DARWIN (generated — do not edit between markers) -->
# Project Context

## Overview
Event-Driven Serverless Order Management System — a cloud-based AWS assignment
(Final Project, Part B). Orders are managed through REST APIs and the system
reacts automatically to important events (order deletion triggers async
notification + backup). The entire solution must be **serverless, event-driven,
and scalable**. The deliverable is graded out of 100 points across the modules
listed below.

## Key Modules
- **Order Management (55 pts)** — DynamoDB `orders` table + API Gateway REST APIs
  (create, get-all sorted by creation date, get-one, update, delete), each
  backed by a Python Lambda. Data persisted in DynamoDB.
- **Notification Subscription (10 pts)** — REST APIs to register an email for
  notifications and to unsubscribe (Amazon SNS).
- **Order Deletion → Notification (10 pts)** — on delete, async email with the
  deleted order details. Must NOT block or delay the delete response.
- **Order Deletion → Backup (5 pts)** — on delete, async write of order details
  as a TXT file to S3. Must NOT block the delete response.
- **PDF Summary download (5 pts)** — API that reads all TXT backups in S3,
  builds a summary PDF, stores it in S3, and returns the PDF URL in the response
  body (not logged).
- **Freestyle enhancement (5 pts)** — an additional AWS service adding clear,
  demonstrable, UI-visible value. *To be decided during design/innovate.*
- **Client (10 pts)** — web client (HTML/CSS/JS) hosted on AWS Amplify. Calls
  REST APIs only; contains NO backend/business logic.

## Suggested Repository Layout
- `backend/` — Python Lambda functions (one per API/event handler) + shared code
- `frontend/` — web client: `index.html`, CSS, JS calling the APIs via `fetch`
- `docs/` — deliverables: AWS diagram, AWS-setup-per-service table, APIs list,
  tested-flows screenshots, freestyle explanation, Word submission

## Entry Points
- **Backend**: Lambda handlers in `backend/` (deployed via AWS console / CLI in
  the AWS Learner Lab). No local server.
- **Frontend**: `frontend/index.html` (static), hosted on AWS Amplify; API base
  URL configured to the API Gateway invoke URL.

## Architecture
Client (Amplify-hosted web app) → API Gateway → Lambda → DynamoDB. The delete
flow fans out asynchronously: delete Lambda removes the item and emits an event;
SNS sends the notification email and an async backup writes a TXT file to S3 —
neither blocks the delete response. A separate PDF-summary Lambda aggregates the
S3 TXT files into a PDF stored back in S3.

## Project-Specific Safety
- The **client must never contain backend/business logic** — it only calls APIs
  and displays the returned result.
- Deletion notification and backup **must be asynchronous** — never make the
  delete response wait on them.
- The PDF summary URL must be **returned in the API response body**, not printed
  to logs.
- The `orders` table must have a justified primary key and proper sort key.
- Every AWS service used must be verifiable via a **runnable CLI command** in the
  AWS Learner Lab — keep resource names accurate and documented in `docs/`.
- All deliverables are submitted in **one Word document**; keep `docs/` in sync.

# Code Quality Standards

## Backend (Python Lambdas)
- Each Lambda has a `lambda_handler(event, context)` entry point.
- Use `boto3` for all AWS access; create clients/resources at module scope so
  they are reused across warm invocations.
- Return API Gateway proxy responses: `{"statusCode": int, "headers": {...},
  "body": json.dumps(...)}`. Always set CORS headers
  (`Access-Control-Allow-Origin`) so the Amplify-hosted client can call the API.
- Validate and parse input from `event` defensively (body may be a JSON string).
- Handle errors explicitly and return appropriate status codes (4xx for bad
  input, 5xx for server errors) with a JSON error body — never leak stack traces.
- Keep async side effects (notification, backup) off the critical path of the
  delete response (DynamoDB Streams + separate Lambda, SNS, or async invoke).

## Import Standards
- Standard library first, then third-party (`boto3`, PDF lib), then local
  modules — grouped and ordered.
- Lambda dependencies beyond the AWS-provided `boto3` (e.g. the PDF library) must
  be packaged in the deployment zip or a Lambda layer.

## Type Annotations
- Annotate function signatures where it aids clarity (handlers, helpers). Not
  strictly enforced, but preferred for shared/utility functions.

## Frontend (HTML/CSS/JS)
- Vanilla HTML/CSS/JS — no framework or build step required.
- All API calls go through `fetch`; keep the API base URL in a single config
  constant so it is easy to point at the deployed API Gateway URL.
- Always display the result returned from the backend to the user (success and
  error). No business logic in the client.

## Formatting
- Python: 4-space indent, PEP 8. `black`/`ruff format` if available (not yet
  configured — add a config if you adopt one).
- JS/HTML/CSS: 2-space indent, consistent style.

## Linting
- No linter configured yet. If adopted, prefer `ruff` for Python.

## Quality Commands
- No automated quality tooling configured yet. See `development-commands.mdc`
  for the AWS CLI verification commands required by the deliverable.

# Development Commands

> Environment: **AWS Learner Lab**. Configure credentials from the lab's "AWS
> Details" before running CLI commands. Every service used in the solution must
> have a CLI command that runs successfully and is documented in `docs/`.

## Setup
- Configure AWS CLI with Learner Lab credentials (`aws configure` or paste the
  lab-provided `~/.aws/credentials`).
- Frontend: no install needed (static files). Open `frontend/index.html`
  locally, or deploy to Amplify.

## Backend deploy (per Lambda)
- Package: `cd backend && zip -r function.zip <handler>.py` (add deps/layer if
  the function needs a PDF library or other non-boto3 package).
- Deploy via AWS console (Learner Lab) or
  `aws lambda update-function-code --function-name <name> --zip-file fileb://function.zip`.

## Frontend deploy
- Host on **AWS Amplify** (assignment requirement). Connect the `frontend/`
  directory or drag-and-drop a zip in the Amplify console; record the resulting
  URL in `docs/`.

## AWS CLI verification commands (deliverable — must run successfully)
- DynamoDB table: `aws dynamodb describe-table --table-name orders`
- Lambda functions: `aws lambda get-function --function-name <name>`
- API Gateway: `aws apigateway get-rest-apis`
- SNS topic: `aws sns get-topic-attributes --topic-arn <arn>`
- SNS subscriptions: `aws sns list-subscriptions-by-topic --topic-arn <arn>`
- S3 backup bucket: `aws s3 ls s3://<bucket-name>/`

## Testing
- No automated test suite. Test end-to-end via the web client and/or `curl`
  against the API Gateway invoke URL. Capture screenshots of each tested flow
  for the deliverable (see "List of tested flows").

## Build
- No build step for the frontend (static). Backend "build" = zip + deploy.

## Run
- Frontend: open the Amplify URL (or `frontend/index.html` locally).
- Backend: invoked via API Gateway / events — no local run.

# Glossary

| Term | Definition |
|---|---|
| Order | A record in the `orders` DynamoDB table: Order ID, Creation date, Price, Order description, Last modified date. |
| `orders` table | The single DynamoDB table storing all orders, with a justified primary key and a sort key (e.g. for sorting by creation date). |
| Notification subscription | An email address registered (via SNS) to receive a message when an order is deleted; can unsubscribe. |
| Async notification | The post-delete email sent without blocking or delaying the delete response. |
| Async backup | The post-delete write of order details as a TXT file to S3, run without blocking the delete response. |
| PDF summary | An on-demand PDF aggregating all TXT backups in S3; the API returns its S3 URL in the response body. |
| Freestyle enhancement | A self-chosen extra AWS service adding clear, demonstrable, UI-visible value (5 pts). To be decided. |
| Client | The web app (HTML/CSS/JS on Amplify) that only calls APIs and displays results — no backend logic. |
| AWS Learner Lab | The grading environment; all services must be verifiable there via runnable CLI commands. |
<!-- END DARWIN -->
