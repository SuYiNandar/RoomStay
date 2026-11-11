# RoomStay

RoomStay is a university project for a Condo & Apartment Rental Management System.

The current application is split into a Next.js frontend written in JavaScript and an Express API. The API in `backend/` implements the rental rules with Prisma and stores data in Supabase Postgres. RoomStay records deposit instructions and payment evidence only; it does not move money.

Public repository: https://github.com/pyaeyt/RoomStay

## Last update

30 October 2026

- Login asks for Renter, Partner, or Admin first. The page does not show a demo password.
- Register asks for full name, email, and password. It does not ask for a phone number.
- A booking stays pending until the partner approves it. Deposit instructions appear only after approval; renters confirm bank details directly with the Partner.
- The renter pays outside RoomStay and uploads a JPG or PNG of the transfer slip. That photo is stored and shown on the booking, on the partner review, and in the payment chat.
- Facilities stay on the Property row as a list of strings. There is no separate Facility table.
- A clickable GUI prototype is at http://localhost:3000/gui-prototype.html when the website is running.

## Current implementation

- `frontend/` is the Next.js website, written in JavaScript. Its screens cover processes 1.0–8.0 and call the API.
- `backend/` is the Express REST API. Its database is Supabase Postgres, or a local Postgres database when `DATABASE_URL` is empty.
- `docs/` contains project documentation, diagrams, ERD, and flow references.

## Important business-flow note

The finalized booking flow includes deposit and payment-evidence verification:

1. Renter submits a booking request.
2. Partner reviews the request.
3. If approved, the booking moves to the deposit stage and the room becomes reserved.
4. The renter pays externally and uploads a photo of the transfer slip.
5. The Partner verifies or rejects the evidence.
6. Verified bookings become confirmed.
7. Rental start later marks the room as rented.
8. Rental completion makes the room available again.

RoomStay does not process bank transactions. The system records deposit instructions and payment evidence only.

## Source-of-truth priority

1. Final project requirements
2. Final ERD
3. Final booking flowchart
4. Final partner onboarding flowchart
5. Final UI screenshots

## Run the website

The website is JavaScript. From `frontend/`:

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:3000.

## Run the API with Supabase

Create a Supabase project, then copy its Postgres connection string into `backend/.env` as `DATABASE_URL`. Use the direct connection or the session pooler on port 5432. Supabase is the database; development startup initializes tables. Production requires explicit schema initialization and does not seed demo accounts.

```sh
cd backend
cp .env.example .env
npm ci
npm start
```

Open http://localhost:4000/api/health. In development, if `DATABASE_URL` is empty, the API uses a local database instead of Supabase and seeds the demo accounts. Password for every account is `password123`:

| Role | Email |
| --- | --- |
| Renter | renter@roomstay.test |
| Partner | partner@roomstay.test |
| Applicant | applicant@roomstay.test |
| Admin | admin@roomstay.test |

Docker Postgres in `backend/docker-compose.yml` is only a local stand-in. Put that URL in `DATABASE_URL` if you are not using Supabase.

```sh
cd backend
npm test
```

## Verify the frontend

```sh
cd frontend
npm run lint
npm run build
```


## Technical audit — 11 November 2026

See [docs/TECHNICAL_AUDIT.md](docs/TECHNICAL_AUDIT.md) for test results, known workflow gaps, safe fixes, and deployment blockers. See [backend deployment setup](backend/README.md#render--supabase-deployment) for production environment and schema initialization. The application is not yet ready for real payment evidence or identity documents.
