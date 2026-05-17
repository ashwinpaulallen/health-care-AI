# Health Bot AI Backend

NestJS backend service for the Health Bot AI POC with RAG-powered symptom and nutrition assistance.

## Architecture

### Modules

- **Common**: Shared configuration, MongoDB, and Redis connections
- **RAG**: Document ingestion, embedding generation, and retrieval
- **Agent**: LLM chat service and LangGraph-based agent orchestration
- **Chat**: Conversation management and message handling

### Agent Graph Flow

1. **Intent Classifier** → Determines if query is symptom/food/unknown
2. **Retriever** → Fetches relevant chunks from RAG corpus
3. **Safety Guard** → Detects red flags and sets safety level
4. **Answer Synthesizer** → Generates structured JSON response with citations

## Setup

### Prerequisites

- Node.js 20+
- MongoDB running locally on port 27017
- Redis running (via Docker) on port 6379
- LM Studio server running on port 1234 with:
  - Chat model: `openai/gpt-oss-20b`
  - Embedding model: `text-embedding-nomic-embed-text-v1.5`

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env if needed (defaults should work for local setup)
```

### Environment Variables

See `.env.example` for all available variables. Key settings:

```env
LLM_BASE_URL=http://localhost:1234/v1
LLM_CHAT_MODEL=openai/gpt-oss-20b
EMBED_MODEL=text-embedding-nomic-embed-text-v1.5
MONGO_URI=mongodb://localhost:27017/diet-coach-poc
REDIS_URL=redis://localhost:6379
PORT=3001
```

## Running

### Development Mode

```bash
npm run dev
```

Server will start on http://localhost:3001 with hot-reload enabled.

### Production Build

```bash
npm run build
npm start
```

## API Endpoints

### RAG Ingestion

#### `POST /rag/ingest`

Automatically ingest seed documents from `/seeds` directory.

**Response:**
```json
{
  "success": true,
  "message": "Seed documents ingested successfully",
  "results": {
    "symptom": {
      "documentsCreated": 1,
      "chunksCreated": 45
    },
    "food": {
      "documentsCreated": 1,
      "chunksCreated": 52
    }
  }
}
```

**Note**: This endpoint clears existing data before re-ingesting.

#### `POST /rag/ingest-custom`

Custom document ingestion with manual content.

**Request:**
```json
{
  "domain": "symptom",
  "docs": [
    {
      "title": "Document Title",
      "text": "Document content...",
      "tags": ["optional", "tags"]
    }
  ]
}
```

**Use Case**: When you want to add custom content without modifying seed files.

### Chat

#### `POST /chat/message`

Send a chat message and get AI response.

**Request:**
```json
{
  "userId": "user123",
  "convId": "optional-conversation-id",
  "text": "What causes bloating after meals?"
}
```

**Response:**
```json
{
  "success": true,
  "convId": "conv-id",
  "messageId": "msg-id",
  "intent": "symptom",
  "level": "self-care",
  "summary": "Bloating after meals can be caused by...",
  "steps": [
    "Eat slowly and chew thoroughly",
    "Avoid carbonated beverages"
  ],
  "cautions": [
    "This is not medical advice. Consult a healthcare professional..."
  ],
  "citations": [
    {
      "title": "Symptom Guidance Reference",
      "section": "Bloating"
    }
  ]
}
```

#### `GET /chat/conversation/:convId`

Get conversation history with all messages.

#### `GET /chat/user/:userId/conversations`

Get list of user's conversations (most recent first).

#### `GET /chat/health`

Health check endpoint.

## Data Ingestion Methods

### Method 1: Automatic (Recommended)

Uses the existing `/rag/ingest` endpoint that reads from `/seeds` directory:

```bash
curl -X POST http://localhost:3001/rag/ingest
```

**Pros**: 
- Simple one-command ingestion
- No manual copy-pasting
- Clears and re-ingests both domains

### Method 2: HTTP Client

Use the HTTP request file with VS Code REST Client or similar:

```bash
# Open scripts/ingest.http
# Execute the requests
```

### Method 3: Custom Endpoint

Use `/rag/ingest-custom` to manually provide content:

```bash
curl -X POST http://localhost:3001/rag/ingest-custom \
  -H "Content-Type: application/json" \
  -d @- << 'EOF'
{
  "domain": "symptom",
  "docs": [{
    "title": "Symptom Guide",
    "text": "Your markdown content here...",
    "tags": ["symptoms"]
  }]
}
EOF
```

**Note**: For large files, it's easier to use Method 1 (automatic) or copy-paste the markdown content into the JSON.

## Data Models

### MongoDB Collections

#### `rag_documents`
```typescript
{
  domain: 'symptom' | 'food',
  title: string,
  sourceId: string,
  sourceUrl?: string,
  tags: string[],
  createdAt: Date
}
```

#### `rag_chunks`
```typescript
{
  docId: ObjectId,
  domain: 'symptom' | 'food',
  text: string,
  embedding: number[],
  meta?: {
    section?: string,
    redFlags?: string[],
    dietTags?: string[]
  }
}
```

#### `conversations`
```typescript
{
  userId: string,
  startedAt: Date,
  lastAt: Date
}
```

#### `messages`
```typescript
{
  convId: ObjectId,
  role: 'user' | 'assistant' | 'tool',
  text: string,
  json?: object,
  intent?: string,
  topDocs?: array,
  createdAt: Date
}
```

### Redis Cache

- Embedding cache: `emb:chunk:{sha256}` → normalized embedding vector (TTL: 3600s)

## Development

### Code Quality

```bash
# Run linter
npm run lint

