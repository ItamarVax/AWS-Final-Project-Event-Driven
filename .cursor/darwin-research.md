# Research: Frontend web client requirements — full API surface, schemas, config, and scaffolding state

## Summary
- The **API base URL is live**: `https://bqmrrznt2a.execute-api.us-east-1.amazonaws.com/prod` — this single constant goes in the client config.
- **9 REST endpoints** exist across 5 resources: `/orders` (POST/GET), `/orders/{orderId}` (GET/PUT/DELETE), `/orders/analyze-image` (POST), `/subscriptions` (POST/DELETE), `/summary` (GET). Every endpoint sets `Access-Control-Allow-Origin: *` in the Lambda response, so CORS is covered on the backend side.
- The **order object has 5 fields** returned from all CRUD responses: `orderId` (UUID string), `creationDate` (ISO-8601 string), `lastModifiedDate` (ISO-8601 string), `price` (number/float), `description` (string). An optional 6th field `category` (string) is present when supplied or when the analyze-image endpoint pre-fills it.
- **No `frontend/` directory exists** — the client is a complete greenfield build. Zero scaffolding, no `index.html`, no CSS, no JS.
- The **freestyle endpoint is `POST /orders/analyze-image`** (Rekognition): client sends a base64 image (bare or with `data:image/...;base64,` prefix accepted), receives `description`, `category`, `labels[]`, and `suggestedPrice` — the UI flow is analyze-then-confirm: results pre-fill the create form, the user edits, then calls `POST /orders`.
- The **PDF summary flow** returns a pre-signed S3 URL valid for 1 hour (`{"url":"...","deletedOrderCount":N}`) — the UI should open or link to that URL; it is NOT a direct binary download from the API.
- Amplify hosting is not yet set up (no `amplify.yml`, no existing app). The client will be a static site (plain `index.html` + CSS + JS) deployed by drag-and-drop zip or GitHub auto-deploy in the Amplify console.

## Key files
- `backend/createOrder/app.py:1-59` — canonical order object shape; defines all 6 DynamoDB fields written at create time; `category` is optional on write.
- `backend/getAllOrders/app.py:1-40` — returns `{"orders": [...], "count": N}`; newest-first via GSI (no client-side sort needed).
- `backend/getOrder/app.py:1-33` — returns single order object; 404 `{"error":"Order not found"}` on miss.
- `backend/updateOrder/app.py:1-66` — partial update (only sends changed fields); returns `ALL_NEW` attributes including refreshed `lastModifiedDate`.
- `backend/deleteOrder/app.py:1-53` — returns `{"message":"Order deleted","orderId":"..."}` on success; the async fan-out (email + S3 backup) is completely invisible to the client.
- `backend/subscribe/app.py:1-30` — POST `/subscriptions`; returns `{"message":"Subscription pending — check your email to confirm.","email":"..."}`.
- `backend/unsubscribe/app.py:1-46` — DELETE `/subscriptions`; can return 200 (unsubscribed), 200 (pending — cannot remove), or 404 (not found).
- `backend/generateSummary/app.py:1-61` — GET `/summary`; returns `{"url":"<presigned-s3-url>","deletedOrderCount":N}`; URL expires after 1 hour.
- `backend/analyzeImage/app.py:1-67` — POST `/orders/analyze-image`; base64 image → `{"description":"...","category":"...","labels":[{"name":"...","confidence":N}],"suggestedPrice":N}`.
- `docs/api-contract.md:1-211` — canonical source of truth for all endpoint contracts.
- `/Users/ivax/.claude/projects/-Users-ivax-Uni-AWS-final-project/memory/deployment.md:1-19` — live API base URL + all AWS resource identifiers.

## Signatures & contracts

### Order object (all 5–6 fields — appears in create/get/update responses)
```json
{
  "orderId":          "7c3a…",
  "gsiPartition":     "ORDER",
  "creationDate":     "2026-06-15T13:45:00Z",
  "lastModifiedDate": "2026-06-15T14:00:00Z",
  "price":            29.99,
  "description":      "Wireless mouse",
  "category":         "Electronics"
}
```
Note: `gsiPartition` is an internal DynamoDB housekeeping field — the UI can safely ignore it. `category` is absent when not supplied at create time.

### POST /orders — createOrder/app.py:38-58
```python
# Request body (required)
{ "price": 29.99, "description": "Wireless mouse" }
# Optional
{ "price": 29.99, "description": "Wireless mouse", "category": "Electronics" }

# Response 201 — full order object
{ "orderId": "uuid4", "gsiPartition": "ORDER",
  "creationDate": "ISO-8601", "lastModifiedDate": "ISO-8601",
  "price": 29.99, "description": "Wireless mouse" }

# Errors
# 400 { "error": "description is required" }
# 400 { "error": "price must be a number" }
# 400 { "error": "Invalid JSON body" }
```

