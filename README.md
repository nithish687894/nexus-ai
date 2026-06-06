# Nexus AI

Nexus AI is a standalone AI microservice for SRM Nexus. It answers student-friendly academic questions, cites official public SRM sources for official information, reasons over temporary `safe_context`, runs deterministic academic tools, and returns validated app actions.

## Architecture

Official SRM public documents and Nexus app docs are ingested into a RAG knowledge base. Private student data is never stored in Nexus AI. The SRM Nexus backend sends only a temporary safe academic summary for one request.

```text
SRM official public docs
  -> RAG ingestion
  -> Vector knowledge base
  -> Nexus AI API
  -> SRM Nexus backend
  -> SRM Nexus app UI
```

Frontend clients should not call Nexus AI directly:

```text
Frontend -> SRM Nexus Backend -> Nexus AI -> SRM Nexus Backend -> Frontend
```

Nexus AI has no main app database credentials, no portal credentials, and no direct write access.

## Local Setup

```bash
cd nexus-ai
npm install
npm run dev
```

Health checks:

```bash
curl http://localhost:8787/health/live
curl http://localhost:8787/health/ready
```

Useful commands:

```bash
npm run build
npm test
npm run ingest:srm
```

## Environment

Copy `.env.example` to `.env` and set values.

```bash
PORT=8787
NODE_ENV=development
AI_PROVIDER=mock
VECTOR_PROVIDER=qdrant
QDRANT_COLLECTION=nexus_ai_knowledge
RATE_LIMIT_PER_MINUTE=30
```

Use `AI_PROVIDER=mock` for local development. If `NEXUS_BACKEND_SHARED_SECRET` is set, API requests under `/api/*` must include the `x-nexus-shared-secret` header.

## API

### Chat

`POST /api/ai/chat`

```json
{
  "user_message": "Can I skip my next OS class?",
  "premium": true,
  "safe_context": {
    "overall_attendance": 76.5,
    "subjects": [
      {
        "name": "Operating Systems",
        "attendance_pct": 74.2,
        "total_classes": 40,
        "attended_classes": 29,
        "next_class_time": "10:30 AM",
        "is_lab": false
      }
    ]
  }
}
```

Example response:

```json
{
  "intent": "skip_prediction",
  "reply": "Don't skip Operating Systems bro. You're at 72.5% and after one skip it becomes 70.7%.",
  "cards": [
    {
      "type": "attendance_risk",
      "title": "Operating Systems",
      "current": 72.5,
      "risk": "already_low",
      "message": "Already below 75%. Attend first, skip later."
    }
  ],
  "actions": [
    {
      "type": "ENABLE_NOTIFICATION",
      "label": "Enable Operating Systems reminder",
      "requiresConfirmation": true,
      "dangerLevel": "low",
      "payload": {
        "category": "class_reminder",
        "subject": "Operating Systems",
        "time": "10:30 AM"
      }
    }
  ],
  "sources": [],
  "premiumRequired": false,
  "missingData": []
}
```

### RAG Search

`POST /api/rag/search`

```json
{
  "query": "What is SRM student portal?",
  "topK": 5,
  "category": "student_portal"
}
```

Example response:

```json
{
  "chunks": [
    {
      "text": "The SRM student portal is the official public landing page...",
      "score": 0.87,
      "metadata": {
        "source_url": "https://sp.srmist.edu.in/",
        "title": "SRM Student Portal",
        "category": "student_portal",
        "type": "webpage",
        "last_updated": "unknown",
        "ingested_at": "2026-06-06T00:00:00.000Z",
        "content_hash": "abc123"
      }
    }
  ]
}
```

Other endpoints:

- `POST /api/ai/summary`
- `POST /api/ingest/srm-public`
- `POST /api/ingest/nexus-docs`
- `GET /health/live`
- `GET /health/ready`

## SRM RAG Ingestion

Nexus AI uses RAG for official SRM knowledge. Do not fine-tune official SRM rules, because rules can change. Update the source list and re-ingest instead.

### Add Sources

Edit `data/sources/official-srm-sources.json`:

```json
{
  "url": "https://www.srmist.edu.in/students/",
  "title": "Students | SRMIST",
  "category": "students",
  "type": "webpage",
  "enabled": true
}
```

Supported `type` values:

- `webpage`
- `pdf`

Only add public official SRM pages or PDFs. Do not add logged-in portal pages, private student data, screenshots, marks, attendance, NetID/password content, cookies, tokens, or internal pages.

### Run Ingestion

```bash
npm run ingest:srm
```

The ingestion command:

- reads `data/sources/official-srm-sources.json`
- fetches public webpages and PDFs
- rejects login-like or private URLs
- cleans navigation, header, and footer noise
- parses PDF text
- chunks text at about 500 tokens with 50-token overlap
- creates embeddings
- writes `data/processed/chunks.jsonl`
- uploads vectors to Qdrant when `QDRANT_URL` is configured
- uses an in-memory vector store for local dev and tests when Qdrant is not configured

