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
