<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1292a787-a31d-4ade-b720-fddd9dff999b

## Run Locally

**Prerequisites:**  Node.js and Docker

### 1. Start infrastructure (Postgres + pgvector, Redis, MinIO)
```bash
docker compose up -d
```

### 2. Backend
```bash
cd backend
npm install
npm run db:push   # creates the users + sessions tables
npm run db:seed   # inserts the two demo users
npm run dev       # starts the API on http://localhost:3001
```

Demo accounts (local development only):
- Student: `student@nudra.com` (Kamal Manocha), password `password123`
- Instructor: `instructor@nudra.com` (Dr. Tariq Al-Mansoor), password `password123`
- Instructor who joined through the application flow (applied at `/teach`, approved in `/admin`): `mona.hassan@nudra.com` (Dr. Mona Hassan), password `MonaTeach2026`. Not created by `db:seed`; it exists only in the local database where it was approved.

> Security note: Copy `.env.example` to `.env` and `.backend/.env.example` to `.backend/.env`, then replace all placeholder secrets with strong random values before deploying to production. Never commit real `.env` files.

### 3. Frontend (second terminal, project root)
```bash
npm run dev       # starts Vite on http://localhost:5173
```

The frontend expects the backend at `VITE_API_URL` (default `http://localhost:3001`).
Health check: `http://localhost:3001/api/health` → `{"status":"ok"}`

## Admin dashboard

Admins sign in at `/login` and land on `/admin`, which has platform statistics, per-course statistics and the instructor application queue (approve / reject with a note).

There is no public way to become an admin. From the `backend` folder:

```bash
npm run admin -- create <email> <full name>   # prints a one-time generated password
npm run admin -- promote <email>              # turn an existing student account into an admin
npm run admin -- revoke <email>               # admin -> student (signs them out everywhere)
npm run admin -- list
```

Existing databases need the `admin` role value once: `ALTER TYPE role ADD VALUE IF NOT EXISTS 'admin';`

## Instructor accounts

Public sign-up (`/register`) creates **student** accounts only. Teachers apply at `/teach`; their account starts as a pending instructor and cannot use the Instructor Studio until approved.

Review applications in the admin dashboard (`/admin` → Instructor applications), or from the `backend` folder:

```bash
npm run instructors -- list                 # pending applications (or: approved | rejected | all)
npm run instructors -- show <email>         # full application
npm run instructors -- approve <email>
npm run instructors -- reject <email> Optional note shown to the applicant
```

The applicant gets an in-app notification and an email for each decision.

Existing databases need the new column and table before starting the backend (run once):

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS instructor_status varchar(20);
CREATE TABLE IF NOT EXISTS instructor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  subjects text NOT NULL,
  experience_years integer NOT NULL,
  bio text NOT NULL,
  portfolio_url text,
  status varchar(20) DEFAULT 'pending' NOT NULL,
  review_note text,
  reviewed_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);
```

(`npm run db:push` also creates them on a fresh database.)
