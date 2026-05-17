# Health Bot AI POC - Quick Start Guide

## Prerequisites

1. **LM Studio** - Download from https://lmstudio.ai
2. **MongoDB** - `brew install mongodb-community` (macOS)
3. **Docker** - For Redis container
4. **Node.js 20+** - With pnpm: `npm install -g pnpm`

---

## Setup Steps

### 1. Start LM Studio Server

1. Open LM Studio
2. Select and load models:
   - **Chat**: `openai/gpt-oss-20b`
   - **Embeddings**: `text-embedding-nomic-embed-text-v1.5`
3. Click **"Start Server"** (http://localhost:1234)

### 2. Start Services

```bash
# Start MongoDB (macOS)
brew services start mongodb-community

# Start Redis
docker compose -f docker/redis/docker-compose.yml up -d

# Verify
docker ps | grep dc-redis
```

### 3. Configure Environment

```bash
# From project root
cp backend.env.example backend/.env
cp frontend.env.example frontend/.env
```

**Verify `backend/.env`:**

```env
PORT=3001
MONGO_URI=mongodb://localhost:27017/diet-coach-poc
REDIS_URL=redis://localhost:6379
LLM_BASE_URL=http://localhost:1234/v1
RAG_SIMILARITY_THRESHOLD=0.3
```

> **Note:** The similarity threshold is set to 0.3 for local embedding models. If using cloud-based embeddings, you can increase this to 0.6-0.7.

**Verify `frontend/.env`:**

```env
NEXT_PUBLIC_API_BASE=http://localhost:3001
```

### 4. Start Backend

```bash
cd backend
pnpm i && pnpm dev
```

✅ Backend running on http://localhost:3001

### 5. Ingest Documents

**In a new terminal:**

```bash
curl -X POST http://localhost:3001/rag/ingest
```

⏱️ **Wait ~30-60 seconds** for first-time embedding generation.

**Check progress in backend logs:**

```
[IngestService] Generated 5 chunks for Symptom Guidance Reference
[EmbeddingService] Embedded batch 1/1
[IngestService] Ingestion complete: 1 documents, 5 chunks created
[IngestService] Generated 8 chunks for Food & Nutrition Reference Guide
[EmbeddingService] Embedded batch 1/1
[IngestService] Ingestion complete: 1 documents, 8 chunks created
```

### 6. Start Frontend

```bash
cd frontend
pnpm i && pnpm dev
```

✅ Frontend running on http://localhost:3000

---

## Test the Application

Open **http://localhost:3000** in your browser.

### Example 1: Symptom Query

**Type:**

```
I feel bloated after dinner
```

**Expected Response:**

- 🩺 **Symptom** badge
- **Self-care** level indicator (green)
- Summary of bloating causes
- 4 actionable steps
- Medical disclaimer
- Citations from symptom guide

### Example 2: Food Query

**Type:**

```
Is paneer butter masala okay?
```

**Expected Response:**

- 🍎 **Nutrition** badge
- Summary about paneer nutrition
- Tips on healthier preparation
- Portion guidance
- Citations from food guide

### Example 3: Red Flag Query

**Type:**

```
I have chest pain
```

**Expected Response:**

- 🩺 **Symptom** badge
- **Seek-care** level indicator (red)
- Urgent instructions
- Emergency steps
- Strong medical disclaimer
- Citations

---

## Troubleshooting

### Backend won't start

**Check MongoDB:**

```bash
mongosh mongodb://localhost:27017/diet-coach-poc
```

**Check Redis:**

```bash
docker exec dc-redis redis-cli ping
# Should return: PONG
```

**Check LM Studio:**

```bash
curl http://localhost:1234/v1/models
```

### Ingestion fails

**Issue**: "Connection refused" or timeout  
**Fix**: Ensure LM Studio server is running and models are loaded

**Issue**: Very slow embedding generation  
**Fix**: Normal for first time. Subsequent queries use cached embeddings.

### Frontend errors

**Issue**: "Cannot connect to API"  
**Fix**: Verify `NEXT_PUBLIC_API_BASE=http://localhost:3001` in `frontend/.env`

**Issue**: CORS errors  
**Fix**: Backend automatically allows CORS from http://localhost:3000

---

## Stopping Services

```bash
# Stop backend/frontend
# Press Ctrl+C in terminals

# Stop Redis
docker compose -f docker/redis/docker-compose.yml down

# Stop MongoDB (macOS)
brew services stop mongodb-community

# Stop LM Studio
# Click "Stop Server" in LM Studio GUI
```

---

## Quick Commands Reference

```bash
# Full restart from scratch
brew services restart mongodb-community
docker compose -f docker/redis/docker-compose.yml restart
cd backend && pnpm dev
cd frontend && pnpm dev

# Re-ingest after seed file changes
curl -X POST http://localhost:3001/rag/ingest

# Check health
curl http://localhost:3001/chat/health

# View logs
# Backend: See terminal where pnpm dev runs
# Redis: docker logs dc-redis
```

---

## Next Steps

- Read `README.md` for full documentation
- Explore `scripts/ingest.http` for API testing
- Check `backend/README.md` for backend details
- See `frontend/README.md` for frontend details

---

**🎉 You're all set! Start chatting at http://localhost:3000**
