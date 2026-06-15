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
