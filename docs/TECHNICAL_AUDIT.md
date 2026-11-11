# RoomStay technical audit — deployment blocker fixes

Updated: 11 November 2026. This report supersedes the initial audit's findings where fixes are described below.

**Status: Still blocked for production deployment.** The requested application fixes are implemented and local verification passes. Deployment still needs durable upload storage, production credentials/account review, remaining dependency remediation or an explicit risk decision, and staging/browser verification. No deployment was performed.

The Prisma schema is byte-for-byte unchanged from the start of this work. `Property.facilities` remains `String[]`; no tables or architecture were added. Existing page layouts are retained. `.env` was not edited or committed and remains ignored. Integration tests used temporary embedded databases; the configured Supabase project received only read-only checks during this work.

## 1. Changes and verification

| Priority | Result | Evidence / limits |
|---|---|---|
| Private payment evidence | Fixed | `/uploads` no longer exposes the private upload tree. Evidence is fetched through `/api/evidence/:id/file`, authorized against the booking renter, property owner, or admin. API JSON contains an authorized endpoint, not the storage path. Tests assert guest 401, unrelated user 404, authorized byte-for-byte retrieval, and private/no-store caching. |
| Application documents | Fixed for new submissions | Both actual files are required. Applicant/admin-only download endpoints resolve deterministic paths using existing application ID/MIME fields. Admin review includes authenticated downloads. Guest and unrelated-user denial and file contents are tested. Legacy metadata-only documents cannot be reconstructed. |
| Listing photos / uploads | Fixed | Frontend sends multipart bytes, API stores generated filenames, and public photo URLs resolve against the backend origin. Next image allowlist is limited to that origin's listing path. Admin photo names link to the images. Existing photos can only be retained from the same owned listing. |
| Validation / cleanup | Fixed within stated scope | JPEG/PNG signatures must match declared MIME; application documents may also be PDF. Limit: 8 MiB per file, eight listing photos, bounded multipart fields/parts. Missing files, spoofed types, oversized files and arbitrary retained paths are rejected. Private downloads reject path escapes and symlink escapes. Rejected writes clean up new files; request close cleans staging files. File signatures are not full image/PDF decoding or malware scanning. |
| Dependency security | Partly fixed | Next and compatible dependencies upgraded; all critical findings removed. Three backend high and seven frontend moderate findings remain, detailed below. No forced major upgrades. |
| Booking concurrency | Implemented; local tests pass | A shared PostgreSQL property-row `FOR UPDATE` lock is acquired before mutable booking state is re-read in `ReadCommitted` Prisma transactions. Approval, decline, evidence upload/verification/rejection, start, completion, cancellation, refunds, reviews, expiry and room availability use the same lock. Competing approvals and duplicate transitions commit once in tests. Real multi-connection PostgreSQL stress testing remains outstanding. |
| Renter / partner controls | Fixed | Booking details include allowed cancellation with confirmation, renter property-report submission, and refund visibility. Partner details permit existing refund records to be recorded/updated only for cancelled bookings. Settlement remains outside RoomStay. Existing models/endpoints reused. Report labels are resolved server-side against an existing target. |
| Public reviews | Fixed | Public detail/review UI reads backend reviews, including renter display names; catalog rating/count includes visible reviews. Hide/restore changes are tested. |
| Admin counts | Fixed | Admin-only bookings endpoint supplies all bookings to the admin snapshot; dashboard subscribes to booking changes. Tests cover admin authorization, active bookings and the frontend snapshot path. |
| Cross-user updates | Fixed with bounded polling | Authenticated data, public catalog/reviews and payment chats refresh about every 15 seconds and on focus. Private snapshot commits check session token/generation; logout or a newer local mutation invalidates an in-flight snapshot. This is eventual polling, not websocket delivery. Suspended access is refreshed from `/api/me`. |

Room and booking rules remain: `AVAILABLE → RESERVED → RENTED → AVAILABLE`; `PENDING → DEPOSIT_PENDING → VERIFICATION_PENDING → CONFIRMED → ACTIVE → COMPLETED`, with existing decline/cancel/expire/rejection paths. A repeated open booking request for the same renter/property now returns 409; different renters may still submit pending requests, with only one approved hold. Invalid and duplicate state transitions return conflicts without repeated transaction side effects.

