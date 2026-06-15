# API Contract — Endpoint Request/Response Shapes

> The exact interface for every endpoint: what goes in, what comes out, status
> codes, and validation. Drives the Lambda code and doubles as the "APIs List"
> deliverable table. Companion to `resource-list.md` (the *what we build*) and
> `design-decisions.md` (the *why*).

**Last updated:** 2026-06-15

---

## The Lambda proxy integration contract (applies to every API Lambda)

API Gateway passes the whole HTTP request to the Lambda as a JSON `event` and
expects a specifically-shaped JSON response.

**Lambda receives (`event`):**
```python
{
  "pathParameters": { "orderId": "abc-123" },   # {orderId} from the URL, or None
  "queryStringParameters": { ... },             # ?key=value, or None
  "body": "{\"price\": 9.99}",                  # request body — a STRING; json.loads it
  "httpMethod": "POST",
  ...
}
```
Traps: `body` is a **string** (must `json.loads`); `pathParameters` /
`queryStringParameters` are **`None`** when absent (not empty dicts).

**Lambda must return:**
```python
{
  "statusCode": 200,
  "headers": {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"          # CORS — on EVERY response
  },
  "body": json.dumps({ ... })                    # body must be a STRING
}
```
The CORS header goes on success **and** error responses, or the browser blocks
the client from reading the result.

**Conventions used throughout:**
- Server generates `orderId` (UUID) and timestamps; client never sets them.
- Status codes: `201` create, `200` otherwise, `400` bad input, `404` not found.
- `creationDate` is immutable; update touches only `price`/`description` and
  refreshes `lastModifiedDate`.
- Subscribe/unsubscribe by email (ARN looked up for unsubscribe).

---

## 1. Create order — `POST /orders`
**Request body:**
```json
{ "price": 29.99, "description": "Wireless mouse" }
```
**Lambda:** generate `orderId = uuid4()`; `creationDate = lastModifiedDate = now`
(ISO-8601); `pk = "ORDER"`; `put_item`.

**Response `201`:**
```json
{
  "orderId": "7c3a...",
  "price": 29.99,
  "description": "Wireless mouse",
  "creationDate": "2026-06-15T13:45:00Z",
  "lastModifiedDate": "2026-06-15T13:45:00Z"
}
```
**Errors:** `400` if `price`/`description` missing or `price` not numeric.

---

## 2. Get all orders, sorted by date — `GET /orders`
No input. **Lambda:** `Query` the GSI on `pk = "ORDER"`
(`ScanIndexForward=false` for newest-first).

**Response `200`:**
```json
{ "orders": [ { /* full order */ } ], "count": 1 }
```
Full orders returned (GSI `ALL` projection → single query, no second lookup).

---

## 3. Get one order — `GET /orders/{orderId}`
**Input:** `orderId` from path. **Lambda:** `get_item` by `orderId`.
**Response `200`:** the order object. **Errors:** `404` if not found.

---

## 4. Update order — `PUT /orders/{orderId}`
**Input:** `orderId` in path + body:
```json
{ "price": 24.99, "description": "Wireless mouse (sale)" }
```
**Lambda:** `update_item` on editable fields; refresh `lastModifiedDate`. Never
changes `orderId` or `creationDate`.
**Response `200`:** updated order. **Errors:** `404` not found, `400` invalid.

---

## 5. Delete order — `DELETE /orders/{orderId}`
**Lambda:** `get_item` (to capture details) → `delete_item` →
`put_events(OrderDeleted)` → return immediately (does NOT wait for email/backup).
**Response `200`:**
```json
{ "message": "Order deleted", "orderId": "7c3a..." }
```
**Errors:** `404` if not found.

---

## 6. Subscribe — `POST /subscriptions`
**Request body:** `{ "email": "user@example.com" }`
**Lambda:** `sns.subscribe(TopicArn, Protocol="email", Endpoint=email)`.
**Response `200`:**
```json
{ "message": "Subscription pending — check your email to confirm.", "email": "user@example.com" }
```
(Email subs require clicking a confirmation link — wording reflects that.)

---

## 7. Unsubscribe — `DELETE /subscriptions`
**Request body:** `{ "email": "user@example.com" }`
**Lambda:** list topic subscriptions, match endpoint to email,
`sns.unsubscribe(SubscriptionArn)`.
**Response `200`:** `{ "message": "Unsubscribed", "email": "..." }`
**Edge case:** unconfirmed subs have ARN `"PendingConfirmation"` and can't be
unsubscribed by ARN — handle gracefully with a clear message.

---

## 8. PDF summary — `GET /summary`
**Lambda:** list + read all `.txt` in the backups bucket → build a PDF (e.g.
`fpdf`) → upload to the PDFs bucket → generate a **pre-signed URL** and return it
in the body (assignment: return it, don't just log it).
**Response `200`:**
```json
{ "url": "https://...s3...amazonaws.com/summary-....pdf?X-Amz-...", "deletedOrderCount": 5 }
```

---

## Internal contracts (not APIs)

**`OrderDeleted` event** (`deleteOrder` → EventBridge):
```json
{
  "Source": "orders.api",
  "DetailType": "OrderDeleted",
  "Detail": "{ \"orderId\": \"...\", \"price\": 29.99, \"description\": \"...\", \"creationDate\": \"...\", \"deletedAt\": \"...\" }"
}
```
Rule matches on `Source`/`DetailType`; `Detail` carries the order for both
targets (email + backup).

**Backup TXT** (`backupDeletedOrder` writes `{orderId}.txt`):
```
Order ID: 7c3a...
Price: 29.99
Description: Wireless mouse
Created: 2026-06-15T13:45:00Z
Deleted: 2026-06-15T14:10:00Z
```

**Email body** (EventBridge Input Transformer → SNS): human-readable, e.g.
"Order 7c3a… (Wireless mouse, $29.99) was deleted on 2026-06-15."

---

## APIs List (deliverable table — fill URLs after deploy)

| API Name | Method | URL | Sample Input | Sample Output |
|---|---|---|---|---|
| Create order | POST | `{base}/orders` | `{"price":29.99,"description":"Wireless mouse"}` | `201` order object |
| Get all orders | GET | `{base}/orders` | — | `{"orders":[...],"count":N}` |
| Get order | GET | `{base}/orders/{orderId}` | path: orderId | order object / `404` |
| Update order | PUT | `{base}/orders/{orderId}` | `{"price":24.99,"description":"..."}` | updated order |
| Delete order | DELETE | `{base}/orders/{orderId}` | path: orderId | `{"message":"Order deleted",...}` |
| Subscribe | POST | `{base}/subscriptions` | `{"email":"user@example.com"}` | pending message |
| Unsubscribe | DELETE | `{base}/subscriptions` | `{"email":"user@example.com"}` | unsubscribed message |
| PDF summary | GET | `{base}/summary` | — | `{"url":"...","deletedOrderCount":N}` |
