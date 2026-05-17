# Agentic AI System Components — Comprehensive Documentation

This document provides a detailed breakdown of how the Health Bot AI implements all major components of an agentic AI system, including data preparation, RAG pipeline, reasoning & reflection, tool-calling, and evaluation.

---

## Table of Contents

1. [Data Preparation & Contextualization](#1-data-preparation--contextualization)
2. [RAG Pipeline Design](#2-rag-pipeline-design)
3. [Reasoning & Reflection](#3-reasoning--reflection)
4. [Tool-Calling Mechanisms](#4-tool-calling-mechanisms)
5. [Evaluation](#5-evaluation)

---

## 1. Data Preparation & Contextualization

### Overview

The system prepares and contextualizes data from multiple sources to provide the agent with rich, relevant context for each query. This includes both **deterministic state** (always accurate) and **adaptive context** (conversation history).

### Data Sources

#### 1.1 Knowledge Base Documents

**Source**: Markdown files in `/seeds/` directory
- `symptoms.md` - Symptom guidance and health information
- `food.md` - Food and nutrition information
- `constipation.md`, `fatigue.md` - Detailed symptom information
- `indian-vegetables.md`, `healthy-snacks.md` - Food-specific information

**Processing Pipeline**:
```
Markdown Files → Parse & Chunk → Generate Embeddings → Store in MongoDB
```

**Implementation**: `backend/src/rag/ingest.service.ts`

```typescript
// Chunking strategy
- Chunk size: 500 characters (configurable via CHUNK_SIZE)
- Overlap: 50 characters (configurable via CHUNK_OVERLAP)
- Sentence-based splitting for natural boundaries
- Domain separation: 'symptom' vs 'food'
```

**Metadata Extraction**:
- **Symptom documents**: Extract red flags (chest pain, fainting, etc.)
- **Food documents**: Extract diet tags (vegetarian, high-protein, etc.)
- Section information preserved for citations

#### 1.2 User Profile & Diet Plan

**Deterministic State** (always accurate):
- **User Profile**: Allergies, dietary restrictions, conditions
- **Active Diet Plan**: Macro targets (calories, protein, carbs, fat, fiber), goals, restrictions
- **Today's Consumption**: Current day's food intake totals
- **Rolling Window Stats**: N-day averages, trend analysis (improving/declining/stable)

**Implementation**: `backend/src/agent/context-builder.service.ts`

```typescript
interface DeterministicState {
  userId: string;
  profile?: {
    allergies?: string[];
    dietaryRestrictions?: string[];
    conditions?: string[];
  };
  dietPlan?: {
    name: string;
    dailyMacroTargets: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
    };
    goals?: string[];
  };
  todayConsumption?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    mealsLogged: number;
  };
  rollingWindowStats?: {
    windowDays: number;
    daysLogged: number;
    averages: { calories, protein, carbs, fat, fiber };
    trend: 'improving' | 'declining' | 'stable';
  };
}
```

**Calculation Logic**:
- **Today's consumption**: Aggregated from `FoodLog` entries for current date
- **Rolling window**: Calculates averages over last N days (default: 7)
- **Trend analysis**: Compares first half vs second half of window period
- All calculations are **deterministic** (no LLM calls, always accurate)

#### 1.3 Conversation Context

**Simple Fixed Window Approach** (no summarization):
- Last N messages kept in full (default: 3, configurable)
- No summarization for simplicity and reliability
- Messages include: role, text, intent, timestamp

**Implementation**: `backend/src/agent/context-builder.service.ts`

```typescript
interface ConversationContext {
  recentMessages: Array<{
    role: 'user' | 'assistant';
    text: string;
    intent?: string;
    createdAt: Date;
  }>;
}
```

**Retrieval Strategy**:
- Fetches last N messages from MongoDB
- Sorted chronologically (oldest first)
- Only includes messages from same conversation (`convId`)

#### 1.4 Context Assembly

**Hybrid Pattern**: Combines deterministic state + conversation context

**Implementation**: `ContextBuilderService.buildContext()`

```typescript
async buildContext(
  userId: string,
  convId: string | undefined,
  dietPlanModel?: Model<DietPlanDocument>,
  foodLogModel?: Model<FoodLogDocument>,
  messageModel?: Model<MessageDocument>,
): Promise<AgentContext> {
  // 1. Build deterministic state (always accurate)
  const deterministicState = await this.buildDeterministicState(
    userId,
    dietPlanModel,
    foodLogModel,
  );

  // 2. Build simple conversation context (fixed window)
  const conversationContext = await this.buildConversationContext(
    convId,
    messageModel,
  );

  return {
    deterministicState,
    conversationContext,
  };
}
```

**Usage in Agent Graph**:
- Context is built **before** running the agent graph
- Injected into all nodes that need it (answer synthesizer, safety guard)
- Provides consistent, accurate state throughout execution

### Configuration

```env
# Conversation Context
CONVERSATION_CONTEXT_ENABLED=true
CONVERSATION_RECENT_MESSAGES=3  # Fixed window size

# Rolling Window
ROLLING_WINDOW_DAYS=7  # N-day window for stats
```

---

## 2. RAG Pipeline Design

### Overview

The RAG (Retrieval Augmented Generation) pipeline uses a **hybrid search approach** combining keyword-based text search with semantic vector similarity. This ensures both exact matches and semantic relevance.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Document Ingestion                        │
│  ┌──────────────┐                                           │
│  │ Seed Files   │  (Markdown documents)                     │
│  │ (seeds/*.md) │                                           │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Ingest       │  • Parse markdown                         │
│  │ Service      │  • Split into chunks (500 chars)         │
│  │              │  • Extract metadata                      │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Embedding    │  • Call LM Studio embedding API          │
│  │ Service      │  • Normalize vectors                      │
│  │              │  • Batch processing                       │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ MongoDB      │  • Store documents (rag_documents)       │
│  │ Storage      │  • Store chunks (rag_chunks)             │
│  │              │  • Index embeddings                      │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Redis Cache  │  • Cache embeddings                       │
│  │              │  • TTL: 3600s                            │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Document Ingestion

**Service**: `backend/src/rag/ingest.service.ts`

**Process**:

1. **Document Parsing**:
   - Reads markdown files from `/seeds/` directory
   - Extracts title, text content, sections
   - Assigns domain (`symptom` or `food`)

2. **Chunking Strategy**:
   ```typescript
   - Chunk size: 500 characters (configurable)
   - Overlap: 50 characters (for context preservation)
   - Sentence-based splitting (respects natural boundaries)
   - Preserves section information in metadata
   ```

3. **Metadata Extraction**:
   - **Symptom chunks**: Extract red flags (chest pain, fainting, etc.)
   - **Food chunks**: Extract diet tags (vegetarian, high-protein, etc.)
   - Section names preserved for citations

4. **Embedding Generation**:
   - Model: `text-embedding-nomic-embed-text-v1.5` (via LM Studio)
   - Batch processing for efficiency
   - Vector normalization (L2 normalization)
   - Caching in Redis (TTL: 3600s)

5. **Storage**:
   - Documents stored in `rag_documents` collection
   - Chunks stored in `rag_chunks` collection with embeddings
   - MongoDB text index for keyword search

### 2.2 Retrieval Mechanism

**Service**: `backend/src/rag/retriever.service.ts`

**Hybrid Search Strategy**:

#### Step 1: Text Pre-filtering (Keyword Search)

```typescript
// MongoDB text search for initial filtering
const textCandidates = await ragChunkModel
  .find({
    domain,
    $text: { $search: query },
  }, { score: { $meta: 'textScore' } })
  .sort({ score: { $meta: 'textScore' } })
  .limit(topK * 3)  // Get more candidates for reranking
  .exec();
```

**Purpose**: Fast keyword matching to narrow down candidates
- Uses MongoDB's built-in text index
- Returns top candidates based on text relevance score
- If no matches, falls back to all chunks in domain

#### Step 2: Vector Similarity (Semantic Search)

```typescript
// Generate query embedding
const queryEmbedding = await embeddingService.embedOne(query);

// Compute cosine similarity for each candidate
const scoredChunks = candidates.map((chunk) => {
  const chunkEmbedding = new Float32Array(chunk.embedding);
  const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
  return {
    text: chunk.text,
    score: similarity,
    domain: chunk.domain,
    docId: chunk.docId.toString(),
    meta: chunk.meta,
  };
});
```

**Purpose**: Semantic matching for conceptual relevance
- Generates embedding for user query
- Computes cosine similarity with all candidate chunks
- Reranks candidates by semantic similarity

#### Step 3: Final Selection

```typescript
// Sort by similarity score (descending)
scoredChunks.sort((a, b) => b.score - a.score);

// Filter by threshold and take top K
const results = scoredChunks
  .filter((chunk) => chunk.score >= threshold)
  .slice(0, topK);
```

**Parameters**:
- `topK`: Default 5 chunks (configurable via `RAG_TOP_K`)
- `threshold`: Minimum similarity score 0.3 (configurable via `RAG_SIMILARITY_THRESHOLD`)

#### Spillover Retrieval

**Purpose**: Get context from other domain for cross-domain queries

```typescript
async retrieveWithSpillover(
  query: string,
  primaryDomain: 'symptom' | 'food',
  k?: number,
): Promise<{ primary: RetrievedChunk[]; spillover: RetrievedChunk[] }> {
  const primary = await this.retrieve(query, primaryDomain, k);
  const spilloverDomain = primaryDomain === 'symptom' ? 'food' : 'symptom';
  const spillover = await this.retrieve(query, spilloverDomain, 1); // 1 spillover chunk
  return { primary, spillover };
}
```

**Usage**: Provides 1 chunk from opposite domain for additional context

### 2.3 Embedding Service

**Service**: `backend/src/rag/embedding.service.ts`

**Features**:

1. **Caching**: Redis cache for embeddings (TTL: 3600s)
   - Cache key: `embedding:${model}:${textHash}`
   - Reduces API calls for repeated queries

2. **Normalization**: L2 normalization for cosine similarity
   ```typescript
   function normalizeVector(vec: number[]): Float32Array {
     const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
     return new Float32Array(vec.map(v => v / magnitude));
   }
   ```

3. **Batch Processing**: Efficient batch embedding generation
   ```typescript
   async embedBatch(texts: string[]): Promise<Float32Array[]> {
     // Process in parallel for efficiency
     const embeddings = await Promise.all(
       texts.map(text => this.embedOne(text))
     );
     return embeddings;
   }
   ```

### 2.4 External Knowledge Integration

**Tavily Search Integration**: `backend/src/agent/tavily-mcp.service.ts`

**Purpose**: Fallback when knowledge base is insufficient

**Trigger Conditions**:
- No good results from RAG (`hasGoodResults === false`)
- No exact matches (`hasExactMatch === false`)
- Intent is not 'unknown'
- Tavily API key is configured

**Process**:
1. Search Tavily API with user query
2. Retrieve top 3 results
3. Save results to knowledge base (self-learning)
4. Include results in answer synthesis

**Self-Learning**: `backend/src/rag/knowledge-saver.service.ts`
- Automatically saves Tavily results to knowledge base
- Prevents duplicate saves (checks existing documents)
- Formats results as markdown documents
- Makes external knowledge available for future queries

### Configuration

```env
# RAG Configuration
RAG_TOP_K=5                    # Number of chunks to retrieve
RAG_SIMILARITY_THRESHOLD=0.3   # Minimum similarity score
CHUNK_SIZE=500                 # Chunk size in characters
CHUNK_OVERLAP=50              # Overlap between chunks

# Embedding Model
EMBED_MODEL=text-embedding-nomic-embed-text-v1.5

# Tavily (Optional)
TAVILY_API_KEY=your_tavily_api_key_here
```

---

## 3. Reasoning & Reflection

### Overview

The agent implements a **self-reflective architecture** where it evaluates its own responses and automatically corrects them when quality is insufficient. This includes both metric-based evaluation and LLM-based reflection.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Graph Flow                          │
│                                                              │
│  1. Intent Classification                                    │
│  2. Retrieval (RAG + Tavily fallback)                        │
│  3. Safety Guard                                             │
│  4. Answer Synthesis                                         │
│  5. Reflection & Evaluation                                  │
│  6. Self-Correction (if needed)                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Intent Classification

**Node**: `intentClassifierNode()`

**Purpose**: Classify user query into intent categories

**Categories**:
- `symptom`: Bodily feelings, physical issues, health concerns
- `food`: Nutrients, foods, meals, recipes, diet plans
- `food-logging`: Natural language food tracking ("I'm eating roti")
- `unknown`: Unclear or unrelated queries

**Implementation**:
```typescript
// LLM-based classification with strict JSON output
const intent = await llmService.chatJSON<{ intent: string }>(
  systemPrompt,
  userQuery,
  '{"intent": "symptom|food|food-logging|unknown"}'
);
```

**Decision Logic**:
- Bodily feelings/issues → `symptom`
- Nutrients/foods/meals → `food`
- Food logging phrases → `food-logging`
- Everything else → `unknown`

### 3.2 Safety Guard

**Node**: `safetyGuardNode()`

**Purpose**: Assess safety level for symptom queries

**Red Flags** (triggers `seek-care`):
1. `chest pain`
2. `fainting`
3. `blood in stool`
4. `uncontrolled vomiting`
5. `severe dehydration`

**Safety Levels**:
- `seek-care`: Red flag detected → immediate medical attention
- `caution`: Moderate/prolonged symptoms (>48h)
- `self-care`: Default for symptom queries

**Implementation**:
```typescript
function safetyGuardNode(state: GraphState): GraphState {
  if (state.intent !== 'symptom') {
    state.safetyLevel = 'self-care';
    return state;
  }

  const queryLower = state.userQuery.toLowerCase();
  const redFlags = ['chest pain', 'fainting', 'blood in stool', 
                    'uncontrolled vomiting', 'severe dehydration'];

  // Check user query AND retrieved chunks
  const hasRedFlag = redFlags.some(flag => 
    queryLower.includes(flag) || 
    state.primaryDocs?.some(doc => doc.text.toLowerCase().includes(flag))
  );

  if (hasRedFlag) {
    state.safetyLevel = 'seek-care';
  } else if (queryLower.includes('moderate') || 
             queryLower.includes('>48h') || 
             queryLower.includes('more than 48 hours')) {
    state.safetyLevel = 'caution';
  } else {
    state.safetyLevel = 'self-care';
  }

  return state;
}
```

### 3.3 Answer Synthesis

**Node**: `answerSynthesizerNode()`

**Purpose**: Generate structured response using retrieved context

**Context Assembly**:
- Retrieved chunks (RAG results)
- Tavily results (if used)
- Deterministic state (diet plan, progress)
- Conversation context (recent messages)
- Safety level (for symptom queries)

**Mode-Specific Synthesis**:

**Symptom Mode**:
```typescript
{
  intent: "symptom",
  level: "self-care|caution|seek-care",
  summary: "<=2 sentences",
  steps: ["<=4 actionable steps"],
  cautions: ["Medical disclaimer", "Other caution"],
  citations: [{title: "...", section: "..."}]
}
```

**Food Mode**:
```typescript
{
  intent: "food",
  summary: "<=2 sentences",
  steps: ["<=4 concrete tips or swaps"],
  citations: [{title: "...", section: "..."}]
}
```

**Food-Logging Mode**:
- Extracts food items from natural language
- Looks up nutrition data
- Logs to food log
- Returns progress feedback

### 3.4 Reflection & Evaluation

**Node**: `reflectionNode()`

**Purpose**: Evaluate response quality using metrics + LLM reflection

**Services**:
- `EvaluationService`: Calculates quantitative metrics
- `ReflectionService`: LLM-based qualitative assessment

#### Evaluation Metrics

**Service**: `backend/src/agent/evaluation.service.ts`

**Metrics**:

1. **Relevance** (30% weight):
   - How well retrieved docs match query
   - Keyword matching + similarity scores
   - Range: 0-1

2. **Clarity** (25% weight):
   - Answer clarity and understandability
   - Summary length, presence of steps
   - Range: 0-1

3. **Completeness** (25% weight):
   - How fully answer addresses query
   - Answer length, steps count, citations
   - Range: 0-1

4. **Citation Quality** (20% weight):
   - Appropriateness and presence of citations
   - Citation count, match with retrieved docs
   - Range: 0-1

**Overall Score**:
```typescript
overallScore = 
  (relevance * 0.30) +
  (clarity * 0.25) +
  (completeness * 0.25) +
  (citationQuality * 0.20)
```

**Threshold**: 0.7 (below triggers self-correction)

#### Reflection Service

**Service**: `backend/src/agent/reflection.service.ts`

**Purpose**: LLM-based qualitative assessment

**Process**:
1. Builds context with query, response, retrieved docs, metrics
2. Asks LLM to evaluate if retry is needed
3. Returns structured reflection result

**Output**:
```typescript
interface ReflectionResult {
  evaluation: EvaluationMetrics;
  shouldRetry: boolean;
  retryReason?: string;
  suggestedImprovements?: string[];
}
```

**Decision Logic**:
```typescript
const shouldRetry =
  reflection?.shouldRetry ||
  evaluationMetrics.needsImprovement ||
  evaluationMetrics.overallScore < 0.7;
```

### 3.5 Self-Correction

**Node**: `selfCorrectionNode()`

**Purpose**: Automatically improve response quality through re-retrieval and re-synthesis

**Trigger Conditions** (ALL must be true):
1. `reflection.shouldRetry === true`
2. `evaluation.overallScore < 0.7`
3. `retryCount < 2` (max 2 retries)

**Correction Strategies**:

#### Strategy 1: Low Relevance Correction

**Trigger**: `relevance < 0.6`

**Actions**:
1. Re-retrieve with broader search:
   - Increase primary docs from 4 to 6
   - Increase spillover from 1 to 2
2. Check if better docs found (score > 0.5)
3. Re-synthesize answer with new context
4. If still insufficient and Tavily available:
   - Call Tavily search
   - Re-synthesize with Tavily results

#### Strategy 2: Low Completeness Correction

**Trigger**: `completeness < 0.6`

**Actions**:
1. Re-run answer synthesizer with same context
2. LLM may generate more complete answer on second attempt
3. Re-evaluate after correction

**Re-evaluation**:
- After correction, re-run reflection node
- Get new metrics
- Check if quality improved

**Retry Limit**: Maximum 2 retries to avoid infinite loops

**Implementation**:
```typescript
export async function selfCorrectionNode(
  state: GraphState,
  retrieverService: RetrieverService,
  llmService: LlmChatService,
  tavilyService?: TavilyMcpService,
  knowledgeSaverService?: KnowledgeSaverService,
): Promise<GraphState> {
  const maxRetries = 2;
  const retryCount = (state.retryCount || 0) + 1;

  const shouldRetry =
    state.reflection?.shouldRetry &&
    retryCount <= maxRetries &&
    state.evaluation &&
    state.evaluation.overallScore < 0.7;

  if (!shouldRetry) {
    return state;
  }

  // Strategy 1: Low relevance → broader retrieval
  if (state.evaluation.relevance < 0.6) {
    // Re-retrieve with more docs
    // Re-synthesize
    // Try Tavily if needed
  }

  // Strategy 2: Low completeness → re-synthesize
  if (state.evaluation.completeness < 0.6) {
    // Re-run answer synthesizer
  }

  return state;
}
```

---

## 4. Tool-Calling Mechanisms

### Overview

The agent can call external tools to extend its capabilities beyond the knowledge base. Currently implements **Tavily search** for external knowledge retrieval.

### 4.1 Tavily Search Tool

**Service**: `backend/src/agent/tavily-mcp.service.ts`

**Purpose**: Search internet for information when knowledge base is insufficient

**Integration**:
- Direct API integration (MCP server package not available)
- Optional tool (requires API key)
- Fallback when RAG results are insufficient

**Usage Flow**:
```
1. RAG retrieval returns insufficient results
2. Check trigger conditions:
   - hasGoodResults === false OR hasExactMatch === false
   - intent !== 'unknown'
   - Tavily API key configured
3. Call Tavily search API
4. Retrieve top 3 results
5. Save results to knowledge base (self-learning)
6. Include results in answer synthesis
```

**Implementation**:
```typescript
async search(query: string, maxResults: number = 3): Promise<TavilySearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apiKey': this.configService.tavilyApiKey,
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: maxResults,
    }),
  });

  const data = await response.json();
  return data.results.map((result: any) => ({
    title: result.title,
    url: result.url,
    content: result.content,
    score: result.score,
  }));
}
```

**Result Format**:
```typescript
interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}
```

### 4.2 Food Logging Tool

**Service**: `backend/src/agent/food-tracking.service.ts`

**Purpose**: Extract food information from natural language and log to database

**Capabilities**:
1. **Food Extraction**: Extract food name(s), meal type, quantity from natural language
2. **Nutrition Lookup**: Search RAG for nutrition data
3. **Food Logging**: Save to food log using shared service

**Example**:
```
User: "I'm eating roti for lunch"
→ Extracts: {foodName: "roti", mealType: "lunch"}
→ Looks up nutrition from RAG
→ Logs to food log
→ Returns progress feedback
```

**Multiple Items Support**:
```
User: "I had biryani, lassi, and chicken 65"
→ Extracts: [
    {foodName: "biryani", mealType: "lunch"},
    {foodName: "lassi", mealType: "lunch"},
    {foodName: "chicken 65", mealType: "lunch"}
  ]
→ Looks up nutrition for each item
→ Logs all items sequentially
→ Returns combined progress feedback
```

### 4.3 Knowledge Saving Tool

**Service**: `backend/src/rag/knowledge-saver.service.ts`

**Purpose**: Automatically save external search results to knowledge base

**Process**:
1. Receives Tavily search results
2. Combines results into markdown document
3. Checks for duplicates (avoids re-saving)
4. Uses ingest service to save to knowledge base
5. Makes external knowledge available for future queries

**Self-Learning**:
- External knowledge becomes part of knowledge base
- Future queries can retrieve this information via RAG
- Reduces need for repeated external searches

**Implementation**:
```typescript
async saveSearchResultsToKnowledgeBase(
  query: string,
  results: TavilySearchResult[],
  domain: 'symptom' | 'food',
): Promise<{ documentsCreated: number; chunksCreated: number }> {
  // Check for duplicates
  const existingDoc = await this.ragDocModel.findOne({
    domain,
    title: `Internet Search: ${query}`,
  });

  if (existingDoc) {
    return { documentsCreated: 0, chunksCreated: 0 };
  }

  // Combine results into document
  const combinedContent = this.combineSearchResults(query, results);

  // Use ingest service to save
  return await this.ingestService.ingest({
    domain,
    docs: [{
      title: `Internet Search: ${query}`,
      text: combinedContent,
      tags: ['tavily-search', 'auto-generated'],
    }],
  });
}
```

### 4.4 Tool Integration in Agent Graph

**Tool Calling Flow**:
```
1. Intent Classification
   ↓
2. [If food-logging] Food Extraction Tool
   ↓
3. [If food-logging] Nutrition Lookup Tool
   ↓
4. [If food-logging] Food Logging Tool
   ↓
5. RAG Retrieval
   ↓
6. [If insufficient] Tavily Search Tool
   ↓
7. [If Tavily used] Knowledge Saving Tool
   ↓
8. Answer Synthesis
```

**Conditional Tool Execution**:
- Tools are called based on intent and conditions
- Tavily only called when RAG results insufficient
- Food logging tools only for food-logging intent
- All tools are optional (graceful degradation)

### Configuration

```env
# Tavily (Optional)
TAVILY_API_KEY=your_tavily_api_key_here
```

---

## 5. Evaluation

### Overview

The system implements comprehensive evaluation metrics to measure response quality across multiple dimensions. Evaluation happens automatically after each response and is used to trigger self-correction.

### 5.1 Evaluation Metrics

**Service**: `backend/src/agent/evaluation.service.ts`

**Metrics**:

#### 5.1.1 Relevance (30% weight)

**Purpose**: How well retrieved documents match the query

**Calculation**:
```typescript
// Extract key terms from query
const queryTerms = extractKeyTerms(query);

// Check if docs contain query terms
let matchingDocs = 0;
let totalScore = 0;

for (const doc of docs) {
  const hasMatch = queryTerms.some(term => 
    doc.text.toLowerCase().includes(term.toLowerCase())
  );
  if (hasMatch) matchingDocs++;
  totalScore += doc.score; // Similarity score
}

// Relevance = (matching ratio + average similarity) / 2
const matchingRatio = matchingDocs / docs.length;
const avgScore = totalScore / docs.length;
const relevance = (matchingRatio * 0.5 + Math.min(avgScore, 1) * 0.5);
```

**Range**: 0-1
- 0: No relevant documents
- 1: All documents highly relevant

#### 5.1.2 Clarity (25% weight)

**Purpose**: Is the answer clear and understandable?

**Calculation**:
```typescript
let score = 0.5; // Base score

// Summary length check (50-500 chars is good)
if (summaryLength >= 50 && summaryLength <= 500) {
  score += 0.2;
}

// Steps provided (actionable)
if (response.steps && response.steps.length > 0) {
  score += 0.15;
}

// Not a fallback message
if (!response.summary.includes("I don't have enough information")) {
  score += 0.15;
}
```

**Range**: 0-1
- 0: Unclear, fallback message
- 1: Clear, actionable answer

#### 5.1.3 Completeness (25% weight)

**Purpose**: Does the answer fully address the query?

**Calculation**:
```typescript
let score = 0.3; // Base score

// Answer not empty
if (response.summary && response.summary.length > 20) {
  score += 0.2;
}

// Steps provided (actionable answer)
if (response.steps && response.steps.length >= 2) {
  score += 0.25;
}

// Citations present (grounded answer)
if (response.citations && response.citations.length > 0) {
  score += 0.25;
}

// Query keywords in summary
const queryWords = extractKeyTerms(query);
const matchingWords = queryWords.filter(word => 
  summaryLower.includes(word.toLowerCase())
);
const wordMatchRatio = matchingWords.length / Math.max(queryWords.length, 1);
score += wordMatchRatio * 0.2;
```

**Range**: 0-1
- 0: Incomplete, doesn't address query
- 1: Complete, fully addresses query

#### 5.1.4 Citation Quality (20% weight)

**Purpose**: Are citations appropriate and present?

**Calculation**:
```typescript
if (!response.citations || response.citations.length === 0) {
  return 0;
}

let score = 0.5; // Base score for having citations

// Citation count (2-3 is ideal)
if (citationCount >= 2) score += 0.2;
if (citationCount >= 3) score += 0.1;

// Citations match retrieved docs
if (retrievedDocs.length > 0 && response.citations.length > 0) {
  score += 0.15; // Partial credit
}
```

**Range**: 0-1
- 0: No citations
- 1: Multiple appropriate citations

### 5.2 Overall Score

**Calculation**:
```typescript
overallScore = 
  (relevance * 0.30) +
  (clarity * 0.25) +
  (completeness * 0.25) +
  (citationQuality * 0.20)
```

**Threshold**: 0.7
- Below 0.7: Triggers self-correction
- Above 0.7: Acceptable quality

**Needs Improvement Flag**:
```typescript
needsImprovement = overallScore < 0.7;
```

### 5.3 Feedback Generation

**Purpose**: Provide specific feedback for improvement

**Implementation**:
```typescript
let feedback: string | undefined;
if (needsImprovement) {
  const issues: string[] = [];
  if (relevance < 0.6) issues.push('Low relevance to query');
  if (clarity < 0.6) issues.push('Answer lacks clarity');
  if (completeness < 0.6) issues.push('Answer is incomplete');
  if (citationQuality < 0.6) issues.push('Citations are insufficient');
  feedback = `Areas for improvement: ${issues.join(', ')}`;
}
```

### 5.4 Evaluation Persistence

**Storage**: Evaluation metrics stored with each message

**Schema**: `backend/src/chat/schemas/message.schema.ts`
```typescript
{
  evaluation?: {
    relevance: number;
    clarity: number;
    completeness: number;
    citationQuality: number;
    overallScore: number;
    needsImprovement: boolean;
    feedback?: string;
  };
  retryCount?: number;
}
```

**API Endpoints**:
- `GET /chat/evaluation/:messageId` - Get metrics for specific message
- `GET /chat/evaluations/user/:userId` - Get aggregate statistics

### 5.5 Aggregate Statistics

**Purpose**: Track evaluation metrics over time

**Metrics**:
- Total evaluations
- Average scores (relevance, clarity, completeness, citation quality)
- Needs improvement count
- Improvement rate
- Total retries
- Average retries per message

**Example Response**:
```json
{
  "success": true,
  "statistics": {
    "totalEvaluations": 50,
    "averageRelevance": 0.82,
    "averageClarity": 0.88,
    "averageCompleteness": 0.85,
    "averageCitationQuality": 0.80,
    "averageOverallScore": 0.84,
    "needsImprovementCount": 5,
    "improvementRate": 0.10,
    "totalRetries": 8,
    "averageRetriesPerMessage": 0.16
  }
}
```

### 5.6 Evaluation in Self-Correction

**Re-evaluation After Correction**:
```typescript
// After self-correction, re-evaluate
if (state.retryCount && state.retryCount > 0 && state.response) {
  logger.log('Re-evaluating after self-correction');
  state = await reflectionNode(state, evaluationService, reflectionService);
}
```

**Quality Improvement Tracking**:
- Compare scores before and after correction
- Track improvement rate
- Monitor retry effectiveness

### Configuration

```env
# Evaluation thresholds are hardcoded in code:
# - Overall score threshold: 0.7
# - Individual metric thresholds: 0.6
# - Max retries: 2
```

---

## Summary

This Health Bot AI system implements a comprehensive agentic AI architecture with:

1. **Data Preparation & Contextualization**: Hybrid pattern combining deterministic state (diet plan, progress) with adaptive conversation context (fixed window)

2. **RAG Pipeline**: Hybrid search (keyword + vector) with external knowledge integration (Tavily) and self-learning capabilities

3. **Reasoning & Reflection**: Self-reflective architecture with intent classification, safety guardrails, answer synthesis, and automatic self-correction

4. **Tool-Calling**: Tavily search, food logging, and knowledge saving tools with conditional execution

5. **Evaluation**: Comprehensive metrics (relevance, clarity, completeness, citation quality) with automatic persistence and aggregate statistics

All components work together to provide accurate, context-aware, and self-improving health and nutrition assistance.

