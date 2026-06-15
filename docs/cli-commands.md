# AWS Setup per Service — CLI Verification Commands

> Deliverable: the "AWS Setup per service" table. One runnable CLI command per
> service that shows the service's details. Each command must run successfully
> in the AWS Learner Lab.
>
> **How to run** (Learner Lab creds in the `[learnerlab]` profile):
> ```bash
> export AWS_PROFILE=learnerlab
> export AWS_DEFAULT_REGION=us-east-1
> ```
> Then run any command below as-is.

## Deployment-specific values (this deployment)

Most names are **stable** (fixed in `template.yaml`); two are **auto-generated**
and would change if the stack is torn down and recreated in a fresh lab.

| Value | Current | Stable? |
|---|---|---|
| Region | `us-east-1` | yes |
| Account | `436772392606` | per lab |
| Stack name | `order-management` | yes |
| DynamoDB table | `orders` | yes |
| Lambda function names | `createOrder`, `getAllOrders`, `getOrder`, `updateOrder`, `deleteOrder`, `subscribe`, `unsubscribe`, `generateSummary`, `backupDeletedOrder`, `analyzeImage` | yes |
| SNS topic ARN | `arn:aws:sns:us-east-1:436772392606:order-notifications` | yes (name) |
| EventBridge bus / rule | `order-events` / `order-deleted-rule` | yes |
| Backups bucket | `order-management-backups-436772392606` | yes (account-based) |
| PDF bucket | `order-management-pdfs-436772392606` | yes (account-based) |
| API Gateway id | `bqmrrznt2a` (base `https://bqmrrznt2a.execute-api.us-east-1.amazonaws.com/prod`) | **auto-generated** |

> The S3 bucket names are deterministic (account-based), so they stay stable
> across redeploys. Only the **API Gateway id** is auto-generated; if you
> redeploy, refresh it from the stack outputs:
> `aws cloudformation describe-stacks --stack-name order-management --query "Stacks[0].Outputs"`.

---

## Per-service table (for the Word doc)

| AWS Service | Why this service / functionality | CLI command to see the service details |
|---|---|---|
| **DynamoDB** | Persistent `orders` store; primary key `orderId` + GSI `byCreationDate` for sorted retrieval. | `aws dynamodb describe-table --table-name orders` |
| **Lambda** | All business logic — one function per API + the event-driven backup worker. | `aws lambda get-function --function-name createOrder` (or the filtered `list-functions` below to see all 10) |
| **API Gateway** | REST front door exposing the order/subscription/summary/analyze-image endpoints. | `aws apigateway get-rest-apis` |
| **SNS** | Email notifications to subscribers when an order is deleted. | `aws sns get-topic-attributes --topic-arn arn:aws:sns:us-east-1:436772392606:order-notifications` |
| **S3** | Object storage: per-order TXT backups and generated summary PDFs. | `aws s3 ls s3://order-management-backups-436772392606/` |
| **EventBridge** | Async delete fan-out: routes `OrderDeleted` to SNS (email) + backup Lambda (S3). | `aws events list-rules --event-bus-name order-events` |
| **Rekognition** | Freestyle: AI image labels → order description/category + price suggestion. | `aws rekognition list-collections` |
| **CloudFormation** | Infrastructure-as-code — provisions the entire stack. | `aws cloudformation describe-stacks --stack-name order-management` |
| **IAM (LabRole)** | Pre-existing Learner Lab execution role reused by every Lambda. | `aws iam get-role --role-name LabRole` |

---

## Full commands (copy-paste, with helpful `--query` filters)

```bash
# DynamoDB — table, keys, GSI
aws dynamodb describe-table --table-name orders \
  --query 'Table.{Name:TableName,Status:TableStatus,Keys:KeySchema,GSI:GlobalSecondaryIndexes[0].IndexName}'

# Lambda — our functions only (the lab account also has its own managed
# functions like RoleCreationFunction/ModLabRole/Redshift*; filter them out)
aws lambda list-functions \
  --query "Functions[?contains(['createOrder','getAllOrders','getOrder','updateOrder','deleteOrder','subscribe','unsubscribe','generateSummary','backupDeletedOrder','analyzeImage'], FunctionName)].FunctionName" \
  --output text

# Lambda — details of a single function (repeat per function as needed)
aws lambda get-function --function-name deleteOrder --query 'Configuration.{Name:FunctionName,Runtime:Runtime,Handler:Handler}'

# API Gateway — the REST API id/name
aws apigateway get-rest-apis --query 'items[].{id:id,name:name}'

# API Gateway — the resources/paths under the API
aws apigateway get-resources --rest-api-id bqmrrznt2a --query 'items[].path'

# SNS — the notifications topic
aws sns get-topic-attributes --topic-arn arn:aws:sns:us-east-1:436772392606:order-notifications

# SNS — current subscriptions (after someone subscribes)
aws sns list-subscriptions-by-topic --topic-arn arn:aws:sns:us-east-1:436772392606:order-notifications

# S3 — both buckets
aws s3 ls | grep order-management
aws s3 ls s3://order-management-backups-436772392606/
aws s3 ls s3://order-management-pdfs-436772392606/

# EventBridge — the rule and its two targets
aws events list-rules --event-bus-name order-events --query 'Rules[].{Name:Name,State:State}'
aws events list-targets-by-rule --rule order-deleted-rule --event-bus-name order-events --query 'Targets[].Id'

# Rekognition — confirms the service is reachable/permitted (stateless service, no resource to describe)
aws rekognition list-collections

# CloudFormation — the whole stack + its status
aws cloudformation describe-stacks --stack-name order-management --query 'Stacks[0].StackStatus' --output text

# IAM — the LabRole every Lambda uses
aws iam get-role --role-name LabRole --query 'Role.Arn' --output text
```

> **Rekognition note:** Rekognition is an on-demand, stateless service — there is
> no persistent resource to "describe." `list-collections` returns an empty list
> but proves the service is reachable and permitted. The actual usage is the
> `analyzeImage` Lambda calling `detect_labels`; inspect it with
> `aws lambda get-function --function-name analyzeImage`.

---

## Functional end-to-end test (optional — feeds "List of tested flows")

These hit the live API (no AWS creds needed — public API Gateway). `BASE` is the
API base URL.

```bash
BASE="https://bqmrrznt2a.execute-api.us-east-1.amazonaws.com/prod"

# Create
curl -s -X POST "$BASE/orders" -H 'Content-Type: application/json' \
  -d '{"price": 29.99, "description": "Wireless mouse"}'

# Get all (sorted by creation date, newest first)
curl -s "$BASE/orders"

# Get one (replace <id>)
curl -s "$BASE/orders/<id>"

# Update
curl -s -X PUT "$BASE/orders/<id>" -H 'Content-Type: application/json' \
  -d '{"price": 24.99, "description": "Wireless mouse (sale)"}'

# Delete (triggers async SNS email + S3 backup via EventBridge)
curl -s -X DELETE "$BASE/orders/<id>"

# Subscribe an email to deletion notifications (then confirm via the email link)
curl -s -X POST "$BASE/subscriptions" -H 'Content-Type: application/json' \
  -d '{"email": "you@example.com"}'

# PDF summary of all deleted orders → returns a downloadable URL
curl -s "$BASE/summary"
```
