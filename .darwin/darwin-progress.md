# Implementation Plan — Order Management System (Backend)

## Overview

Build the backend of the Event-Driven Serverless Order Management System: 10
Python Lambda functions (9 from the design + the Rekognition `analyzeImage`
freestyle), wire the freestyle endpoint into the existing `template.yaml`, and
add a `deploy.sh` that resolves `LabRole`, bundles `fpdf2`, packages, and
deploys via CloudFormation.

Design sources of truth: `docs/design-decisions.md`, `docs/resource-list.md`,
`docs/api-contract.md`, `docs/cloudformation-structure.md`, `template.yaml`.

- **Branch**: `main` (worktree workflow skipped per user choice — solo assignment)
- **Worktree**: N/A — working directly in the main checkout
- **Scope (non-goals)**: web client, deliverable Word doc, and the actual AWS
  deployment run are deferred to a follow-up plan.

### Shared contract (every API Lambda)
Each `app.py` is self-contained (its own copy of the `_response` helper — no
Lambda layer). Response shape:
```python
def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=_default),   # _default: Decimal -> float
    }
```
Conventions: parse body via `json.loads(event.get("body") or "{}")`; handle
`pathParameters` None; store price as `Decimal`, return as float; timestamps
`YYYY-MM-DDTHH:MM:SSZ`. Env var names match `template.yaml`.

## Task Table

| ID | Task | File(s) | Depends on | Status |
|----|------|---------|-----------|--------|
| T0 | git init + scaffolding + `.gitignore` | `.gitignore`, `backend/*/` | — | COMPLETE |
| T1 | createOrder + getAllOrders | `backend/createOrder/app.py`, `backend/getAllOrders/app.py` | T0 | COMPLETE |
| T2 | getOrder + updateOrder | `backend/getOrder/app.py`, `backend/updateOrder/app.py` | T0 | COMPLETE |
| T3 | deleteOrder | `backend/deleteOrder/app.py` | T0 | COMPLETE |
| T4 | subscribe + unsubscribe | `backend/subscribe/app.py`, `backend/unsubscribe/app.py` | T0 | COMPLETE |
| T5 | backupDeletedOrder | `backend/backupDeletedOrder/app.py` | T0 | COMPLETE |
| T6 | generateSummary (fpdf2) | `backend/generateSummary/app.py` | T0 | COMPLETE |
| T7 | analyzeImage (Rekognition) | `backend/analyzeImage/app.py` | T0 | COMPLETE |
| T8 | doc sync (add analyzeImage) | `docs/resource-list.md`, `docs/api-contract.md` | T0 | COMPLETE |
| T9 | template.yaml — add analyzeImage | `template.yaml` | T7 | PENDING |
| T10 | deploy.sh | `deploy.sh` | T9 | PENDING |

**Execution waves**
- Wave 0: T0 (serial — must run first)
- Wave 1: T1–T8 (parallel — disjoint files)
- Wave 2: T9 (depends on T7)
- Wave 3: T10 (depends on T9)

---

## Task Details

### Task T0: git init + scaffolding
**Files**: `.gitignore`, `backend/{createOrder,getAllOrders,getOrder,updateOrder,deleteOrder,subscribe,unsubscribe,generateSummary,backupDeletedOrder,analyzeImage}/`
**Depends on**: — · **Parallel-Safety**: SERIAL_ONLY · **Tier**: Fast
**Upstream artifacts expected**: None
**Read-first pointers**: `docs/resource-list.md` (Lambda table)
**Output artifacts**: 10 `backend/<fn>/` dirs; `.gitignore`
**Changes**
1. `git init` (default branch `main`).
2. `mkdir -p backend/{createOrder,getAllOrders,getOrder,updateOrder,deleteOrder,subscribe,unsubscribe,generateSummary,backupDeletedOrder,analyzeImage}`
3. `.gitignore` (already created at finalization):
```gitignore
__pycache__/
*.pyc
.DS_Store
packaged.yaml
backend/generateSummary/*
!backend/generateSummary/app.py
Bedrock Presentation/
```
**Acceptance**: `git status` works; all 10 dirs exist.

