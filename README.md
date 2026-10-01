# Nudra (ندرة)

> A full-stack EdTech platform for Egyptian secondary students, instructors, and administrators — featuring a personalized student dashboard, course catalog, AI tutor, Sanaweya (Thanaweya Amma) exam prep, community, progress analytics, and a complete Instructor Studio.

[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-4-000000.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-4169E1.svg)](https://www.postgresql.org/)

---

## Overview

Nudra is a modern learning platform built for the Egyptian secondary-education market. It combines course delivery, AI-assisted study tools, and exam preparation into a single experience, with dedicated surfaces for **students**, **instructors**, and **admins**.

The app is split into four cooperating pieces:

| Layer | Stack | Responsibility |
|-------|-------|----------------|
| Frontend | React 19, Vite, Tailwind CSS 4, React Router 7, TanStack Query | Student & instructor UI, Sanaweya section, AI tutor, community |
| Backend | Express 4, Drizzle ORM, PostgreSQL (pgvector), Redis/BullMQ, MinIO | REST API, auth, video pipeline, AI orchestration, payments |
| Workers | Python (FastAPI + faster-whisper) | Video transcription for AI features |
| AI proxy | Python (FastAPI, OpenAI-compatible) | Bridges the DeepSeek web session to an OpenAI-style API |

---

## Features

### For students
- **Personalized dashboard** with stats, progress arcs, weekly activity charts, and focus timer.
- **Course catalog** with enrollment, reviews, and rich course detail pages.
- **Lesson player** with HLS video streaming, notes, and downloadable resources.
- **AI Tutor** — chat conversations grounded in lesson transcripts, plus flashcards, lesson summaries, and weak-topic detection.
- **Exam simulator** and per-lesson quizzes with attempt history.
- **Sanaweya section** — subject communities, past exams, and a dedicated Sanaweya dashboard for grades 1–3.
- **Community** — posts, replies, and voting, with anonymous posting support.
- **Progress & certificates** — study sessions, badges, and PDF certificate generation.

### For instructors
- **Instructor Studio** — dashboard, course management, upload/publish workflow, analytics, earnings, and student roster.
- **Video pipeline** — upload lessons that are transcoded to HLS and transcribed automatically.
- **Quiz builder** with AI-assisted question generation and per-course quiz analytics.

### For admins
- **Admin console** with platform statistics, per-course statistics, and the instructor application queue (approve/reject with a note).

### Platform
- Cookie-based sessions, bcrypt password hashing, and role-based access (`student`, `instructor`, `admin`).
- Tiered rate limiting and request slowdown on auth, AI, and video endpoints.
- Transactional email (welcome, password reset, instructor decisions) via SMTP/Mailpit.
- Real-time notifications over Socket.IO.

---

## Architecture

```
Nudra-app/
├── src/                     # React frontend
│   ├── components/          # Reusable UI (Navbar, Sidebar, charts, guards)
│   ├── context/             # Auth, Theme, RTL providers
│   ├── hooks/               # Data hooks (React Query wrappers)
│   ├── layouts/             # Dashboard & Instructor shells
│   ├── lib/                 # API client, Sanaweya labels
│   └── pages/               # Route pages (student, instructor, admin)
├── backend/                 # Express + Drizzle API
│   └── src/
│       ├── db/              # Drizzle schema, connection, seed
│       ├── lib/             # AI, embeddings, mailer, MinIO, queue, payments
│       ├── middleware/      # Auth guards, rate limiting
│       ├── routes/          # REST endpoints
│       ├── scripts/         # admin & instructor CLI tools
│       └── workers/         # HLS transcode worker
├── workers/whisper/         # FastAPI transcription service
├── deepseek-web-to-api-main/# OpenAI-compatible DeepSeek proxy
├── docker-compose.yml       # Postgres, Redis, MinIO, Ollama, Mailpit, Whisper
├── start.sh / stop.sh       # One-command local orchestration
└── vite.config.ts
```

---

## Prerequisites

- **Node.js 20.19+** (or 22+)
- **Docker** and **Docker Compose**
- **Python 3.11+** (for the DeepSeek proxy)

---

## Getting Started

### 1. Configure environment

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Generate strong secrets (never commit real `.env` files):

```bash
openssl rand -hex 64   # SESSION_SECRET
openssl rand -hex 32   # ANON_TOKEN_SALT
```

> `WHISPER_API_KEY` must match in the root `.env` and `backend/.env`, or transcription requests are rejected.

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts Postgres (with pgvector), Redis, MinIO, Ollama (pulls `nomic-embed-text`), Mailpit, and the Whisper worker.

If you already run Ollama yourself on port `11434`:

```bash
docker compose up -d postgres redis minio mailpit whisper
```

### 3. Set up the backend

```bash
cd backend
npm install
npm run db:push   # create tables
npm run db:seed   # insert demo data
npm run dev       # API on http://localhost:3001
```

### 4. Start the frontend

From the project root (second terminal):

```bash
npm install
npm run dev       # Vite on http://localhost:3000
```

`npm run dev` intentionally uses `--strictPort` so it refuses to start if port 3000 is taken, rather than silently colliding with the backend.

### 5. AI proxy (optional, required for AI features)

```bash
cd deepseek-web-to-api-main
pip install -r requirements.txt
python scripts/capture_browser_state.py   # capture browser credentials into .env
python -m app.main                        # listens on http://localhost:4981
```

### One-command alternative

`./start.sh` starts the DeepSeek proxy, backend, and frontend in the background and tails the backend log. Stop everything with `./stop.sh`.

### Health check

```bash
curl http://localhost:3001/api/health   # -> {"status":"ok"}
```

---

## Demo Accounts

For local development after `npm run db:seed`:

| Role | Email | Password |
|------|-------|----------|
| Student | `student@nudra.com` | `password123` |
| Instructor | `instructor@nudra.com` | `password123` |

There is **no public path to admin**. Create admin accounts from the `backend` folder:

```bash
npm run admin -- create <email> <full name>   # prints a one-time password
npm run admin -- promote <email>              # student -> admin
npm run admin -- revoke <email>               # admin -> student
npm run admin -- list
```

---

## Instructor Applications

Public sign-up (`/register`) creates **student** accounts only. Teachers apply at `/teach`; their account starts as a *pending instructor* and cannot access the Instructor Studio until approved.

Review from the admin dashboard (`/admin`) or the CLI:

```bash
npm run instructors -- list                  # pending (or: approved | rejected | all)
npm run instructors -- show <email>
npm run instructors -- approve <email>
npm run instructors -- reject <email> "Optional note"
```

Applicants receive both an in-app notification and an email for each decision.

---

## Video & AI Pipeline

1. An instructor uploads a lesson; the raw file is stored in MinIO.
2. A BullMQ worker transcodes it to HLS — the lesson is playable as soon as that completes.
3. The Whisper worker transcribes the audio with VAD filtering (silent/music-only videos are skipped to avoid hallucinated text).
4. Transcripts are chunked and embedded (Ollama `nomic-embed-text`, pgvector) to power the AI tutor, summaries, flashcards, and weak-topic detection.

If transcription fails, the lesson shows **"Video ready, transcript failed"** with a **Retry transcript** button in the course editor; the original upload is retained so no re-upload is needed.

---

## Sanaweya (Egyptian Secondary)

The `/sanaweya` section targets the Egyptian Thanaweya Amma curriculum:

- Grade-scoped courses and **past exams** (`/sanaweya/exams`).
- **Subject communities** for peer discussion.
- A Sanaweya-specific dashboard built from the student's profile.

Subjects are stored in Arabic and rendered with English labels (`src/lib/sanaweya.ts`).

---

## Testing

With the backend running, from the `backend` folder:

```bash
npm run test:api
```

Integration tests create their own `*.test` accounts and `QA <run>` courses, then delete them afterwards — even if a test fails. Each run consumes 3 of the 10 sign-ups allowed per 15 minutes per IP, so avoid running it more than ~3 times in a row.

Type-check the frontend from the root:

```bash
npm run lint      # tsc --noEmit
```

---

## API Reference

The API is served under `/api` on port `3001`.

| Group | Base path | Highlights |
|-------|-----------|------------|
| Auth | `/api/auth` | register, register-instructor, login/logout, password reset, preferences, profile |
| Courses | `/api/courses` | catalog, detail, reviews, enroll, my-courses |
| Instructor | `/api/instructor` | course CRUD, publish/unpublish, uploads, lessons, quizzes, students, earnings, analytics |
| Progress | `/api/progress` | lesson progress, course progress |
| Notes | `/api/notes` | per-lesson notes (CRUD) |
| AI | `/api/ai` | conversations, chat, flashcards, summaries, weak topics |
| Videos | `/api/videos` | HLS playlist and segment streaming |
| Community | `/api/community` | posts, replies, votes, pinning |
| Quizzes | `/api/quizzes` | lesson quizzes, attempts, exam generate/submit |
| Sanaweya | `/api/sanaweya` | profile, courses, past exams, subject communities, dashboard |
| Notifications | `/api/notifications` | list, mark read |
| Search | `/api/search` | global search |
| Stats | `/api/stats` | overview, certificates, certificate PDF |
| Admin | `/api/admin` | platform stats, per-course stats, instructor applications |
| Payments | `/api/payments` | checkout, orders, test completion |

---

## Configuration

Key environment variables (see `.env.example` for the full list):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection (queues) |
| `SESSION_SECRET` | Session/cookie signing secret |
| `MINIO_*` | Object storage endpoint and credentials |
| `OLLAMA_URL` | Embedding model endpoint |
| `DEEPSEEK_PROXY_URL` | OpenAI-compatible AI proxy URL |
| `WHISPER_URL` / `WHISPER_API_KEY` | Transcription service |
| `SMTP_*` | Outbound email (Mailpit in dev) |
| `ALLOWED_ORIGINS` | CORS allow-list |
| `VITE_API_URL` | Frontend → backend URL |
| `FRONTEND_URL` | Base URL for email links |

---

## Tech Stack

**Frontend** — React 19, TypeScript, Vite 8, Tailwind CSS 4, React Router 7, TanStack Query 5, Recharts, hls.js, lucide-react, react-markdown + KaTeX, socket.io-client.

**Backend** — Express 4, Drizzle ORM, PostgreSQL 16 (pgvector), Redis + BullMQ, MinIO, Socket.IO, Zod, bcryptjs, Nodemailer, PDFKit, Helmet, express-rate-limit, fluent-ffmpeg.

**Workers / AI** — Python FastAPI, faster-whisper; DeepSeek web-to-API proxy (FastAPI).

---

## Security Notes

- Copy the example env files and replace every placeholder secret before deploying.
- Never commit real `.env` files.
- Admin accounts are created only via the CLI — there is no public admin registration.
- Public sign-up is student-only; instructor access requires admin approval.

---

## License

This project is provided for educational and development use. See the repository for details.
