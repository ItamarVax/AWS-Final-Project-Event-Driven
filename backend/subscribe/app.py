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