### Task T1: createOrder + getAllOrders
**Files**: `backend/createOrder/app.py`, `backend/getAllOrders/app.py`
**Depends on**: T0 · **Parallel-Safety**: SAFE · **Tier**: Fast
**Upstream**: T0 dirs · **Shared contracts**: `_response`/Decimal convention (Overview)
**Changes** — `backend/createOrder/app.py`:
```python
import os
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3

TABLE_NAME = os.environ["TABLE_NAME"]
GSI_PARTITION_VALUE = os.environ.get("GSI_PARTITION_VALUE", "ORDER")
table = boto3.resource("dynamodb").Table(TABLE_NAME)


def _default(o):
    if isinstance(o, Decimal):
        return float(o)
    raise TypeError


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=_default),
    }


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
    except (TypeError, json.JSONDecodeError):
        return _response(400, {"error": "Invalid JSON body"})

    description = body.get("description")
    price = body.get("price")
    if not isinstance(description, str) or not description.strip():
        return _response(400, {"error": "description is required"})
    if isinstance(price, bool) or not isinstance(price, (int, float)):
        return _response(400, {"error": "price must be a number"})

    now = _now()
    item = {
        "orderId": str(uuid.uuid4()),
        "gsiPartition": GSI_PARTITION_VALUE,
        "creationDate": now,
        "lastModifiedDate": now,
        "price": Decimal(str(price)),
        "description": description.strip(),
    }
    category = body.get("category")
    if isinstance(category, str) and category.strip():
        item["category"] = category.strip()

    table.put_item(Item=item)
    return _response(201, item)
```
`backend/getAllOrders/app.py`:
```python
import os
import json
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.environ["TABLE_NAME"]
GSI_NAME = os.environ.get("GSI_NAME", "byCreationDate")
GSI_PARTITION_VALUE = os.environ.get("GSI_PARTITION_VALUE", "ORDER")
table = boto3.resource("dynamodb").Table(TABLE_NAME)


def _default(o):
    if isinstance(o, Decimal):
        return float(o)
    raise TypeError


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=_default),
    }


def lambda_handler(event, context):
    items, kwargs = [], {
        "IndexName": GSI_NAME,
        "KeyConditionExpression": Key("gsiPartition").eq(GSI_PARTITION_VALUE),
        "ScanIndexForward": False,
    }
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    return _response(200, {"orders": items, "count": len(items)})
```
**Acceptance**: create validates inputs, writes a UUID item; getAll queries GSI newest-first.

### Task T2: getOrder + updateOrder
**Files**: `backend/getOrder/app.py`, `backend/updateOrder/app.py`
**Depends on**: T0 · **Parallel-Safety**: SAFE · **Tier**: Fast
**Changes** — `backend/getOrder/app.py`:
```python
import os
import json
from decimal import Decimal

import boto3

TABLE_NAME = os.environ["TABLE_NAME"]
table = boto3.resource("dynamodb").Table(TABLE_NAME)


def _default(o):
    if isinstance(o, Decimal):
        return float(o)
    raise TypeError


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=_default),
    }


def lambda_handler(event, context):
    order_id = (event.get("pathParameters") or {}).get("orderId")
    if not order_id:
        return _response(400, {"error": "orderId is required"})
    item = table.get_item(Key={"orderId": order_id}).get("Item")
    if not item:
        return _response(404, {"error": "Order not found"})
    return _response(200, item)
```
`backend/updateOrder/app.py`:
```python
import os
import json
from datetime import datetime, timezone
from decimal import Decimal

import boto3

TABLE_NAME = os.environ["TABLE_NAME"]
table = boto3.resource("dynamodb").Table(TABLE_NAME)


def _default(o):
    if isinstance(o, Decimal):
        return float(o)
    raise TypeError


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=_default),
    }


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def lambda_handler(event, context):
    order_id = (event.get("pathParameters") or {}).get("orderId")
    if not order_id:
        return _response(400, {"error": "orderId is required"})
    try:
        body = json.loads(event.get("body") or "{}")
    except (TypeError, json.JSONDecodeError):
        return _response(400, {"error": "Invalid JSON body"})

    if "Item" not in table.get_item(Key={"orderId": order_id}):
        return _response(404, {"error": "Order not found"})

    names = {"#m": "lastModifiedDate"}
    values = {":m": _now()}
    sets = ["#m = :m"]

    if "price" in body:
        price = body["price"]
        if isinstance(price, bool) or not isinstance(price, (int, float)):
            return _response(400, {"error": "price must be a number"})
        names["#p"] = "price"; values[":p"] = Decimal(str(price)); sets.append("#p = :p")
    if "description" in body:
        desc = body["description"]
        if not isinstance(desc, str) or not desc.strip():
            return _response(400, {"error": "description must be a non-empty string"})
        names["#d"] = "description"; values[":d"] = desc.strip(); sets.append("#d = :d")
    if "category" in body and isinstance(body["category"], str):
        names["#c"] = "category"; values[":c"] = body["category"].strip(); sets.append("#c = :c")

    resp = table.update_item(
        Key={"orderId": order_id},
        UpdateExpression="SET " + ", ".join(sets),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ReturnValues="ALL_NEW",
    )
    return _response(200, resp["Attributes"])
```
**Acceptance**: getOrder 404s on miss; updateOrder 404s on missing id, refreshes `lastModifiedDate`, never alters `orderId`/`creationDate`.