## 2. Executed checks

| Check | Result |
|---|---|
| Backend `npm test` | **PASS: 29 tests, 0 failures, 0 skipped.** Express servers start and serve actual HTTP requests against isolated Prisma/PGlite databases. |
| Backend `npx prisma validate` | **PASS.** Existing Prisma 6 package configuration deprecation warning remains. |
| Frontend `npm test` | **PASS: 58 tests, 0 failures, 0 skipped.** Includes new multipart/action/private-fetch/admin-snapshot/session-race tests. |
| Frontend `npm run lint` | **PASS: no errors or warnings.** |
| Frontend `npm run build` | **PASS: Next 16.4.6 production build, 68 generated pages.** |
| Git whitespace check | **PASS:** `git diff --check`. |
| Secrets / schema | `.env` and upload files ignored; `.env` is not tracked. Schema hash matches the start of this task. |
| Supabase read-only check | **PASS:** configured session pooler uses port 5432, `SELECT 1` and User/Property counts succeed: 12 properties, 5 users, 4 demo-domain accounts. No seed, reset, schema push or remote write performed in this task. |
| Browser interaction | **NOT RUN:** computer-use inventory returned no connected browsers. Prior audit also lacked browser automation access. API/component tests do not prove browser hydration, downloads, responsive layout or cross-origin production behavior. |
| Real concurrent PostgreSQL transactions | **NOT RUN:** local tests use PGlite with a single connection. Concurrent HTTP tests verify guards/results but do not reproduce independent PostgreSQL connection scheduling. |

Workflow assertions cover renter booking creation/ownership, partner approval, competing approvals, evidence upload/reject/resubmit/verify, rental start/completion, duplicate transitions, cancellation/release, reports/admin moderation, external refund records, private document access, admin access, public review moderation, notifications, messages, viewing decisions and search. Seed repeatability is tested only in disposable local databases.

Search checks passed for Apartment, Condo, House, Dormitory, **Pet friendly → Garden House**, **Near University → Campus Studio Dorm** (`rangsit-campus-dorm`) and **Near BTS/MRT → Cozy Condo Near BTS** (`cozy-condo`), plus combined filters and URL serialization.

Saved results are in `docs/audit-evidence/blocker-*`. Older files in that directory describe the initial audit and are historical, not current results.

## 3. Dependency audit

`npm audit` was run for each application before and after upgrades. Counts are affected package entries, not counts of distinct vulnerabilities.

| Scope | Before | After | After, `--omit=dev` |
|---|---|---|---|
| Backend | 6 high, 1 moderate | **3 high**, 0 critical | **3 high**, 0 critical |
| Frontend | 1 critical, 4 high, 7 moderate | **7 moderate**, 0 high/critical | **0 vulnerabilities** |

