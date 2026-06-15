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
