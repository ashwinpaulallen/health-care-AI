# Scripts Directory

Utility scripts and HTTP requests for the Health Bot AI POC.

## ingest.http

HTTP request file for testing and ingesting RAG documents.

### Usage

**With VS Code REST Client extension:**
1. Install the "REST Client" extension
2. Open `ingest.http`
3. Click "Send Request" above any `###` separator

**With IntelliJ/WebStorm HTTP Client:**
1. Open `ingest.http`
2. Click the play button next to any request

**With curl (command line):**

```bash
# Health check
curl http://localhost:3001/chat/health

# Automatic ingestion (reads from /seeds)
curl -X POST http://localhost:3001/rag/ingest

# Test symptom query
curl -X POST http://localhost:3001/chat/message \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo","text":"What causes bloating?"}'

# Test food query
curl -X POST http://localhost:3001/chat/message \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo","text":"What are good protein sources?"}'
```

### File Include Syntax

The HTTP file uses `<<file:path>>` syntax for including file contents:

```http
POST http://localhost:3001/rag/ingest-custom
Content-Type: application/json

{
  "domain": "symptom",
  "docs": [{
    "title": "Symptom Guide",
    "text": "<<file:../seeds/symptoms.md>>"
  }]
}
```

**If your HTTP client doesn't support file includes:**

1. Manually copy the content from `seeds/symptoms.md`
2. Replace `"<<file:../seeds/symptoms.md>>"` with the actual text
3. Ensure proper JSON escaping for quotes and newlines

**Or use the automatic endpoint instead:**

```bash
curl -X POST http://localhost:3001/rag/ingest
```

This endpoint reads files directly from the `/seeds` directory on the server.

## Available Requests

### Health & Status
- `GET /chat/health` - Check if backend is running

### Data Ingestion
- `POST /rag/ingest` - Automatic ingestion from /seeds (recommended)
- `POST /rag/ingest-custom` - Manual ingestion with custom content

### Chat Testing
- `POST /chat/message` - Test symptom queries
- `POST /chat/message` - Test food queries
- `POST /chat/message` - Test red flag detection

## Notes

- The backend must be running on http://localhost:3001
- Initial ingestion takes 5-10 minutes for embedding generation
- Embeddings are cached in Redis for subsequent queries
- Use the automatic endpoint (`POST /rag/ingest`) for the simplest workflow