Example output:

```text
Loaded 4 sources
Fetched 4 webpages
Parsed 0 PDFs
Skipped 0 sources
Created 32 chunks
Uploaded 32 vectors to qdrant
Done
```

### Metadata

Every chunk stores:

```json
{
  "source_url": "https://www.srmist.edu.in/students/",
  "title": "Students | SRMIST",
  "category": "students",
  "type": "webpage",
  "last_updated": "unknown",
  "ingested_at": "2026-06-06T00:00:00.000Z",
  "content_hash": "abc123"
}
```

This metadata is required so official SRM answers can cite sources.

### Re-index Documents

Update `data/sources/official-srm-sources.json`, then rerun:

```bash
npm run ingest:srm
```

Qdrant point IDs are derived from source URL and chunk content. Re-running ingestion updates matching chunks and adds new chunks when source content changes.

### Qdrant Setup

Set these values in `.env`:

```bash
VECTOR_PROVIDER=qdrant
QDRANT_URL=https://your-qdrant-host
QDRANT_API_KEY=your-key
QDRANT_COLLECTION=nexus_ai_knowledge
```

The v1 embedding function is isolated in `src/rag/ingestion/createEmbeddings.ts`. Production embedding providers can be swapped in without changing the ingestion flow.

## Safety Rules

Nexus AI rejects unsafe `safe_context` keys such as:

- `password`
- `token`
- `cookie`
- `session`
- `netid`
- `register`
- `email`
- `phone`
- `secret`
- `auth`
- `jwt`

It refuses requests that ask for system prompts, hidden data, `safe_context` JSON, tokens, admin behavior, or another student's data.

Official SRM answers must come from retrieved RAG chunks. If no reliable source is found, Nexus AI tells the student to verify on the official SRM website instead of inventing policy.

## Action Schema

Allowed actions:

- `OPEN_PAGE`
- `FILTER_ATTENDANCE`
- `REFRESH_PORTAL_DATA`
- `ENABLE_NOTIFICATION`
- `DISABLE_NOTIFICATION`
- `CREATE_STUDY_PLAN`
- `CREATE_REMINDER`
- `GENERATE_REPORT`
- `START_PREMIUM_TRIAL`

Premium, report, and refresh actions require confirmation. SRM Nexus backend must validate all actions again before execution.

## Backend Integration

The SRM Nexus backend should:

- authenticate the student
- build temporary `safe_context`
- call Nexus AI server-to-server with a 10-15 second timeout
- include `x-nexus-shared-secret` when configured
- validate response actions before executing them
- return a normal app fallback if Nexus AI is unavailable

Fallback copy:

```text
Nexus AI is taking a small nap right now. Try again in a bit. Your normal attendance and marks pages still work.
```

Example frontend response handling:

```ts
function renderAiResponse(response) {
  showAssistantText(response.reply);
  response.cards.forEach(renderResultCard);
  response.actions.forEach(renderActionButton);
  response.sources.forEach(renderSourceCitation);
  if (response.premiumRequired) showPremiumLock();
}
```

## Fine-Tuning Later

Fine-tuning should be used only for Nexus AI style, not official SRM rules.

Good fine-tuning targets:

- short student-friendly replies
- missing-data fallback wording
- premium upsell tone
- notification wording
- structured action formatting

Put future tone examples in `training/raw/nexus_tone_examples.jsonl`.

## Public Study Material Sources

Nexus AI keeps official SRM sources separate from non-official public study resources.

- `sourceType=official_srm` and `official=true` are only for official public SRM sources.
- `sourceType=public_study_material` and `official=false` are for THE HELPER and similar public study-resource sites.
- THE HELPER content is never used for official SRM rules, policies, notices, fees, portal instructions, or exam policy answers.
- PYQs, notes, answer keys, MCQs, and study-resource queries prefer THE HELPER chunks and are clearly marked non-official.

New commands:

```bash
npm run watch:srm
npm run crawl:thehelpers
npm run download:thehelpers
npm run ingest:thehelpers
npm run watch:thehelpers
```

Local storage paths:

- SRM raw files: `storage/raw/srm/`
- THE HELPER raw files: `storage/raw/thehelpers/`
- SRM metadata: `data/metadata/srm-documents.jsonl`
- THE HELPER metadata: `data/metadata/thehelpers-resources.jsonl`
- SRM chunks: `data/processed/srm-chunks.jsonl`
- THE HELPER chunks: `data/processed/thehelpers-chunks.jsonl`

Install Playwright browsers before live crawling if your machine has not installed them:

```bash
npx playwright install chromium
```

The watcher commands perform one safe check pass. Use external cron or a platform scheduler for recurring runs.

## Deployment

Deploy Nexus AI separately from SRM Nexus on Render, Railway, Fly.io, VPS, or Cloud Run. Configure health checks, structured logs, restart-on-crash, vector DB credentials, and no main app DB credentials.
