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