### Task T3: deleteOrder
**Files**: `backend/deleteOrder/app.py`
**Depends on**: T0 · **Parallel-Safety**: SAFE · **Tier**: Fast
**Changes**:
```python
import os
import json
from datetime import datetime, timezone
from decimal import Decimal

import boto3

TABLE_NAME = os.environ["TABLE_NAME"]
EVENT_BUS_NAME = os.environ["EVENT_BUS_NAME"]
EVENT_SOURCE = os.environ.get("EVENT_SOURCE", "orders.api")
table = boto3.resource("dynamodb").Table(TABLE_NAME)
events = boto3.client("events")


def _default(o):
    if isinstance(o, Decimal):
        return float(o)
    raise TypeError


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=_default),
    }


def lambda_handler(event, context):
    order_id = (event.get("pathParameters") or {}).get("orderId")
    if not order_id:
        return _response(400, {"error": "orderId is required"})

    order = table.get_item(Key={"orderId": order_id}).get("Item")
    if not order:
        return _response(404, {"error": "Order not found"})

    table.delete_item(Key={"orderId": order_id})

    detail = {
        "orderId": order["orderId"],
        "price": float(order.get("price", 0)),
        "description": order.get("description", ""),
        "creationDate": order.get("creationDate", ""),
        "deletedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    events.put_events(Entries=[{
        "Source": EVENT_SOURCE,
        "DetailType": "OrderDeleted",
        "Detail": json.dumps(detail),
        "EventBusName": EVENT_BUS_NAME,
    }])
    return _response(200, {"message": "Order deleted", "orderId": order_id})
```
**Acceptance**: deletes the item, emits one `OrderDeleted` event to the custom bus, returns without waiting on email/backup.

### Task T4: subscribe + unsubscribe
**Files**: `backend/subscribe/app.py`, `backend/unsubscribe/app.py`
**Depends on**: T0 · **Parallel-Safety**: SAFE · **Tier**: Fast
**Changes** — `backend/subscribe/app.py`:
```python
import os
import json

import boto3

TOPIC_ARN = os.environ["TOPIC_ARN"]
sns = boto3.client("sns")


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
    except (TypeError, json.JSONDecodeError):
        return _response(400, {"error": "Invalid JSON body"})
    email = (body.get("email") or "").strip()
    if "@" not in email or "." not in email:
        return _response(400, {"error": "A valid email is required"})
    sns.subscribe(TopicArn=TOPIC_ARN, Protocol="email", Endpoint=email)
    return _response(200, {
        "message": "Subscription pending — check your email to confirm.",
        "email": email,
    })
```
`backend/unsubscribe/app.py`:
```python
import os
import json

import boto3

TOPIC_ARN = os.environ["TOPIC_ARN"]
sns = boto3.client("sns")


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
    except (TypeError, json.JSONDecodeError):
        return _response(400, {"error": "Invalid JSON body"})
    email = (body.get("email") or "").strip()
    if "@" not in email:
        return _response(400, {"error": "A valid email is required"})

    sub_arn, pending, kwargs = None, False, {"TopicArn": TOPIC_ARN}
    while True:
        resp = sns.list_subscriptions_by_topic(**kwargs)
        for sub in resp.get("Subscriptions", []):
            if sub.get("Endpoint") == email:
                if sub.get("SubscriptionArn") == "PendingConfirmation":
                    pending = True
                else:
                    sub_arn = sub["SubscriptionArn"]
        token = resp.get("NextToken")
        if not token or sub_arn:
            break
        kwargs["NextToken"] = token

    if sub_arn:
        sns.unsubscribe(SubscriptionArn=sub_arn)
        return _response(200, {"message": "Unsubscribed", "email": email})
    if pending:
        return _response(200, {"message": "Subscription is pending confirmation and cannot be removed until confirmed.", "email": email})
    return _response(404, {"error": "No subscription found for this email", "email": email})
```
**Acceptance**: subscribe returns pending message; unsubscribe finds ARN by email and handles `PendingConfirmation`.

