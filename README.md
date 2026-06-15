# Event-Driven Serverless Order Management System

Final project (Part B) for the AWS course — a cloud-based, **serverless,
event-driven** Order Management System. Orders are managed through REST APIs;
deleting an order triggers asynchronous, non-blocking reactions (email
notification + backup), and a summary PDF of deleted orders can be generated on
demand. A web client (HTML/CSS/JS) calls the APIs; all business logic lives in
AWS Lambda.

> Built and deployed in the **AWS Academy Learner Lab** with **CloudFormation**.

## Architecture

```
Web client (Amplify)
      │  HTTPS
      ▼
 API Gateway (REST)
      │  Lambda proxy
      ▼
  Lambda (Python)  ───────────────►  DynamoDB  (orders table + GSI byCreationDate)
      │
      │  on DELETE: PutEvents "OrderDeleted"
      ▼
  EventBridge (order-events bus, order-deleted-rule)
      ├──────────────►  SNS topic  ──►  email subscribers   (async, non-blocking)
      └──────────────►  backupDeletedOrder Lambda  ──►  S3 (one {orderId}.txt)

  GET /summary ──►  generateSummary Lambda ──► reads S3 TXTs ──► builds PDF
                    ──► S3 (PDF bucket) ──► returns a presigned download URL

  POST /orders/analyze-image ──► analyzeImage Lambda ──► Amazon Rekognition
                    (detect_labels → description + category + price suggestion)
```

The delete API only deletes and returns — notification and backup run in
separate invocations via EventBridge, so they never block the response.

### AWS services used

| Service | Role |
|---|---|
| **DynamoDB** | `orders` table; simple PK `orderId` (UUID) + GSI (`byCreationDate`) for sorted listing |
| **Lambda** (Python) | One function per endpoint + an event-driven backup worker (10 total) |
| **API Gateway** | REST API exposing all endpoints (Lambda proxy integration, CORS) |
| **SNS** | Email notifications when an order is deleted |
| **S3** | Per-order TXT backups + generated summary PDFs |
| **EventBridge** | Async delete fan-out (SNS + backup Lambda) |
| **Rekognition** | Freestyle: AI image → order description/category + price suggestion |
| **CloudFormation** | Infrastructure-as-code for the whole stack |
| **IAM (LabRole)** | Pre-existing Learner Lab execution role reused by every Lambda |

## REST API

| Method | Path | Purpose |
|---|---|---|
| POST | `/orders` | Create an order |
| GET | `/orders` | List all orders, sorted by creation date |
| GET | `/orders/{orderId}` | Get one order |
| PUT | `/orders/{orderId}` | Update an order |
| DELETE | `/orders/{orderId}` | Delete an order (→ async notify + backup) |
| POST | `/subscriptions` | Subscribe an email to deletion notifications |
| DELETE | `/subscriptions` | Unsubscribe an email |
| GET | `/summary` | Generate a PDF of all deleted orders; returns a download URL |
| POST | `/orders/analyze-image` | Freestyle: analyze a photo → order field suggestions |

Full request/response shapes: [`docs/api-contract.md`](docs/api-contract.md).

## Repository layout

```
template.yaml            CloudFormation stack (all ~49 resources)
deploy.sh                Package + deploy script
backend/                 Python Lambda functions (one folder per function)
  createOrder/  getAllOrders/  getOrder/  updateOrder/  deleteOrder/
  subscribe/    unsubscribe/   generateSummary/  backupDeletedOrder/  analyzeImage/
docs/                    Design + deliverable documentation
  design-decisions.md        Every architectural decision + rationale
  resource-list.md           CloudFormation resource inventory
  cloudformation-structure.md  Template walkthrough
  api-contract.md            Endpoint request/response shapes (APIs table)
  cli-commands.md            Per-service CLI verification commands
```

## Prerequisites

- An **AWS Academy Learner Lab** session (started, green dot)
- **AWS CLI v2** and **Python 3** (with `pip`)
- The Lambda runtime is `python3.12`; `fpdf2` is bundled into `generateSummary`
  at deploy time by `deploy.sh`

## Deploy

1. **Get Learner Lab credentials**: in the lab, click **AWS Details → AWS CLI →
   Show**, and copy the block into `~/.aws/credentials` under a named profile:
   ```ini
   [learnerlab]
   aws_access_key_id=ASIA...
   aws_secret_access_key=...
   aws_session_token=...
   ```
   (These are temporary — re-copy them each lab session.)

2. **Verify you're pointed at the lab**:
   ```bash
   AWS_PROFILE=learnerlab AWS_DEFAULT_REGION=us-east-1 aws sts get-caller-identity
   ```

3. **Deploy** (idempotent — creates or updates the stack, ~3–6 min first run):
   ```bash
   AWS_PROFILE=learnerlab AWS_DEFAULT_REGION=us-east-1 ./deploy.sh
   ```
   `deploy.sh` resolves the `LabRole` ARN, ensures a code bucket, bundles
   `fpdf2`, packages the Lambdas to S3, deploys the stack, and prints the
   outputs (API base URL, bucket names, SNS topic ARN, event bus name).

   > IAM is locked in the Learner Lab, so the template does **not** create roles
   > — every Lambda reuses the pre-existing `LabRole` (passed as a parameter).

4. **Get the API base URL** any time from the stack outputs:
   ```bash
   AWS_PROFILE=learnerlab AWS_DEFAULT_REGION=us-east-1 \
     aws cloudformation describe-stacks --stack-name order-management \
     --query "Stacks[0].Outputs"
   ```

## Verify

Per-service CLI checks (and a curl-based end-to-end flow) are in
[`docs/cli-commands.md`](docs/cli-commands.md). Quick smoke test:

```bash
BASE="<ApiBaseUrl from stack outputs>"
curl -s -X POST "$BASE/orders" -H 'Content-Type: application/json' \
  -d '{"price": 29.99, "description": "Wireless mouse"}'
curl -s "$BASE/orders"
```

## Notes

- **Email notifications**: SNS email subscriptions require the recipient to click
  a confirmation link before they receive messages.
- **Names**: the S3 buckets are deterministic —
  `order-management-backups-<account>` / `order-management-pdfs-<account>` (unique
  via your account id, stable across redeploys). Only the **API Gateway id** is
  auto-generated; read it from the stack outputs (above).
- **Teardown**: `aws cloudformation delete-stack --stack-name order-management`
  (empty the S3 buckets first if deletion is blocked).