### GET /orders — getAllOrders/app.py:28-40
```python
# No input

# Response 200
{ "orders": [ { /* full order object */ }, … ], "count": 3 }
```

### GET /orders/{orderId} — getOrder/app.py:25-32
```python
# Path param: orderId

# Response 200 — full order object
# Response 404 { "error": "Order not found" }
```

### PUT /orders/{orderId} — updateOrder/app.py:31-66
```python
# Path param: orderId
# Body (all fields optional — only send what's changing)
{ "price": 24.99, "description": "Wireless mouse (sale)", "category": "Electronics" }

# Response 200 — full updated order (ALL_NEW attributes)
# Errors: 400, 404
```

### DELETE /orders/{orderId} — deleteOrder/app.py:29-53
```python
# Path param: orderId

# Response 200
{ "message": "Order deleted", "orderId": "7c3a…" }
# Response 404 { "error": "Order not found" }
```

### POST /subscriptions — subscribe/app.py:18-30
```python
# Body
{ "email": "user@example.com" }

# Response 200
{ "message": "Subscription pending — check your email to confirm.", "email": "user@example.com" }
# Response 400 { "error": "A valid email is required" }
```

### DELETE /subscriptions — unsubscribe/app.py:18-46
```python
# Body (note: DELETE with body — must use fetch with body or curl -d)
{ "email": "user@example.com" }

# Response 200 (confirmed subscriber)
{ "message": "Unsubscribed", "email": "user@example.com" }
# Response 200 (pending — can't remove yet)
{ "message": "Subscription is pending confirmation and cannot be removed until confirmed.", "email": "user@example.com" }
# Response 404
{ "error": "No subscription found for this email", "email": "user@example.com" }
```

### GET /summary — generateSummary/app.py:26-61
```python
# No input

# Response 200
{ "url": "https://order-management-pdfbucket-vdcwkyh1jq2y.s3.amazonaws.com/summary-20260615T141000Z.pdf?X-Amz-…", "deletedOrderCount": 5 }
```
The URL is a pre-signed S3 GET URL valid for 3600 seconds. UI should open it in a new tab or provide a download link.

### POST /orders/analyze-image — analyzeImage/app.py:27-66
```python
# Body — raw base64 OR data-URL form (both accepted)
{ "image": "<base64-encoded JPEG or PNG>" }
# OR
{ "image": "data:image/jpeg;base64,<base64>" }

# Response 200
{
  "description":    "Wireless mouse, Computer, Electronics",  # top-3 label names joined
  "category":       "Mouse",     # first label whose name is in the price map
  "labels":         [{ "name": "Mouse", "confidence": 98.7 }, …],  # up to 10 at ≥70% confidence
  "suggestedPrice": 25.0
}
# Edge case — no label matches → suggestedPrice: 0.0, category: first label name
# Response 400 { "error": "image (base64) is required" }
# Response 400 { "error": "image is not valid base64" }
# Response 400 { "error": "Unsupported image format (use JPEG or PNG)" }
```

## Data flow

**Create order (standard path)**:
1. User fills description + price in the form → JS `POST /orders` with JSON body.
2. Lambda validates, generates UUID + timestamps, writes DynamoDB → returns 201 order object.
3. UI receives order object, appends it to the displayed list (or triggers a full list refresh).

**Create order via analyze-image (freestyle path)**:
1. User picks/takes a photo → JS reads file as base64 data-URL → `POST /orders/analyze-image`.
2. Lambda calls Rekognition `detect_labels` → returns description/category/suggestedPrice.
3. UI pre-fills the create-order form with those values. User reviews/edits price and description.
4. User submits form → standard `POST /orders` call (same as above). No order is created until the user confirms.

**Get-all / list**:
1. On page load (and after create/update/delete) → JS `GET /orders`.
2. Response `{"orders":[...],"count":N}` — orders already sorted newest-first (GSI `ScanIndexForward=False`). No client-side sorting needed.

**Update order**:
1. User clicks Edit → form pre-filled with current values (from list or `GET /orders/{orderId}`).
2. User edits → `PUT /orders/{orderId}` with only changed fields (or all editable fields).
3. Lambda returns updated object → UI replaces the row.

**Delete order**:
1. User clicks Delete → `DELETE /orders/{orderId}`.
2. Lambda deletes, fires EventBridge, returns `{"message":"Order deleted","orderId":"..."}` immediately.
3. UI removes the row. Email + S3 backup happen asynchronously — UI has no visibility into them.

**Subscribe/unsubscribe**:
1. User enters email → `POST /subscriptions`. UI shows the pending-confirmation message from the response body.
2. To unsubscribe → `DELETE /subscriptions` with email in the body. UI shows the message from the response.

