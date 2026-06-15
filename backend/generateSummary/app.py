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
    pdf.multi_cell(0, 10, "Deleted Orders Summary", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 8, _safe(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%SZ')}"), new_x="LMARGIN", new_y="NEXT")
    pdf.multi_cell(0, 8, f"Total deleted orders: {len(texts)}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_font("Courier", "", 10)
    for block in texts:
        for line in block.splitlines():
            pdf.multi_cell(0, 6, _safe(line), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    pdf_bytes = bytes(pdf.output())
    key = f"summary-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.pdf"
    s3.put_object(Bucket=PDF_BUCKET, Key=key, Body=pdf_bytes, ContentType="application/pdf")

    url = s3.generate_presigned_url(
        "get_object", Params={"Bucket": PDF_BUCKET, "Key": key}, ExpiresIn=URL_EXPIRY_SECONDS
    )
    return _response(200, {"url": url, "deletedOrderCount": len(texts)})
