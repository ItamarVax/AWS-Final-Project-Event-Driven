# CloudFormation Template Structure

> How `template.yaml` is organized, the wiring functions that connect resources,
> and the deploy flow. Companion to `resource-list.md` (the inventory).

**Last updated:** 2026-06-15

---

## Top-level anatomy

```yaml
AWSTemplateFormatVersion: '2010-09-09'   # format version (always this)
Description: Order Management System
Parameters:        # inputs passed at deploy time
Resources:         # the ~40 resources — the bulk of the file
Outputs:           # values handed back after deploy
```

Only `Resources` is required; we use all three.

## Parameters — our one input

```yaml
Parameters:
  LabRoleArn:
    Type: String
    Description: ARN of the pre-existing LabRole (Learner Lab execution role)
```
Passed via `--parameter-overrides LabRoleArn=arn:aws:iam::...:role/LabRole`.
Every Lambda references it (Learner Lab forbids creating IAM roles).

## The wiring functions (how resources reference each other)

- **`!Ref X`** → the resource's main identifier (usually name/id).
- **`!GetAtt X.Attr`** → a specific attribute, often `.Arn`.
- **`!Sub "text ${X}"`** → string substitution.

These let a Lambda's env var receive a table name / topic ARN without
hardcoding. This is how the template self-wires.

## Resources, by group

- **DynamoDB** — `OrdersTable`; the GSI (`byCreationDate`) is defined *inside* the
  table. `HASH` = partition key, `RANGE` = sort key.
- **S3** — `BackupBucket`, `PdfBucket` (auto-generated unique names, read from
  Outputs).
- **SNS** — `NotificationTopic`.
- **Lambda** — 9 functions, all same shape: `Runtime`, `Handler`,
  `Role: !Ref LabRoleArn`, `Code: ./backend/<fn>` (local path; `package`
  rewrites to S3), `Environment.Variables` carrying resource names via `!Ref`.
- **API Gateway** — chain per endpoint: `RestApi → Resource (path) → Method
  (AWS_PROXY integration → Lambda) → Lambda Permission`; plus an `OPTIONS` method
  per path (MOCK integration) for CORS; then one `Deployment` + `Stage` (prod).
  - **`AWS_PROXY`** integration produces the event/response contract in
    `api-contract.md`.
  - **`DependsOn`** on the Deployment is required — it must wait for all methods,
    or you publish an empty API. (The one ordering CloudFormation can't infer.)
- **EventBridge** — `OrderEventBus`; `OrderDeletedRule` (matches
  `source=orders.api`, `detail-type=OrderDeleted`) with two inline targets
  (backup Lambda + SNS topic w/ Input Transformer); a `Lambda::Permission` so
  EventBridge can invoke the backup Lambda; an `SNS::TopicPolicy` so the rule can
  publish to the topic.

## Critical-care spots (newcomer traps)

1. **Explicit permissions** — every "X invokes Y" needs a permission resource
   (API GW → Lambda, EventBridge → Lambda, rule → SNS). Missing → silent 500s.
2. **`DependsOn` on the API Deployment** — or the published API is empty.
3. **CORS** — `OPTIONS` MOCK methods + `Access-Control-Allow-Origin` headers on
   every Lambda response.
4. **No IAM roles created** — all Lambdas use `LabRole`. LabRole's broad
   permissions also cover the Lambdas' calls to DynamoDB/S3/SNS/EventBridge, so
   we don't add IAM policies.

## Outputs

```yaml
Outputs:
  ApiBaseUrl:       !Sub https://${Api}.execute-api.${AWS::Region}.amazonaws.com/prod
  BackupBucketName: !Ref BackupBucket
  PdfBucketName:    !Ref PdfBucket
  TopicArn:         !Ref NotificationTopic
  EventBusName:     !Ref OrderEventBus
```
`ApiBaseUrl` → web client config; all → deliverable tables.

## Deploy flow

```bash
# 1) zip Lambda code, upload to S3, rewrite local paths → S3 locations
aws cloudformation package \
  --template-file template.yaml \
  --s3-bucket <code-bucket> \
  --output-template-file packaged.yaml

# 2) create/update the whole stack
aws cloudformation deploy \
  --template-file packaged.yaml \
  --stack-name order-management \
  --parameter-overrides LabRoleArn=arn:aws:iam::<acct>:role/LabRole \
  --capabilities CAPABILITY_IAM
```

The `generateSummary` function needs a third-party PDF library (e.g. `fpdf2`);
its dependencies are installed into its own `backend/generateSummary/` directory
before packaging (or shipped as a Lambda layer).