### Task T5: backupDeletedOrder
**Files**: `backend/backupDeletedOrder/app.py`
**Depends on**: T0 · **Parallel-Safety**: SAFE · **Tier**: Fast
**Changes**:
```python
import os

import boto3

BACKUP_BUCKET = os.environ["BACKUP_BUCKET"]
s3 = boto3.client("s3")


def lambda_handler(event, context):
    detail = event.get("detail", {})
    order_id = detail.get("orderId", "unknown")
    text = (
        f"Order ID: {order_id}\n"
        f"Description: {detail.get('description', '')}\n"
        f"Price: {detail.get('price', '')}\n"
        f"Created: {detail.get('creationDate', '')}\n"
        f"Deleted: {detail.get('deletedAt', '')}\n"
    )
    s3.put_object(
        Bucket=BACKUP_BUCKET,
        Key=f"{order_id}.txt",
        Body=text.encode("utf-8"),
        ContentType="text/plain",
    )
    return {"ok": True, "orderId": order_id}
```
**Acceptance**: writes one `{orderId}.txt` from the EventBridge `detail`.

### Task T6: generateSummary (fpdf2)
**Files**: `backend/generateSummary/app.py`
**Depends on**: T0 · **Parallel-Safety**: SAFE · **Tier**: Fast
**Notes**: uses only `multi_cell` (cross-version safe) and sanitizes text to latin-1 for the core fonts. `fpdf2` bundled at deploy time (T10).
**Changes**:
```python
import os
import json
from datetime import datetime, timezone

import boto3
from fpdf import FPDF

BACKUP_BUCKET = os.environ["BACKUP_BUCKET"]
PDF_BUCKET = os.environ["PDF_BUCKET"]
URL_EXPIRY_SECONDS = int(os.environ.get("URL_EXPIRY_SECONDS", "3600"))
s3 = boto3.client("s3")


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body),
    }


def _safe(text):
    return text.encode("latin-1", "replace").decode("latin-1")


def lambda_handler(event, context):
    texts, kwargs = [], {"Bucket": BACKUP_BUCKET}
    while True:
        resp = s3.list_objects_v2(**kwargs)
        for obj in resp.get("Contents", []):
            if obj["Key"].endswith(".txt"):
                data = s3.get_object(Bucket=BACKUP_BUCKET, Key=obj["Key"])["Body"].read()
                texts.append(data.decode("utf-8", errors="replace"))
        if not resp.get("IsTruncated"):
            break
        kwargs["ContinuationToken"] = resp["NextContinuationToken"]

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.multi_cell(0, 10, "Deleted Orders Summary")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 8, _safe(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%SZ')}"))
    pdf.multi_cell(0, 8, f"Total deleted orders: {len(texts)}")
    pdf.ln(4)

    pdf.set_font("Courier", "", 10)
    for block in texts:
        for line in block.splitlines():
            pdf.multi_cell(0, 6, _safe(line))
        pdf.ln(3)

    pdf_bytes = bytes(pdf.output())
    key = f"summary-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.pdf"
    s3.put_object(Bucket=PDF_BUCKET, Key=key, Body=pdf_bytes, ContentType="application/pdf")

    url = s3.generate_presigned_url(
        "get_object", Params={"Bucket": PDF_BUCKET, "Key": key}, ExpiresIn=URL_EXPIRY_SECONDS
    )
    return _response(200, {"url": url, "deletedOrderCount": len(texts)})
```
**Acceptance**: reads all `.txt` backups, builds a PDF, uploads it, returns presigned URL + count.

