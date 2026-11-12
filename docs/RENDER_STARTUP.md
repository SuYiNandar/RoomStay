# Render startup and redeployment

Use a Node Web Service with root directory `backend`, build command
`npm ci --include=dev`, start command `npm start`, and health check `/api/health`.
The install script generates Prisma Client. No build or start command should seed
production or perform schema updates. Render supplies `PORT`; the app binds it on
`0.0.0.0` (4000 remains the local fallback).

Required environment:
- `NODE_ENV=production`
- `DATABASE_URL`: Supabase session pooler, port 5432, with a URL-encoded password.
  Supabase URLs default to `sslmode=require`. Do not configure `sslmode=disable`.
- `JWT_SECRET`: a non-default random secret of at least 32 characters.
- `FRONTEND_ORIGIN=https://room-stay.vercel.app` (no trailing slash).
- `UPLOAD_DIR=/var/data/roomstay-uploads`, with a persistent disk mounted at
  `/var/data`. An absolute path alone does not prove persistence.

## What changed

Previously `ensureDatabase()` always launched a Prisma schema-alteration subprocess,
including in production. It had no timeout and passed SQL through an `input`
option unsupported by asynchronous `execFile`, leaving stdin open. It also omitted
`--schema`; the installed CLI rejects that invocation immediately, so this alone
is not proof of the observed Render hang. The actual stalled step remains
unconfirmed without deployment logs.

Production now normalizes the external URL without subprocesses or schema writes,
then explicitly connects Prisma and executes read-only `SELECT 1`. Each production
startup stage has a 30-second deadline; failure exits with code 1, without waiting
for an unresponsive engine to disconnect. Connection/pool timeouts default to
10 seconds when absent or disabled. Existing positive URL timeout settings remain
valid, but the startup deadline still applies. Production cannot use PGlite or
import/run the seed module. Development keeps embedded initialization, schema
setup, and seeding; its external schema subprocesses now have finite deadlines
and correctly closed stdin.

Logs identify start, completion, elapsed time, and failure for configuration,
database preparation, Prisma import/connect/query, app/upload-directory import,
app creation, and listen. Failure logs omit raw exceptions and connection URLs;
Prisma codes such as P1000 (authentication) and P1001 (unreachable database) are
retained. A STARTUP_TIMEOUT identifies a stage exceeding its deadline.

## Redeploy

1. Commit/push these changes to the service's linked branch, excluding `.env`.
2. Verify the service root, commands, environment, and persistent disk above.
3. Select Manual Deploy → Deploy latest commit in Render.
4. Inspect `[startup]` logs. Expect each stage to complete, followed by
   `RoomStay API listening ...`. If a stage fails, resolve that specific error;
   do not seed, reset the database, or increase the port-scan timeout as a workaround.
5. Request `/api/health` and confirm HTTP 200. Test login and a property read.

No Render redeploy or production database mutation was performed by this change.