**PDF summary**:
1. User clicks "Generate PDF Summary" → `GET /summary`.
2. Response contains `url` (S3 presigned) + `deletedOrderCount`. UI shows count and provides a clickable link/button to open the URL (in a new tab).

## Constraints & invariants
- `orderId`, `creationDate` are **immutable** after create — the update Lambda never touches them (`updateOrder/app.py:43-66` only sets `lastModifiedDate`, `price`, `description`, `category`).
- `price` must be a **number** (not a string, not a boolean) — `backend/createOrder/app.py:42-43`, `backend/updateOrder/app.py:48-50`. The UI must parse/validate before sending.
- `description` must be a **non-empty string** — `backend/createOrder/app.py:40-41`.
- `DELETE /subscriptions` sends the email in the **request body** (not query params) — `unsubscribe/app.py:22`. The `fetch` call must include `body: JSON.stringify({email})` even though the method is DELETE.
- The `gsiPartition` field (`"ORDER"`) is set by the backend; the client must never send it.
- Timestamps are `YYYY-MM-DDTHH:MM:SSZ` (UTC, second precision, Z suffix) — display-only from the client's perspective.
- CORS: every Lambda response already includes `"Access-Control-Allow-Origin": "*"` and API Gateway has OPTIONS methods. The client can use plain `fetch` with no special CORS configuration.
- The presigned PDF URL is valid for **3600 seconds** (`URL_EXPIRY_SECONDS` default in `generateSummary/app.py:11`). The UI should open it promptly or warn the user it's time-limited.
- Images for analyze-image must be JPEG or PNG; Rekognition rejects other formats with a 400.
- API Gateway base path includes the stage: `/prod` — so the full path is `{base}/orders`, not `{base}/prod/orders`.

## Integration points
- `frontend/index.html` (to be created) — single HTML file entry point; Amplify serves it as the root.
- Single JS `API_BASE_URL` config constant (to be created) — must be set to `https://bqmrrznt2a.execute-api.us-east-1.amazonaws.com/prod`. This is the only value that changes between local testing and production.
- For the analyze-image endpoint, the JS must use `FileReader.readAsDataURL()` or `readAsArrayBuffer()` + manual base64 encode. The Lambda accepts both raw base64 and `data:image/...;base64,...` prefixed strings (`analyzeImage/app.py:36-37`), so passing the `FileReader.readAsDataURL()` result directly works.
- `GET /summary` returns a URL string that the client opens (`window.open(url)` or an `<a href=url target=_blank>`). The client does not stream PDF bytes.

## Test coverage map
N/A — no existing test suite. The project uses manual end-to-end testing via the web client and curl. See `docs/cli-commands.md` for the curl commands used for backend verification.

## Findings

### Frontend scaffolding state
The `frontend/` directory does **not exist**. There is no `index.html`, no CSS file, no JS file, and no Amplify configuration (`amplify.yml`). The README mentions Amplify as the host and that the client calls REST APIs, but nothing has been scaffolded yet. This is a complete greenfield build.

### Deployed API base URL
From `memory/deployment.md` (verified 2026-06-15): `https://bqmrrznt2a.execute-api.us-east-1.amazonaws.com/prod`. This is the CloudFormation stack output named `ApiBaseUrl`. It is stable until the stack is deleted and recreated. The stack name is `order-management` in account `436772392606`, region `us-east-1`.

### Order object shape — what the UI renders
From `createOrder/app.py:46-57` and the GSI projection (ALL), every order has these fields from all CRUD APIs:
- `orderId`: string UUID (display as-is or truncate for readability)
- `creationDate`: ISO-8601 UTC string (e.g. `"2026-06-15T13:45:00Z"`) — display, not editable
- `lastModifiedDate`: ISO-8601 UTC string — display, not editable
- `price`: number (float) — editable
- `description`: string — editable
- `category`: string | absent — editable (added by freestyle flow; not required)
- `gsiPartition`: string (`"ORDER"`) — internal, do not display

### Unsubscribe edge case — DELETE with body
`DELETE /subscriptions` sends `{ "email": "..." }` in the request body. This is unusual. In vanilla `fetch`, it requires:
```js
fetch(`${API_BASE_URL}/subscriptions`, {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email })
})
```
Some HTTP clients drop bodies on DELETE — but `fetch` passes it through, and the Lambda reads `event["body"]` normally.

### Freestyle endpoint — analyze-image UI flow
The Rekognition endpoint does NOT create an order. The expected UI flow is:
1. Show a "Scan Item" button or camera/file input near the create-order form.
2. User selects an image → POST to `/orders/analyze-image`.
3. Response pre-fills the create form: `description` ← `response.description`, `price` ← `response.suggestedPrice`, `category` ← `response.category`.
4. Show the `labels` array as a confidence readout (optional but adds UX polish for the grader).
5. User confirms/edits and submits the normal `POST /orders` create form.
The Lambda's `analyzeImage/app.py:36-37` strips the `data:image/...;base64,` prefix if present, so using `FileReader.readAsDataURL()` and passing the full data-URL string works without client-side stripping.

