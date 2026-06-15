# Frontend Web Client

Single-page tabbed dashboard (Orders / Notifications / PDF Summary) built with
plain HTML/CSS/JS — no framework, no build step. It only calls the REST APIs
and displays the results; it contains no backend or business logic.

## File structure

```
frontend/
  index.html          Nav + four panels (Orders, Inventory, Notifications, PDF Summary)
  css/styles.css       Industrial ops-console theme (IBM Plex, acid-lime accent)
  js/config.js         API_BASE_URL — the only environment-specific value
  js/api.js            All fetch helpers; returns { ok, status, data }
  js/orders.js         Orders tab: create form / image scan / order-detail panel / edit
  js/inventory.js      Inventory tab: Show inventory → listOrders → rows
  js/notifications.js  Subscribe / unsubscribe
  js/summary.js        Generate PDF summary, render presigned link
  js/app.js            Tab switching
```

## Configuration

The client points at the API Gateway invoke URL via a single constant in
`js/config.js`:

```js
const API_BASE_URL = "https://bqmrrznt2a.execute-api.us-east-1.amazonaws.com/prod";
```

This is the only value to change if the API is redeployed under a new URL.

## Features

The client has four tabs: **Orders**, **Inventory**, **Notifications**, and
**PDF Summary**.

- **Orders tab** — contains the create form and the image-scan widget. After a
  successful create (`POST /orders`) or update (`PUT /orders/{id}`), the client
  takes the returned `orderId` and calls `GET /orders/{id}` (getOrder) to render
  that single order in an "Order detail" panel. The panel includes an
  "Edit this order" button that loads the order back into the form for update,
  and a "Delete this order" button that calls `DELETE /orders/{id}` and hides
  the panel. The Orders tab does **not** show the full order list.
- **Inventory tab** — a "Show inventory" button calls `GET /orders` (listOrders)
  and renders all orders newest-first. Each row has two actions:
  - **Edit** — turns the row's description, price, and category into inputs
    edited in place; Save calls `PUT /orders/{id}` and re-renders the row with
    the updated values; Cancel restores the row.
  - **Delete** — calls `DELETE /orders/{id}`, then removes the row. Deletion's
    email notification and S3 backup happen asynchronously server-side and are
    invisible to the client.
- **Image scan (freestyle)** — "Scan item" uploads a JPEG/PNG to
  `POST /orders/analyze-image` (Rekognition). The detected description,
  suggested price, and category pre-fill the create form; the user reviews and
  edits before confirming with a normal create. Detected labels + confidence
  are shown for transparency.
- **Notifications** — subscribe / unsubscribe an email
  (`POST` / `DELETE /subscriptions`). The backend's exact response message is
  shown, including the pending-confirmation and not-found cases.
- **PDF summary** — `GET /summary` returns a presigned S3 URL (valid ~1 hour);
  the client renders it as an "Open PDF" link that opens in a new tab. The URL
  is shown in the page, never logged.

## Deploy to AWS Amplify (manual zip)

No build step — Amplify serves the static files directly.

1. Zip the contents of the `frontend/` directory so that `index.html` is at the
   root of the zip (not nested inside a `frontend/` folder):
   ```bash
   cd frontend && zip -r ../frontend.zip . && cd ..
   ```
2. In the AWS Amplify console: **Deploy without Git** → **Drag and drop** →
   drop `frontend.zip` → **Save and deploy**.
3. Amplify publishes the site and returns a URL like
   `https://<branch>.<app-id>.amplifyapp.com`.
4. Record that URL here and in the submission document. To update the site
   later, re-zip and drop the new zip into the same Amplify app.

**Deployed client URL:** _<paste the Amplify URL here after first deploy>_

> Note: CORS is already handled on the backend — every Lambda returns
> `Access-Control-Allow-Origin: *` — so the Amplify-hosted origin can call the
> API directly.
