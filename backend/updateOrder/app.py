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