### CORS
Every Lambda returns `"Access-Control-Allow-Origin": "*"`. API Gateway is configured with OPTIONS methods (MOCK integration) for all resources, per `template.yaml`/`darwin-progress.md` T9 spec. The Amplify-hosted client will be on a different origin (e.g. `https://main.d1234abcd.amplifyapp.com`) — CORS is already handled.

### Amplify hosting — what's needed
No Amplify app is configured yet. The expected approach (per `architecture-decisions.md` and `CLAUDE.md`):
- Zip the `frontend/` directory (or drag-and-drop it in the Amplify console) to create a manual deploy.
- Alternatively, connect the GitHub repo and tell Amplify to serve the `frontend/` subdirectory.
- No build step needed — static files only.
- No `amplify.yml` is required for a static site with no build step (Amplify serves `index.html` directly).
- After deploy, the Amplify URL (`https://main.d….amplifyapp.com`) becomes the client's origin.

### PDF summary — no bucket-level public access needed
The PDF is returned as a **pre-signed URL** (not a public object). The client must open the URL in a browser tab or provide a download link — it cannot re-embed the PDF in the page without CORS headers on the S3 object. A `window.open(data.url, '_blank')` or `<a href="..." target="_blank">` is the correct approach.

### HTTP status codes the UI must handle
| Endpoint | Success | Errors |
|---|---|---|
| POST /orders | 201 | 400 |
| GET /orders | 200 | — |
| GET /orders/{id} | 200 | 400, 404 |
| PUT /orders/{id} | 200 | 400, 404 |
| DELETE /orders/{id} | 200 | 400, 404 |
| POST /subscriptions | 200 | 400 |
| DELETE /subscriptions | 200 | 400, 404 |
| GET /summary | 200 | — |
| POST /orders/analyze-image | 200 | 400 |

All error responses have shape `{ "error": "<message>" }`.

## Open questions
- The `gsiPartition` field (`"ORDER"`) leaks into API responses from DynamoDB reads. The UI should silently ignore it, but it will be present in the raw JSON — confirmed from the Lambda code, not yet verified in a live API call.
- Amplify setup specifics (whether to use GitHub auto-deploy or a manual zip deploy) are not yet decided. The architecture decision says Amplify, but the method is deferred to build time.
- No existing `frontend/` scaffolding means the entire UI (HTML structure, CSS styling, JS logic) is to be created from scratch. No prior art to preserve or extend.
- The `analyzeImage` endpoint was added to the CloudFormation template (T9 COMPLETE) and the stack is deployed (`deployment.md` says "verified CRUD/backup/PDF" but notes "NOT yet validated: Rekognition `analyzeImage` (needs a real photo — best via the UI)"). The endpoint exists in the deployed stack but has not been exercised end-to-end.

## Method
- Files read: 14
  - `memory/deployment.md` — live API base URL, account, region, bucket names, SNS ARN
  - `memory/architecture-decisions.md` — locked decisions: EventBridge fan-out, Rekognition freestyle, Amplify client, Lambda granularity, DynamoDB GSI design
  - `docs/api-contract.md` — canonical endpoint contracts for all 9 endpoints
  - `docs/resource-list.md` — CloudFormation resource inventory, Lambda table
  - `.darwin/darwin-progress.md` — implementation plan with all task details and execution log
  - `backend/createOrder/app.py` — order object shape, field names, Decimal/float serialization
  - `backend/getAllOrders/app.py` — list response shape, GSI query
  - `backend/getOrder/app.py` — single-item response, 404 shape
  - `backend/updateOrder/app.py` — partial update, ALL_NEW response, editable fields
  - `backend/deleteOrder/app.py` — delete response, EventBridge emit
  - `backend/subscribe/app.py` — subscribe request/response
  - `backend/unsubscribe/app.py` — unsubscribe request/response, 3 possible responses
  - `backend/generateSummary/app.py` — PDF URL response shape, expiry
  - `backend/analyzeImage/app.py` — analyze-image request/response, data-URL strip, price map
  - `README.md` — architecture overview, API table, repo layout
- Searches:
  - `find frontend/` → 0 files (no frontend directory)
  - `find docs/` → 5 files
  - `find backend/` (names only) → 10 Lambda directories confirmed
- Dead ends:
  - Looked for `amplify.yml` — does not exist
  - Looked for any `frontend/` scaffolding — directory does not exist at all
- External tools used: none
