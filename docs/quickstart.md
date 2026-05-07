# Quickstart — Running Kortex Locally

Two ways to run the platform: **Docker** (recommended, one command) or **manually** (frontend and backend in separate terminals).

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Docker + Docker Compose | any recent | [docker.com](https://docker.com) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| pnpm | 8+ | `npm i -g pnpm` |
| Python | 3.11+ | [python.org](https://python.org) |

---

## Option A — Docker (full stack)

Starts Postgres, the FastAPI backend, and serves everything from one command.

```bash
# 1. Copy and fill in the backend env file
cp backend/.env.example backend/.env
# Open backend/.env and set OPENAI_API_KEY=sk-...

# 2. Start
cd backend
docker compose up --build
```

The API is available at `http://localhost:8000`.  
The frontend still needs to be started manually (see step 3 in Option B below).

---

## Option B — Manual (recommended for development)

### Terminal 1 — Database

```bash
cd backend
docker compose up db
```

This starts only Postgres on port `5432`. Keep this terminal running.

### Terminal 2 — Backend (FastAPI)

```bash
cd backend

# First time only: create a virtual environment and install deps
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Copy env and set your OpenAI API key
cp .env.example .env
# Edit .env — set OPENAI_API_KEY at minimum

# Run the API server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Verify it's running:

```bash
curl http://localhost:8000/health
# → {"status":"ok"}
```

### Terminal 3 — Frontend (Next.js)

```bash
cd frontend

# First time only
pnpm install

# Copy env (points the frontend at the local API)
cp .env.example .env.local

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables (minimum required)

**`backend/.env`**

```env
DATABASE_URL=postgresql+asyncpg://kortex:kortex@localhost:5432/kortex
OPENAI_API_KEY=sk-your-openai-key-here
SECRET_KEY=any-random-32-char-string
```

**`frontend/.env.local`**

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Ports

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |
| Postgres | localhost:5432 |

---

## Stopping

```bash
# Stop the frontend: Ctrl+C in Terminal 3
# Stop the backend: Ctrl+C in Terminal 2
# Stop the database:
cd backend && docker compose down
```

To also delete the database volume (wipes all data):

```bash
cd backend && docker compose down -v
```
