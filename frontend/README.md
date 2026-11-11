# RoomStay frontend

Next.js App Router frontend for the Express API in `../backend`. Accounts begin as `USER`; partner access comes from an approved application. Payments happen outside RoomStay.

## Local setup

Use Node.js 20.9 or newer. Start the backend first, then:

```sh
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. `NEXT_PUBLIC_API_URL` is the backend origin, without `/api` or a trailing slash. Set it before building for Vercel; the default is localhost:4000.

## Verification

```sh
npm run lint
npm run build
node --test tests/*.mjs
```

There is no frontend `npm test` script. The tests include legacy mock-store tests and search/component checks; they do not constitute a browser end-to-end suite.

## Implementation and limitations

Pages cover public listings/search, renter bookings/viewings/favorites/messages/notifications/profile, partner applications/listings/booking management/reviews, and admin moderation/users/audit logs/payment chat. The frontend sends live API requests via `src/lib/api.js` and `live-actions.js`. Files with `mock-` names also adapt the live in-memory stores; they are not all unused code.

The public catalog retains static fallback data on API failure. Authenticated snapshots and public catalog/reviews refresh approximately every 15 seconds and on focus; this is polling, not push delivery. Login/logout and local mutations invalidate pending private snapshots. Listing photos, application documents, and payment evidence submit actual multipart file bytes. Private evidence/documents are fetched with authorization headers rather than public links. Public reviews read the backend; admin snapshots include all bookings for counts. Booking detail pages expose cancellation and renter report submission. Cancelled bookings show refund records; partners can record external settlements using the existing refund API.

Set `NEXT_PUBLIC_API_URL` to the HTTPS Render origin before the Vercel build. Uploaded listing images are loaded from that origin via a narrowly scoped Next image allowlist; changing the origin requires rebuilding. Private documents never pass through the public Next image optimizer. See the audit for browser checks and remaining dependency findings.

Search categories and other filters use URL query parameters. Property facilities remain a string array; availability is `Property.roomStatus`, with no separate Room table.

See [the technical audit](../docs/TECHNICAL_AUDIT.md) for verified results, remaining limitations, and deployment requirements. Existing screenshots, presentations, and the static HTML prototype are reference artifacts and may differ from current behavior.
