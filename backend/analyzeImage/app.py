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
