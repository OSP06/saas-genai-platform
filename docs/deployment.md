# Deployment Guide — Kortex

---

## Architecture Decision: Single Worker Required

**Critical constraint:** The agent SSE streaming system uses in-process `asyncio.Queue` objects. Running multiple backend workers will cause agent log events to be delivered to the wrong worker. **Always run the backend with a single worker** until Redis Pub/Sub is implemented.

```bash
# CORRECT
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1

# INCORRECT — breaks agent SSE streaming
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## Local Development

### Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Minimum required:
# DATABASE_URL=postgresql+asyncpg://kortex:kortex@localhost:5432/kortex
# OPENAI_API_KEY=sk-...

# Start PostgreSQL with pgvector
docker run -d --name kortex-db \
  -e POSTGRES_USER=kortex \
  -e POSTGRES_PASSWORD=kortex \
  -e POSTGRES_DB=kortex \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# Run migrations in order
psql postgresql://kortex:kortex@localhost:5432/kortex -f migrations/001_initial.sql
psql postgresql://kortex:kortex@localhost:5432/kortex -f migrations/002_fix_vector_dimension.sql
psql postgresql://kortex:kortex@localhost:5432/kortex -f migrations/003_performance_indexes.sql

# Start API (single worker)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Verify
curl http://localhost:8000/health
# → {"status":"ok","version":"1.0.0","services":{...}}
```

### Frontend

```bash
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev
# → http://localhost:3000
```

---

## Docker Compose (Full Stack)

From the **repo root**:

```bash
# Configure backend
cp .env.example backend/.env
# Edit backend/.env — set OPENAI_API_KEY at minimum

# Start database + backend
docker compose up --build

# With Ollama LLM fallback
docker compose --profile ollama up --build

# With frontend container
docker compose --profile frontend up --build
```

Services started by default (`docker compose up`):
- `db` — PostgreSQL 16 + pgvector on port 5432
- `api` — FastAPI on port 8000

Optional profiles:
- `ollama` — Ollama server on port 11434
- `frontend` — Next.js dev server on port 3000

**Note:** The frontend Docker service is for convenience. For active development, run `pnpm dev` locally — hot reload is faster.

---

## Production Deployment

### Backend

#### Environment

Create a production `.env` file (not committed):

```bash
# Required
DATABASE_URL=postgresql+asyncpg://user:pass@your-db-host:5432/kortex
OPENAI_API_KEY=sk-...

# Production security
SECRET_KEY=<random-32+-char-string>
API_KEY_REQUIRED=true
ALLOWED_ORIGINS=["https://your-frontend.com"]
DEBUG=false

# Storage (use S3 for multi-instance safety)
STORAGE_BACKEND=s3
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Recommended: Ollama disabled in production
OLLAMA_ENABLED=false
```

#### Build and run

```bash
cd backend

# Build Docker image
docker build -t kortex-api .

# Run (single worker — required)
docker run -d \
  --name kortex-api \
  -p 8000:8000 \
  --env-file .env \
  kortex-api
```

Or with gunicorn (single uvicorn worker):

```bash
pip install gunicorn
gunicorn app.main:app \
  --workers 1 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --access-logfile - \
  --error-logfile -
```

#### Database setup (production)

On a managed PostgreSQL instance (RDS, Cloud SQL, etc.):

```bash
# Ensure pgvector extension is available
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run migrations in order
psql $DATABASE_URL -f backend/migrations/001_initial.sql
psql $DATABASE_URL -f backend/migrations/002_fix_vector_dimension.sql
psql $DATABASE_URL -f backend/migrations/003_performance_indexes.sql
```

### Frontend

#### Vercel (recommended)

1. Import the repository
2. Set **root directory** to `frontend/`
3. Framework preset: **Next.js** (auto-detected)
4. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-backend.com`
5. Deploy

The backend must have `ALLOWED_ORIGINS=["https://your-vercel-app.vercel.app"]` set.

#### Docker / Self-hosted

```bash
cd frontend
pnpm install
pnpm build
pnpm start
```

Or via the root `docker-compose.yml` frontend service:

```yaml
frontend:
  image: node:20-alpine
  working_dir: /app
  volumes:
    - ./frontend:/app
  ports:
    - "3000:3000"
  environment:
    - NEXT_PUBLIC_API_URL=http://api:8000  # Docker internal network
  command: sh -c "npm install -g pnpm && pnpm install && pnpm dev"
```

---

## nginx Reverse Proxy

For production, place nginx in front of both services:

```nginx
# /infra/nginx/kortex.conf

upstream backend {
    server 127.0.0.1:8000;
    keepalive 32;
}

server {
    listen 443 ssl;
    server_name api.your-domain.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # SSE requires disabling proxy buffering
    proxy_buffering off;
    proxy_cache off;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Connection '';  # SSE: no connection upgrade

        # SSE keep-alive: extend read timeout beyond 25s ping interval
        proxy_read_timeout 300s;
    }
}
```

**Critical for SSE:** `proxy_buffering off` and `proxy_read_timeout 300s` are required. Without these, the nginx buffer will hold SSE events until the buffer is full, causing the frontend to appear frozen.

---

## Health Check

```bash
curl https://your-backend.com/health
# → {"status":"ok","checks":{"db":"ok","embedding":"ok","agent":"ok"},"version":"1.0.0"}
```

Integrate with your load balancer or monitoring system. The health endpoint:
- Verifies database connectivity
- Verifies embedding service is loaded
- Verifies agent service is initialized
- Never requires authentication

---

## Migrations

Migrations are plain SQL files. Run them in ascending order. They are idempotent:

| File | Purpose |
|---|---|
| `001_initial.sql` | Full schema: all tables, pgvector, indexes |
| `002_fix_vector_dimension.sql` | Changes VECTOR(1536) → VECTOR(384) |
| `003_performance_indexes.sql` | Adds indexes on `documents` table |

**Adding new migrations:**
- Name them `004_description.sql`, `005_description.sql`, etc.
- Use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... IF NOT EXISTS` for safety
- Run manually before deploying the code that depends on the schema change

---

## Production Checklist

| Item | Status |
|---|---|
| `API_KEY_REQUIRED=true` | Required for production |
| `ALLOWED_ORIGINS` set to frontend domain | Required |
| `DEBUG=false` | Required (suppresses stack traces in responses) |
| `STORAGE_BACKEND=s3` | Required for multi-instance or persistence |
| `SECRET_KEY` set to random string | Recommended |
| Single uvicorn worker | Required (SSE constraint) |
| nginx proxy buffering disabled | Required (SSE) |
| Database migrations applied | Required |
| pgvector extension installed | Required |
| Health check endpoint monitored | Recommended |

---

## Known Limitations

| Limitation | Description | Path to fix |
|---|---|---|
| Single worker | Agent SSE requires in-process queue | Redis Pub/Sub for SSE distribution |
| Background ingestion | Runs in web process — lost on restart | ARQ / Celery external queue |
| No multi-tenancy | `user_id="default"` hardcoded | JWT auth + row-level security |
| No circuit breaker | Slow retries during LLM outage | Add circuit breaker library |
| SQLite tests only | pgvector not available in SQLite | Use testcontainers with Postgres |
