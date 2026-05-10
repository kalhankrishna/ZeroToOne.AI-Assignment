# ZeroToOne.AI Assignment: Audience Builder

A chat-based audience builder for advertising campaigns. 
Media planners describe their target audience in plain English. 
An AI agent searches real behavioral taxonomy data, recommends targeting signals, 
negotiates through conversation, and estimates the reachable audience size.

Live: https://zero-to-one-ai-assignment-frontend.vercel.app/

Demo credentials:
- Admin: admin@demo.com / admin123
- Planner: planner@demo.com / planner123

---

## Tech Stack

- Frontend: React + TypeScript + React Router, deployed on Vercel
- Backend: Node.js + Express + TypeScript, deployed on DigitalOcean
- Database: PostgreSQL + pgvector
- ORM: Prisma
- Vector search: pgvector with HNSW indexes
- Embeddings: Voyage AI (voyage-4-lite)
- LLM: Claude claude-sonnet-4-6 with tool use
- Auth: JWT with httpOnly cookies

---

## Local Setup

### Prerequisites

- Node.js 18+
- pnpm
- Docker and Docker Compose

### 1. Clone the repo

git clone https://github.com/kalhankrishna/ZeroToOne.AI-Assignment
cd ZeroToOne.AI-Assignment

### 2. Environment variables

Copy the example env file and fill in the values:

cd backend
cp .env.example .env

See ARCHITECTURE.md for API key setup and where to obtain each key.

### 3. Start the database

From the project root:

docker compose up -d

This starts a PostgreSQL instance with the pgvector extension enabled.

### 4. Backend setup

cd backend
pnpm install
pnpm prisma migrate deploy
pnpm exec tsx prisma/setup-indexes.ts
pnpm seed
pnpm build
pnpm start

For local development instead of the last two steps:

pnpm dev

### 5. Frontend setup

cd frontend
pnpm install
pnpm dev

Frontend runs on http://localhost:5173
Backend runs on http://localhost:3000

---

## What The Seed Script Does

The seed script does three things:

1. Parses three taxonomy sheets (location, transaction, consumer graph) from the provided Excel file
2. Embeds each row as a 1024-dimensional vector via Voyage AI
3. Inserts the embeddings into PostgreSQL for pgvector search

This runs once. Re-running without the --force flag is a no-op. Re-seeding requires:

pnpm seed --force

Note: re-seeding makes Voyage AI API calls for all 2,171 rows. Use --force only when necessary.

---

## Roles and Permissions

Two roles are seeded by default:

- Planner: can create conversations, build audiences, and view their own conversation history
- Admin: can view all conversations across all planners and manage user roles

Admin accounts cannot be created via public registration. The default admin is seeded on first run. Existing admins can promote planners via the admin panel.

---

## Architecture and Design Decisions

See ARCHITECTURE.md for a full breakdown of how the agent works, how the taxonomy data is searched, how signals are built and persisted, and the known limitations of the current implementation.