# Format code
npm run format

# Type check
tsc --noEmit
```

### Testing

```bash
# Run minimal tests
npm test
```

### Project Structure

```
src/
├── main.ts                    # Application entry point
├── app.module.ts              # Root module
├── common/                    # Shared modules
│   ├── config/               # Configuration service
│   ├── mongo/                # MongoDB connection
│   └── redis/                # Redis connection
├── rag/                      # RAG system
│   ├── schemas/              # Mongoose schemas
│   ├── embedding.service.ts  # Embedding generation
│   ├── ingest.service.ts     # Document ingestion
│   ├── ingest.controller.ts  # Ingestion endpoints
│   └── retriever.service.ts  # Hybrid retrieval
├── agent/                    # Agent system
│   ├── llm.chat.service.ts   # LLM chat client
│   └── graph.ts              # LangGraph agent nodes
├── chat/                     # Chat system
│   ├── schemas/              # Conversation/Message schemas
│   └── chat.controller.ts    # Chat endpoints
└── utils/                    # Utilities
    └── cosine.ts             # Vector similarity
```

## Workflow

### First-Time Setup

1. **Start dependencies:**
   ```bash
   # Start MongoDB (if not running)
   brew services start mongodb-community
   
   # Start Redis
   cd ../docker/redis
   docker-compose up -d
   
   # Start LM Studio server
   # Open LM Studio, load models, click "Start Server"
   ```

2. **Start backend:**
   ```bash
   npm run dev
   ```

3. **Ingest seed documents:**
   ```bash
   curl -X POST http://localhost:3001/rag/ingest
   ```

   **Wait 5-10 minutes** for embeddings to generate (first time only).

4. **Test chat:**
   ```bash
   curl -X POST http://localhost:3001/chat/message \
     -H "Content-Type: application/json" \
     -d '{
       "userId": "test-user",
       "text": "What are good sources of protein?"
     }'
   ```

### Daily Development

```bash
# Ensure services are running
docker ps  # Check Redis
mongosh    # Check MongoDB connection

# Start dev server
npm run dev
```

## Troubleshooting

### MongoDB Connection Failed

```bash
# Check if MongoDB is running
brew services list

# Start MongoDB
brew services start mongodb-community

# Verify connection
mongosh mongodb://localhost:27017/diet-coach-poc
```

### Redis Connection Failed

```bash
# Check if Redis container is running
docker ps | grep diet-coach-redis

# Start Redis
cd ../docker/redis
docker-compose up -d

# Check logs
docker-compose logs redis
```

### LM Studio Connection Failed

1. Ensure LM Studio is running
2. Verify server is started (green indicator in LM Studio)
3. Check models are loaded:
   - Chat: `openai/gpt-oss-20b`
   - Embedding: `text-embedding-nomic-embed-text-v1.5`
4. Test endpoint:
   ```bash
   curl http://localhost:1234/v1/models
   ```

### Slow Embedding Generation

- Embeddings are cached in Redis after first generation
- Initial ingestion will be slow (~5-10 minutes)
- Subsequent queries use cached embeddings
- Consider using smaller/quantized models on resource-constrained systems

### Ingestion Issues

**Problem**: File too large for manual copy-paste  
**Solution**: Use the automatic endpoint: `POST /rag/ingest`

**Problem**: Custom content not in seed files  
**Solution**: Use `/rag/ingest-custom` endpoint with your content

**Problem**: Need to re-ingest after seed file changes  
**Solution**: Just call `POST /rag/ingest` again (it clears and re-ingests)

## Notes

- Text search index is created automatically on `rag_chunks.text`
- Embeddings are normalized to unit vectors for efficient cosine similarity
- Agent graph runs sequentially through all nodes for each query
- Medical disclaimers are automatically added to symptom responses
- RAG retrieval uses hybrid search: text prefilter + vector reranking
- Ingestion clears existing data for the domain before inserting new chunks