### Task T7: analyzeImage (Rekognition freestyle)
**Files**: `backend/analyzeImage/app.py`
**Depends on**: T0 · **Parallel-Safety**: SAFE · **Tier**: Fast
**Changes**:
```python
import os
import json
import base64

import boto3

rekognition = boto3.client("rekognition")

PRICE_MAP = {
    "Electronics": 99.99, "Computer": 499.99, "Laptop": 799.99, "Mouse": 25.00,
    "Keyboard": 45.00, "Monitor": 180.00, "Mobile Phone": 699.00, "Phone": 699.00,
    "Headphones": 80.00, "Camera": 350.00, "Furniture": 150.00, "Chair": 120.00,
    "Table": 200.00, "Book": 15.00, "Clothing": 30.00, "Shoe": 60.00,
    "Bottle": 5.00, "Food": 10.00,
}
DEFAULT_PRICE = 0.0


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
    except (TypeError, json.JSONDecodeError):
        return _response(400, {"error": "Invalid JSON body"})

    image_b64 = body.get("image")
    if not image_b64:
        return _response(400, {"error": "image (base64) is required"})
    if isinstance(image_b64, str) and image_b64.startswith("data:") and "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]
    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception:
        return _response(400, {"error": "image is not valid base64"})

    try:
        rek = rekognition.detect_labels(Image={"Bytes": image_bytes}, MaxLabels=10, MinConfidence=70)
    except rekognition.exceptions.InvalidImageFormatException:
        return _response(400, {"error": "Unsupported image format (use JPEG or PNG)"})

    labels = [{"name": l["Name"], "confidence": round(l["Confidence"], 1)} for l in rek.get("Labels", [])]
    if not labels:
        return _response(200, {"description": "", "category": None, "labels": [], "suggestedPrice": DEFAULT_PRICE})

    description = ", ".join(l["name"] for l in labels[:3])
    category = labels[0]["name"]
    suggested_price = DEFAULT_PRICE
    for l in labels:
        if l["name"] in PRICE_MAP:
            category = l["name"]
            suggested_price = PRICE_MAP[l["name"]]
            break

    return _response(200, {
        "description": description,
        "category": category,
        "labels": labels,
        "suggestedPrice": suggested_price,
    })
```
**Acceptance**: accepts base64 (with optional data-URL prefix), returns description/category/labels/suggestedPrice; graceful fallback when no label matches the map.

### Task T8: doc sync (add analyzeImage)
**Files**: `docs/resource-list.md`, `docs/api-contract.md`
**Depends on**: T0 · **Parallel-Safety**: SAFE · **Tier**: High
**Changes**:
1. In `docs/resource-list.md` Lambda table, add a row: `analyzeImage` | API `POST /orders/analyze-image` | Rekognition `detect_labels` + price map; note the count is now 10.
2. In `docs/api-contract.md`, add a section documenting `POST /orders/analyze-image`
   (request `{"image":"<base64>"}`, response `{description, category, labels:[{name,confidence}], suggestedPrice}`),
   and add a corresponding row to the APIs List table.
**Acceptance**: both docs reflect the freestyle endpoint.

### Task T9: template.yaml — add analyzeImage resources
**Files**: `template.yaml`
**Depends on**: T7 · **Parallel-Safety**: SERIAL_ONLY · **Tier**: Fast
**Changes**:
1. Add Lambda (section 4):
```yaml
  AnalyzeImageFn:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: analyzeImage
      Runtime: python3.12
      Handler: app.lambda_handler
      Role: !Ref LabRoleArn
      Timeout: 30
      MemorySize: 256
      Code: ./backend/analyzeImage
```
2. Add path + methods (API section, near SummaryResource):
```yaml
  AnalyzeImageResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref Api
      ParentId: !Ref OrdersResource
      PathPart: analyze-image

  AnalyzeImageMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref Api
      ResourceId: !Ref AnalyzeImageResource
      HttpMethod: POST
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${AnalyzeImageFn.Arn}/invocations

  AnalyzeImageOptionsMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref Api
      ResourceId: !Ref AnalyzeImageResource
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        RequestTemplates:
          application/json: '{"statusCode": 200}'
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Headers: "'Content-Type'"
              method.response.header.Access-Control-Allow-Methods: "'POST,OPTIONS'"
              method.response.header.Access-Control-Allow-Origin: "'*'"
            ResponseTemplates:
              application/json: ''
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
            method.response.header.Access-Control-Allow-Origin: true
```
3. Add permission (permissions group):
```yaml
  AnalyzeImagePermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref AnalyzeImageFn
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${Api}/*/*
```
4. Add to `ApiDeployment.DependsOn`: `- AnalyzeImageMethod`, `- AnalyzeImageOptionsMethod`.
**Acceptance**: template re-validates (pyyaml check); resource count 44 → 49; new methods present in `DependsOn`.

