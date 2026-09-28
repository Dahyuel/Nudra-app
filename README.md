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

Demo accounts (password `NudraDemo2025!`):
- Student: `student@nudra.com` (Kamal Manocha)
- Instructor: `instructor@nudra.com` (Dr. Tariq Al-Mansoor)

> Security note: Copy `.env.example` to `.env` and `.backend/.env.example` to `.backend/.env`, then replace all placeholder secrets with strong random values before deploying to production. Never commit real `.env` files.

### 3. Frontend (second terminal, project root)
```bash
npm run dev       # starts Vite on http://localhost:5173
```

The frontend expects the backend at `VITE_API_URL` (default `http://localhost:3001`).
Health check: `http://localhost:3001/api/health` → `{"status":"ok"}`