The original Next.js 16.3.4 package had critical advisories including [next/og ImageResponse RCE, GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [SVG image optimization RCE, GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw), and [`use cache` typed-array RCE, GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr). Next and eslint-config-next are now pinned to **16.4.6**, with sharp **0.35.5**. Compatible backend lockfile updates include multer **2.5.0**, express **4.22.3**, body-parser **1.20.9**, zod **4.6.7**, and Prisma/client **6.19.3**. Tests/build/lint ran after updates.

Remaining backend findings are the `prisma → @prisma/config → deepmerge-ts` chain: [recursive-object stack exhaustion, GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). npm recommends a Prisma **7.10.1 major upgrade**. That migration was not forced, and deepmerge was not overridden across its major boundary. Although the merge path is Prisma configuration tooling, npm also reports it in the omit-dev tree; this report does **not** claim a clean backend runtime audit or prove non-exploitability.

Remaining frontend findings are the TypeScript ESLint dependency chain through minimatch: [globparts amplification DoS, GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). They are absent from the omit-dev audit. `npm audit fix --dry-run` proposed zero additions/changes/removals and retained the seven findings. A compatible upstream fix or a separately tested tooling upgrade is still needed.

## 4. Exact remaining deployment blockers

### Supabase

- Connectivity works; do not initialize a new Prisma project or reset this database. Keep the session-pooler URL on **5432** as backend `DATABASE_URL` and use URL-encoded password characters. The backend adds TLS requirements for Supabase.
- Rotate the database credential previously pasted into chat and update local/Render secret settings privately. Review the four existing demo-domain accounts; remove inappropriate demo access or replace credentials and provision the intended production admin. No accounts were modified automatically.
- Run the booking concurrency matrix against a **disposable staging PostgreSQL database** with multiple independent connections: competing approval, duplicate verification/start/completion/cancel, verification vs cancellation, and expiry vs upload. Check one holder, correct room status and one set of notifications/audit/deposit records.
- There is no versioned migration history. Establish a reviewed baseline/migration procedure before future schema changes; do not run destructive reset or automatic production seeds.

### Render

- Configure service root `backend`, build `npm ci --include=dev`, start `npm start`, health path `/api/health`.
- Set `NODE_ENV=production`, session-pooler `DATABASE_URL`, a random `JWT_SECRET` of at least 32 characters, and exact HTTPS `FRONTEND_ORIGIN` without trailing slash. Render supplies `PORT`.
- **Attach a paid persistent disk** (for example `/var/data`) and set `UPLOAD_DIR=/var/data/roomstay-uploads`. Production refuses a missing/relative upload path, but cannot prove that a persistent disk is mounted. The default ephemeral filesystem is not safe for evidence or identity documents. [Render persistent disk documentation](https://render.com/docs/disks).
- Copy existing uploads into that root, retaining paths, before changing configuration. Test upload/download after restart and redeploy; back up both files and database and test restoration. No persistent disk was provisioned or verified here.
- Keep a **single backend instance** with this filesystem approach. Horizontal scaling requires shared private object storage, which was deliberately not introduced. Do not expose the private tree via a web server/CDN. Database rows and filesystem writes are not one atomic resource: rejected writes are cleaned up, but process crashes can leave orphan files; plan retention/reconciliation and storage monitoring.
- Resolve the remaining high dependency findings or make a documented, reviewed release-risk decision before public production use.

### Vercel

- Configure root `frontend`, build `npm run build`, and `NEXT_PUBLIC_API_URL=https://<render-service-host>` **at build time**. Rebuild after changing it; verify no requests go to localhost. Align Render's CORS origin to the final Vercel/custom-domain origin. Arbitrary preview origins are not automatically trusted.
- Verify listing image optimization through the configured backend origin and authenticated blob retrieval/download for evidence/documents. Do not expose tokens in query strings or public Next image URLs.
- Run the browser checklist below against deployed staging before launch. No Vercel or Render deployment was performed.

## 5. Other retained limitations

- Legacy filename-only application documents/photos contain no bytes to recover. Existing generated evidence files work through the private endpoint if present under the upload root; missing/absolute legacy paths may require a controlled file migration. Do not invent replacement documents.
- The public catalog still falls back to static demo data on API failure, and metadata for non-seeded property pages can be stale. Polling is eventually consistent and can fail during outages; it is not a guaranteed realtime stream. Large datasets need pagination and more efficient refreshes.
- Broader validation inconsistencies remain: some text inputs can produce a generic 500 on wrong types; frontend/backend numeric listing and password rules differ; very small positive deposit amounts can round to zero. Upload/multipart errors now return client errors, and report inputs are bounded.
- Favorites for hidden/suspended properties, viewing reschedule acceptance/date-time edge cases, and servicing existing rentals after partner suspension retain earlier business limitations. No new business rules were invented to resolve them.
- Rate limiting, robust abuse controls, file malware scanning, crash-orphan reconciliation and production monitoring are not implemented. PDF signature checks do not certify a document as safe; documents download as attachments.
- Existing embedded database upgrade SQL differs from a fresh schema in some payment-chat foreign keys. No existing local database migration was attempted. Production startup does not seed or push schema; demo seeding is not production account provisioning.

## 6. Manual browser checks still required

1. Use separate renter/partner/admin browser profiles. Complete request → approval → real PNG/JPEG evidence → verification → start → completion; verify room states and buttons. Check double-click actions do not duplicate successful transitions.
2. Upload listing photos, publish as admin, and view them on search/property pages. Keep/remove/add photos while editing a draft. Try missing, invalid and oversized files and confirm readable errors.
3. Submit both application documents; download as applicant/admin via authorized endpoints. Try direct URLs while logged out and from another user. Inspect network responses to ensure no raw private path or token URL is exposed. Check seeded legacy documents show a clear unavailable-file error.
4. Preview evidence as its renter, partner and admin; deny another renter. Confirm the former public `/uploads/...` evidence route fails. Check logout/account switching does not display old private previews or admin data.
5. Cancel pending/deposit/confirmed bookings; verify release and rejected duplicate actions. On a cancelled booking record a refund as partner and view it as renter. Verify no money-transfer promise is displayed.
6. Submit a renter report, review it as admin, and verify notification delivery. Confirm active-rental/dashboard counts and public review hide/restore update across profiles within roughly 15 seconds or on focus. Check payment-chat lists and threads similarly.
7. Test all seven search categories, combined filters, reload/back navigation, mobile layout, keyboard navigation and the filters dialog.
8. On deployed staging verify CORS, HTTPS, image loading, file download behavior, persistence after redeploy, production admin access, account switching, and concurrent booking requests with independent PostgreSQL connections.

## 7. Files changed in this implementation

This inventory is relative to the already-modified working tree at the start of the blocker-fix task, not a claim that every `git status` entry was created by this task. Prior audit changes were preserved.

- `backend/.env.example`
- `backend/README.md`
- `backend/package-lock.json`
- `backend/src/app.js`
- `backend/src/config.js`
- `backend/src/http.js`
- `backend/src/serialize.js`
- `backend/src/services/accounts.js`
- `backend/src/services/bookings.js`
- `backend/src/services/catalog.js`
- `backend/src/services/listings.js`
- `backend/src/services/locking.js`
- `backend/src/services/moderation.js`
- `backend/src/services/shared.js`
- `backend/src/uploads.js`
- `backend/tests/audit.test.js`
- `backend/tests/flow.test.js`
- `docs/TECHNICAL_AUDIT.md`
- `docs/audit-evidence/blocker-backend-after.json`
- `docs/audit-evidence/blocker-backend-runtime.json`
- `docs/audit-evidence/blocker-backend-tests.txt`
- `docs/audit-evidence/blocker-frontend-after.json`
- `docs/audit-evidence/blocker-frontend-build.txt`
- `docs/audit-evidence/blocker-frontend-lint.txt`
- `docs/audit-evidence/blocker-frontend-runtime.json`
- `docs/audit-evidence/blocker-frontend-tests.txt`
- `docs/audit-evidence/blocker-prisma-validate.txt`
- `frontend/README.md`
- `frontend/next.config.mjs`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/src/components/admin-dashboard.jsx`
- `frontend/src/components/admin-listings-review.jsx`
- `frontend/src/components/admin-partner-application-review.jsx`
- `frontend/src/components/booking-actions.jsx`
- `frontend/src/components/booking-details.jsx`
- `frontend/src/components/evidence-slip.jsx`
- `frontend/src/components/partner-application-form.jsx`
- `frontend/src/components/partner-booking-review.jsx`
- `frontend/src/components/partner-listing-form.jsx`
- `frontend/src/components/payment-chat.jsx`
- `frontend/src/components/private-file-link.jsx`
- `frontend/src/components/property-reviews.jsx`
- `frontend/src/lib/api.js`
- `frontend/src/lib/live-actions.js`
- `frontend/src/lib/live-store.js`
- `frontend/src/lib/live.js`
- `frontend/src/lib/mock-auth.jsx`
- `frontend/src/lib/published-listings.js`
- `frontend/tests/live-integration.test.mjs`
- `docs/audit-evidence/blocker-supabase-readonly.txt`