### Task T10: deploy.sh
**Files**: `deploy.sh`
**Depends on**: T9 · **Parallel-Safety**: SERIAL_ONLY · **Tier**: Fast
**Changes**:
```bash
#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${STACK_NAME:-order-management}"
REGION="${AWS_REGION:-us-east-1}"
PDF_LIB="fpdf2==2.7.9"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
CODE_BUCKET="${CODE_BUCKET:-oms-deploy-${ACCOUNT_ID}-${REGION}}"

LAB_ROLE_ARN="$(aws iam list-roles --query "Roles[?RoleName=='LabRole'].Arn" --output text)"
if [ -z "$LAB_ROLE_ARN" ] || [ "$LAB_ROLE_ARN" = "None" ]; then
  echo "ERROR: LabRole not found. Are your Learner Lab credentials configured?" >&2
  exit 1
fi
echo "Using LabRole: $LAB_ROLE_ARN"

if ! aws s3api head-bucket --bucket "$CODE_BUCKET" 2>/dev/null; then
  echo "Creating code bucket: $CODE_BUCKET"
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$CODE_BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$CODE_BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
fi

echo "Bundling $PDF_LIB into generateSummary..."
pip install "$PDF_LIB" --target backend/generateSummary --upgrade --quiet

aws cloudformation package \
  --template-file template.yaml \
  --s3-bucket "$CODE_BUCKET" \
  --output-template-file packaged.yaml

aws cloudformation deploy \
  --template-file packaged.yaml \
  --stack-name "$STACK_NAME" \
  --parameter-overrides LabRoleArn="$LAB_ROLE_ARN" \
  --capabilities CAPABILITY_IAM \
  --region "$REGION"

echo ""
echo "Stack outputs:"
aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
  --query "Stacks[0].Outputs" --output table
```
**Acceptance**: `bash -n deploy.sh` parses; resolves LabRole, ensures code bucket, bundles fpdf2, packages + deploys, prints outputs.

---

## Execution Log

### Wave 1 (T1–T8) — COMPLETE
- **Dispatch**: 8 parallel `darwin-executor`s (T1–T7 Fast/Sonnet, T8 High/Opus), balanced profile.
- **T1** createOrder + getAllOrders — COMPLETE; `backend/createOrder/app.py`, `backend/getAllOrders/app.py`.
- **T2** getOrder + updateOrder — COMPLETE; `backend/getOrder/app.py`, `backend/updateOrder/app.py`.
- **T3** deleteOrder — COMPLETE; `backend/deleteOrder/app.py` (delete + PutEvents OrderDeleted).
- **T4** subscribe + unsubscribe — COMPLETE; `backend/subscribe/app.py`, `backend/unsubscribe/app.py`.
- **T5** backupDeletedOrder — COMPLETE; `backend/backupDeletedOrder/app.py`.
- **T6** generateSummary — COMPLETE; `backend/generateSummary/app.py` (fpdf2, bundled at deploy).
- **T7** analyzeImage — COMPLETE; `backend/analyzeImage/app.py` (Rekognition + price map).
- **T8** doc sync — COMPLETE; `docs/resource-list.md`, `docs/api-contract.md`.
- **Verification**: `python3 -m py_compile backend/*/app.py` → all OK; both docs contain `analyze-image`.

### Task T1: createOrder + getAllOrders
- **Status**: COMPLETE
- **Changes Made**: Wrote `backend/createOrder/app.py` (UUID generation, input validation, Decimal price, GSI partition key) and `backend/getAllOrders/app.py` (paginated GSI query, newest-first) verbatim from the plan spec.
- **Files Modified**: `backend/createOrder/app.py` (created), `backend/getAllOrders/app.py` (created)
- **Artifacts Produced**: `/Users/ivax/Uni/AWS final project/backend/createOrder/app.py`, `/Users/ivax/Uni/AWS final project/backend/getAllOrders/app.py`
- **Contracts Consumed**: `.darwin/darwin-progress.md` (Task T1 spec; shared `_response`/`_default` contract from Overview)
- **Notes/Risks**: Both files pass `python3 -m py_compile`. Runtime deps (`boto3`) are provided by the Lambda execution environment.
