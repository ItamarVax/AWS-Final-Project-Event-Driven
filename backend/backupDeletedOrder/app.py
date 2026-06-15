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
