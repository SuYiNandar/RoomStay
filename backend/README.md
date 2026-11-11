# RoomStay API

Express REST API for the RoomStay rental system. It uses Prisma and a Supabase Postgres database, and follows the same processes as the JavaScript Next.js frontend:

1. Accounts and partner applications
2. Listings and moderation
3. Browse, search, and favorites
4. Messaging
5. Optional viewing appointments
6. Bookings and room status
7. Reservation deposit evidence
8. Reviews, reports, notifications, and audit records

Payment happens outside RoomStay. The API stores the deposit amount, deadline, payment instructions, uploaded evidence, and verification result. It does not process a bank transfer.

The website in `../frontend` is JavaScript and calls this API.

## Run

Create a Supabase project and set `DATABASE_URL` in `.env` to its Postgres connection string (direct connection or session pooler, port 5432).

```sh
cd backend
cp .env.example .env
npm ci
npm start
```

In development, the API listens on http://localhost:4000, initializes tables without accepting destructive schema changes, and seeds demo data. If `DATABASE_URL` is not set, it uses a local PostgreSQL-compatible embedded database. Production requires an external database and never initializes tables or seeds demo accounts on startup.

Demo password for every account: `password123`

| Role | Email |
| --- | --- |
| Renter | renter@roomstay.test |
| Partner | partner@roomstay.test |
| Applicant | applicant@roomstay.test |
| Admin | admin@roomstay.test |

To use Docker Postgres instead of Supabase, start the database and set `DATABASE_URL` in `.env` to `postgresql://roomstay:roomstay@localhost:5432/roomstay`.

```sh
docker compose up -d
npm start
```

## Checks

```sh
npm test
```

## Main behavior

- Public signup creates a Normal User. Admin accounts are seeded, not registered.
- A user becomes a Partner only after an admin approves the application. Suspension hides published listings and blocks new partner activity. Existing bookings and history stay.
- Guests can search and open published properties. Favorites, messages, viewings, bookings, reviews, reports, and partner applications require login.
- A viewing decision never changes a booking or a room. Unavailable rooms cannot be viewed.
- A booking request stays `PENDING` and does not reserve the room. Partner approval requires a deposit amount and a future deadline, sets the room to `RESERVED`, and declines other pending requests for that room.
- The renter uploads evidence before the deadline. Partner verification sets the booking to `CONFIRMED` and leaves the room reserved. Rejection before the deadline returns the booking to `DEPOSIT_PENDING`. Rejection after the deadline, or a missed deadline, expires the booking and returns the room to `AVAILABLE` when nothing else holds it.
- Starting the rental sets the booking to `ACTIVE` and the room to `RENTED`. Completing it sets the booking to `COMPLETED` and returns the room to `AVAILABLE`. One review is allowed after completion.
- A partner can record a refund only after cancellation. The refund record does not move money.


## Render / Supabase deployment

Set the service root to `backend`, build with `npm ci --include=dev`, and start with `npm start`. The install step generates Prisma Client. Set `NODE_ENV=production`, `DATABASE_URL`, a random `JWT_SECRET` of at least 32 characters, and `FRONTEND_ORIGIN` to the exact HTTPS Vercel origin (no trailing slash). Set `UPLOAD_DIR` to the mounted persistent disk path described below. Render supplies `PORT`. `/api/health` checks database connectivity.

Initialize a new, empty database explicitly with `npm run db:push` using a direct or session-pooler connection. Do not add `--accept-data-loss`; review changes and back up any existing database. There is no versioned migration history yet. For production, provision an admin securely instead of running the demo seed. `npm run seed` intentionally creates the documented demo accounts and should only target a disposable demo database; it now loads `.env` explicitly.

Uploads use `UPLOAD_DIR` (default: the absolute `backend/uploads` directory in development). Production requires an absolute `UPLOAD_DIR`; configure it inside an attached Render persistent disk, for example mount `/var/data` and set `UPLOAD_DIR=/var/data/roomstay-uploads`. This check cannot prove that a disk is mounted: verify persistence across a redeploy. The free ephemeral filesystem is unsuitable. Keep one backend instance with this local-storage approach; horizontal scaling requires shared private object storage.

All upload forms send multipart bytes. Photos/evidence accept JPEG or PNG; application ID and ownership documents also accept PDF. The API checks MIME against file signatures, limits each file to 8 MiB, accepts at most eight listing photos, requires files, and generates storage names. Application documents use existing application IDs and MIME fields without schema changes. Do not upload active formats such as SVG/HTML.

Only `/uploads/listings/*` is public. Evidence is streamed through authenticated `/api/evidence/:id/file`, restricted to the booking renter, property owner, or admin. Application documents use authenticated `/api/partner-applications/:id/documents/:kind`, restricted to the applicant or admin. Responses disable caching. Clients fetch with authorization headers and render/download temporary blob URLs; API JSON never returns private storage paths. Legacy `uploads/<generated-name>` evidence remains readable through the authorized route if the file is copied into the configured upload root. Previous filename-only application documents cannot be recovered.

Copy existing files to the disk before switching `UPLOAD_DIR`, retaining the directory structure. Back up both database and files and test restoration. New files are removed on rejected database writes; staged files are removed when requests finish. Crashes can leave orphan files, so storage monitoring and an offline reconciliation/retention procedure are still needed. Do not put the private upload directory behind public static hosting or a CDN. Files are not malware-scanned; documents download as attachments. Disk storage is a compatible single-instance deployment option, not shared storage.

See [the technical audit](../docs/TECHNICAL_AUDIT.md) before deployment. Production readiness has not been verified against a real Supabase, Render, or Vercel service.
