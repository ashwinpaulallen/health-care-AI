# Health Bot AI — Complete Health & Nutrition Management System

A comprehensive local-only health and nutrition management application featuring:

- **AI Chat Assistant**: RAG-powered symptom and nutrition Q&A with Tavily search integration
- **Self-Reflective Agent**: Autonomous reasoning with self-evaluation and self-correction capabilities
- **Conversational Food Tracking**: Log single or multiple food items directly in chat using natural language ("I'm eating roti for lunch" or "I had biryani, lassi, and chicken 65")
- **Multi-Turn Conversation Context**: Maintains conversation history with intelligent context management
- **Rolling Window Analytics**: Configurable N-day rolling window summary with trend analysis
- **Evaluation System**: Comprehensive metrics for accuracy, relevance, clarity, and completeness
- **Diet Plan Management**: Create personalized diet plans with macro targets
- **Food Tracking**: Log daily food intake via REST API or chat with AI-powered recommendations
- **Progress Analytics**: Track adherence and progress with detailed insights, real-time feedback, and today's progress display
- **Knowledge Base Admin**: Manage symptom and food knowledge bases
- **Self-Learning System**: Automatically saves external search results to knowledge base
- **Unified Food Logging Service**: Shared service architecture eliminating code duplication
- **Personalized Dietary Advice**: Context-aware recommendations using diet plan, progress, and rolling window stats

Built with NestJS, LangGraph TS, and Next.js, powered entirely by local LLMs via LM Studio.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [System Architecture](#system-architecture)
3. [Component Details](#component-details)
4. [Data Flow](#data-flow)
5. [Technology Stack](#technology-stack)
6. [Quick Start](#quick-start)
7. [Project Structure](#project-structure)
8. [API Documentation](#api-documentation)
9. [Development Guide](#development-guide)
10. [Recent Updates](#recent-updates) - Latest features and improvements
11. [LangGraph Agent Details](./LANGGRAPH.md) - Comprehensive agent architecture documentation
12. [Conversation Context](./CONVERSATION_CONTEXT.md) - Multi-turn conversation management
13. [Memory Management](./MEMORY_MANAGEMENT.md) - Context and memory patterns

---

## Architecture Overview

Health Bot AI is a full-stack application built on a microservices-inspired architecture with clear separation between frontend, backend, and data layers. The system uses **Retrieval Augmented Generation (RAG)** to provide accurate, cited responses, and **LangGraph** for intelligent agent orchestration.

### Key Architectural Principles

1. **Local-First**: All processing happens locally; no external API dependencies (except optional Tavily search)
2. **Privacy-Focused**: No PII storage beyond conversation user IDs
3. **Modular Design**: Clean separation of concerns with NestJS modules
4. **Self-Improving**: Automatically learns from external searches and saves to knowledge base
5. **Self-Reflective**: Agent evaluates its own responses and self-corrects when quality is low
6. **Safety-First**: Built-in medical disclaimers and safety guardrails
7. **Quality-Driven**: Continuous evaluation and improvement through reflection and correction loops
8. **Context-Aware**: Hybrid approach combining deterministic state (diet plan, progress) with adaptive conversation context
9. **DRY Architecture**: Shared services eliminate code duplication across REST API and chat interfaces

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Next.js Frontend (Port 3000)                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   Chat UI    │  │  Diet Plans  │  │  Admin Panel  │   │  │
│  │  │              │  │              │  │              │   │  │
│  │  │  React Query │  │  React Query │  │  React Query │   │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │  │
│  └─────────┼──────────────────┼──────────────────┼──────────┘  │
└────────────┼──────────────────┼──────────────────┼─────────────┘
             │                  │                  │
             │ HTTP/REST        │ HTTP/REST        │ HTTP/REST
             │                  │                  │
┌────────────┼──────────────────┼──────────────────┼─────────────┐
│            ▼                  ▼                  ▼             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  NestJS Backend (Port 3001)                               │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  API Layer (Fastify)                                │  │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │  │  │
│  │  │  │  Chat    │  │  Diet    │  │  Admin   │         │  │  │
│  │  │  │Controller│  │Controller│  │Controller│         │  │  │
│  │  │  └────┬─────┘  └────┬─────┘  └────┬─────┘         │  │  │
│  │  └───────┼─────────────┼─────────────┼───────────────┘  │  │
│  │          │             │             │                   │  │
│  │  ┌───────▼─────────────▼─────────────▼───────────────┐  │  │
│  │  │  Business Logic Layer                              │  │  │
│  │  │  ┌──────────────┐  ┌──────────────┐              │  │  │
│  │  │  │ Agent Graph  │  │ Diet Service │              │  │  │
│  │  │  │ (LangGraph)  │  │              │              │  │  │
│  │  │  └──────┬───────┘  └──────┬───────┘              │  │  │
│  │  └─────────┼──────────────────┼──────────────────────┘  │  │
│  │            │                  │                          │  │
│  │  ┌─────────▼──────────────────▼──────────────────────┐  │  │
│  │  │  Data Access Layer                                  │  │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │  │  │
│  │  │  │  RAG     │  │  Diet    │  │  Chat    │         │  │  │
│  │  │  │ Service  │  │ Service  │  │ Service  │         │  │  │
│  │  │  └────┬─────┘  └────┬─────┘  └────┬─────┘         │  │  │
│  │  └───────┼─────────────┼─────────────┼───────────────┘  │  │
│  └──────────┼─────────────┼─────────────┼──────────────────┘  │
└─────────────┼─────────────┼─────────────┼─────────────────────┘
              │             │             │
              ▼             ▼             ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │  MongoDB    │  │   Redis     │  │  LM Studio  │
    │  (Data)     │  │  (Cache)    │  │  (LLM API)  │
    └─────────────┘  └─────────────┘  └─────────────┘
```

### Agent Graph Architecture

The chat system uses **LangGraph** to orchestrate a multi-step agent workflow with self-reflection and self-correction:

```
┌─────────────────────────────────────────────────────────────┐
│                    User Query Input                         │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ Node 1: Intent │
                    │ Classifier     │
                    │ (LLM)         │
                    └────────┬───────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
  ┌─────────┐        ┌──────────────┐      ┌─────────┐
  │symptom  │        │ food-logging │      │ unknown │
  └────┬────┘        └──────┬───────┘      └────┬────┘
       │                    │                    │
       │                    │                    │
       │            ┌───────▼────────┐          │
       │            │ Food Extraction │          │
       │            │ (Extract food   │          │
       │            │  name & meal)   │          │
       │            └───────┬─────────┘          │
       │                    │                    │
       │            ┌───────▼────────┐          │
       │            │ Nutrition       │          │
       │            │ Lookup (RAG)    │          │
       │            └───────┬─────────┘          │
       │                    │                    │
       │            ┌───────▼────────┐          │
       │            │ Food Logging   │          │
       │            │ (Save all items│          │
       │            │  to DB)        │          │
       │            └───────┬─────────┘          │
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                            ▼
                    ┌────────────────┐
                    │ Node 2:        │
                    │ Retriever      │
                    │ (RAG + Tavily) │
                    │ (Skip for      │
                    │  food-logging) │
                    └────────┬───────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ Node 3:        │
                    │ Safety Guard   │
                    │ (Red Flags)    │
                    └────────┬───────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ Node 4:        │
                    │ Answer         │
                    │ Synthesizer    │
                    │ (LLM)          │
                    └────────┬───────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ Node 5:        │
                    │ Reflection &   │
                    │ Evaluation     │
                    │ (Metrics + LLM)│
                    └────────┬───────┘
                             │
                ┌────────────┼────────────┐
                │                          │
                ▼                          ▼
        ┌───────────────┐        ┌───────────────┐
        │ Score >= 0.7  │        │ Score < 0.7    │
        │ (Good)        │        │ (Needs Fix)    │
        └───────┬───────┘        └───────┬───────┘
                │                        │
                │                        ▼
                │                ┌────────────────┐
                │                │ Node 6:       │
                │                │ Self-         │
                │                │ Correction    │
                │                │ (Re-retrieve/ │
                │                │ Re-synthesize)│
                │                └───────┬───────┘
                │                        │
                │                        ▼
                │                ┌────────────────┐
                │                │ Re-evaluate    │
                │                │ (Node 5)       │
                │                └───────┬───────┘
                │                        │
                └────────────┬───────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  Final         │
                    │  Response +    │
                    │  Citations +   │
                    │  Evaluation    │
                    └────────────────┘
```

**See [LANGGRAPH.md](./LANGGRAPH.md) for detailed node-by-node explanation.**

### RAG System Architecture

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
│  └──────┬───────┘  • Generate metadata                      │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Embedding    │  • Call LM Studio embedding API          │
│  │ Service      │  • Normalize vectors                      │
│  └──────┬───────┘  • Batch processing                       │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ MongoDB      │  • Store documents (rag_documents)       │
│  │ Storage      │  • Store chunks (rag_chunks)             │
│  └──────┬───────┘  • Index embeddings                      │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Redis Cache  │  • Cache embeddings                       │
│  │              │  • TTL: 3600s                            │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Query Retrieval                           │
│  ┌──────────────┐                                           │
│  │ User Query   │                                           │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Text Search  │  • MongoDB $text search                 │
│  │ (Pre-filter) │  • Get top candidates                    │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Generate     │  • Query embedding                        │
│  │ Query Embed  │                                           │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Cosine       │  • Calculate similarity                  │
│  │ Similarity   │  • Rerank results                        │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Filter &     │  • Apply threshold (0.3)                 │
│  │ Return Top K │  • Return top chunks                     │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### Diet Plan System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Diet Plan Flow                            │
│                                                              │
│  ┌──────────────┐                                           │
│  │ Create Plan  │  • Set macro targets                     │
│  │              │  • Define goals & restrictions           │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Active Plan  │  • Store in MongoDB                      │
│  │ (MongoDB)    │  • Calculate progress                    │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Log Food     │  • Food name + quantity                  │
│  │              │  • Auto-lookup nutrition                  │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Food Log     │  • Store daily intake                    │
│  │ (MongoDB)    │  • Calculate daily summary               │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ AI           │  • Compare intake vs targets             │
│  │ Recommendations│ • Generate meal suggestions            │
│  │              │  • Provide warnings & tips               │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Progress     │  • Calculate adherence                   │
│  │ Analytics    │  • Show trends                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Details

### Backend Components

#### 1. **Agent Module** (`backend/src/agent/`)

- **Purpose**: Orchestrates the LangGraph agent workflow with self-reflection and correction
- **Components**:
  - `graph.ts`: Defines agent nodes and state machine (7+ nodes including food tracking)
  - `llm.chat.service.ts`: LLM communication service
  - `tavily-mcp.service.ts`: External search integration
  - `evaluation.service.ts`: Response quality metrics calculation
  - `reflection.service.ts`: LLM-based self-evaluation and retry decision
  - `food-tracking.service.ts`: Natural language food extraction and logging (supports multiple items)
  - `context-builder.service.ts`: Builds deterministic state + conversation context (primary service)
  - `conversation-context.service.ts`: Legacy service (available but not used by default)
  - `conversation-summarizer.service.ts`: Legacy service (available but not used by default)
- **Key Features**:
  - Intent classification (symptom/food/food-logging/unknown)
  - **Food tracking in chat**: Natural language food logging for single or multiple items ("I'm eating roti for lunch" or "I had biryani, lassi, and chicken 65")
  - **Personalized dietary advice**: Context-aware recommendations for permission questions
  - **Multi-turn context**: Maintains conversation history with fixed window approach
  - **Context-aware responses**: Uses diet plan, progress, and conversation history
  - RAG retrieval with Tavily fallback
  - Safety guardrails
  - Answer synthesis with citations
  - **Self-reflection**: Evaluates response quality using metrics and LLM
  - **Self-correction**: Automatically re-retrieves and re-synthesizes on low quality
  - **Evaluation metrics**: Relevance, clarity, completeness, citation quality

#### 2. **RAG Module** (`backend/src/rag/`)

- **Purpose**: Document ingestion, embedding, and retrieval
- **Components**:
  - `ingest.service.ts`: Document parsing and chunking
  - `embedding.service.ts`: Vector embedding generation
  - `retriever.service.ts`: Hybrid search (text + vector)
  - `knowledge-saver.service.ts`: Save external search results
  - `admin.controller.ts`: Knowledge base CRUD operations
- **Key Features**:
  - Automatic chunking (500 chars, 50 overlap)
  - Embedding caching in Redis
  - Domain separation (symptom vs food)
  - Self-learning from external searches

#### 3. **Chat Module** (`backend/src/chat/`)

- **Purpose**: Conversation and message management
- **Components**:
  - `chat.controller.ts`: REST API endpoints
  - `conversation.schema.ts`: Conversation data model
  - `message.schema.ts`: Message data model (includes evaluation metrics)
- **Key Features**:
  - Conversation persistence
  - Message history
  - Diet plan context injection
  - **Evaluation persistence**: Stores quality metrics with each message
  - **Evaluation endpoints**: View metrics for individual messages or aggregate statistics

#### 4. **Diet Module** (`backend/src/diet/`)

- **Purpose**: Diet plan and food logging management
- **Components**:
  - `diet-plan.controller.ts`: Plan CRUD operations
  - `food-log.controller.ts`: Food logging and recommendations
  - `food-log.service.ts`: **Shared service for food logging logic** (eliminates duplication)
  - `food-search.controller.ts`: Food nutrition lookup
  - `diet-recommendation.service.ts`: AI-powered recommendations
- **Key Features**:
  - Macro target tracking
  - Daily food logging (REST API and chat)
  - **Rolling window summary**: Configurable N-day window with trend analysis
  - AI meal recommendations
  - Progress analytics with real-time feedback
  - **Unified logging**: Single service used by both REST API and chat

#### 5. **Common Module** (`backend/src/common/`)

- **Purpose**: Shared infrastructure
- **Components**:
  - `config.service.ts`: Environment configuration
  - `mongo.module.ts`: MongoDB connection
  - `redis.module.ts`: Redis caching
- **Key Features**:
  - Centralized configuration
  - Database connection pooling
  - Cache management

### Frontend Components

#### 1. **Chat Interface** (`frontend/src/app/page.tsx`)

- **Purpose**: Main chat UI for Q&A
- **Features**:
  - Real-time message display
  - Citation rendering
  - Empty state with quick actions
  - Modern animations

#### 2. **Diet Plan Pages** (`frontend/src/app/diet/`)

- **Components**:
  - `page.tsx`: Plan listing and active plan display
  - `create/page.tsx`: Plan creation form
  - `log/page.tsx`: Food logging interface
  - `progress/[id]/page.tsx`: Progress analytics with today's progress display
- **Features**:
  - Auto-populate nutrition from knowledge base
  - Real-time progress tracking
  - **Today's progress display**: Current day's macro consumption with progress bars
  - Rolling window summary with trend analysis
  - AI recommendations display

#### 3. **Admin Panel** (`frontend/src/app/admin/`)

- **Purpose**: Knowledge base management
- **Features**:
  - CRUD operations for documents
  - Domain separation (symptoms/food)
  - Document statistics

---

## Data Flow

### Chat Query Flow

```
1. User submits query
   │
   ▼
2. Frontend → POST /chat/message
   │
   ▼
3. ChatController receives request
   │
   ▼
4. runChatTurn() invoked
   │
   ▼
5. ContextBuilderService builds context:
   │   ├─→ Deterministic State:
   │   │   ├─→ Active diet plan
   │   │   ├─→ Today's consumption
   │   │   ├─→ Rolling window stats (N-day average)
   │   │   └─→ User profile (allergies, restrictions)
   │   └─→ Conversation Context:
   │       └─→ Last N messages (fixed window)
   │
   ▼
6. runAgentGraph() starts
   │
   ├─→ Intent Classifier Node
   │   └─→ LLM determines: symptom/food/food-logging/unknown
   │
   ├─→ [If food-logging intent]
   │   ├─→ Food Extraction Node
   │   │   └─→ Extract food name(s), meal type, quantity (supports multiple items)
   │   ├─→ Nutrition Lookup Node
   │   │   └─→ Search RAG for nutrition data (processes all items)
   │   └─→ Food Logging Node
   │       └─→ Save all items to food log using FoodLogService
   │
   ├─→ Retriever Node (skip for food-logging)
   │   ├─→ Search knowledge base (RAG)
   │   ├─→ If no good results → Tavily search
   │   └─→ Save Tavily results to knowledge base
   │
   ├─→ Safety Guard Node
   │   └─→ Check for red flags (symptom queries only)
   │
   ├─→ Answer Synthesizer Node
   │   ├─→ Build context with:
   │   │   ├─→ Retrieved chunks
   │   │   ├─→ Tavily results (if any)
   │   │   ├─→ Deterministic state (diet plan, progress)
   │   │   └─→ Conversation context (recent messages)
   │   └─→ Generate response with citations
   │       └─→ [For food-logging] Include progress feedback
   │
   ├─→ Reflection & Evaluation Node (skip for food-logging)
   │   ├─→ Calculate metrics (relevance, clarity, completeness, citations)
   │   ├─→ LLM-based reflection on quality
   │   └─→ Determine if retry needed (score < 0.7)
   │
   └─→ Self-Correction Node (if needed, skip for food-logging)
       ├─→ If low relevance: Re-retrieve with broader search
       ├─→ If low completeness: Re-synthesize answer
       ├─→ Fallback to Tavily if still insufficient
       └─→ Re-evaluate after correction
   │
   ▼
7. Save message to MongoDB (with evaluation metrics)
   │
   ▼
8. Return response to frontend
   │
   ▼
9. Display response with citations (or food logging confirmation)
```

### Food Logging Flow (Two Methods)

#### Method 1: REST API (Form-based)

```
1. User enters food name
   │
   ▼
2. Autocomplete searches knowledge base
   │
   ▼
3. User selects food or clicks "Lookup"
   │
   ▼
4. Frontend → GET /diet/food-search/nutrition
   │
   ▼
5. FoodSearchController
   ├─→ Search RAG for food info
   ├─→ Extract nutrition via LLM
   └─→ Return nutrition data
   │
   ▼
6. Auto-populate macro fields
   │
   ▼
7. User adds quantity & submits
   │
   ▼
8. Frontend → POST /diet/logs
   │
   ▼
9. FoodLogController → FoodLogService
   ├─→ Add food to log
   ├─→ Calculate daily summary
   ├─→ Calculate progress
   ├─→ Store in MongoDB
   └─→ Return updated log
   │
   ▼
10. Update progress bars in real-time
```

#### Method 2: Chat-based (Natural Language)

```
1. User types: "I'm eating roti for lunch" OR "I had biryani, lassi, and chicken 65"
   │
   ▼
2. Frontend → POST /chat/message
   │
   ▼
3. Agent Graph processes:
   ├─→ Intent: food-logging
   ├─→ Extract: food(s) and meal type (supports multiple items)
   ├─→ Lookup nutrition via RAG for each item
   ├─→ FoodLogService.addFoodToLog() (logs all items sequentially)
   ├─→ FoodLogService.calculateProgress()
   └─→ Generate feedback with combined nutrition and progress
   │
   ▼
4. Response includes:
   ├─→ Confirmation of logged food(s) (all items listed)
   ├─→ Combined nutrition values (total for all items)
   ├─→ Individual item breakdown (if multiple items)
   ├─→ Today's progress percentages
   └─→ Tips based on progress
   │
   ▼
5. All food items automatically saved to food log
```

---

## Technology Stack

### Backend

- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: NestJS 10+ (Fastify adapter)
- **Database**: MongoDB (local installation)
- **Cache**: Redis (Docker container)
- **AI Framework**: LangGraph TS
- **LLM Integration**: OpenAI SDK (pointed to LM Studio)
- **Search**: Tavily API (optional, for external knowledge)

### Frontend

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI Library**: Material-UI (MUI) 5
- **State Management**: React Query (TanStack Query)
- **Styling**: Emotion (CSS-in-JS)

### AI Models (via LM Studio)

- **Chat Model**: `openai/gpt-oss-20b`
- **Embedding Model**: `text-embedding-nomic-embed-text-v1.5`

### Infrastructure

- **Container**: Docker (for Redis)
- **Package Manager**: pnpm
- **Version Control**: Git

---

## Quick Start

### Prerequisites

1. **LM Studio** installed and running

   - Download: https://lmstudio.ai
   - Load chat model: `openai/gpt-oss-20b`
   - Load embedding model: `text-embedding-nomic-embed-text-v1.5`
   - Start server on port 1234

2. **MongoDB** installed locally

   - macOS: `brew install mongodb-community`
   - Start: `brew services start mongodb-community`

3. **Docker** for Redis

4. **Node.js 20+** and **pnpm**

### Installation Steps

```bash
# 1. Clone repository
git clone <repository-url>
cd health-care-AI

# 2. Start Redis
docker compose -f docker/redis/docker-compose.yml up -d

# 3. Configure environment
cp backend/backend.env.example backend/.env
cp frontend/frontend.env.example frontend/.env

# 4. Install backend dependencies
cd backend
pnpm install

# 5. Start backend
pnpm dev
# Backend runs on http://localhost:3001

# 6. Ingest knowledge base (in another terminal)
curl -X POST http://localhost:3001/rag/ingest
# Wait ~5-10 minutes for embeddings

# 7. Install frontend dependencies
cd ../frontend
pnpm install

# 8. Start frontend
pnpm dev
# Frontend runs on http://localhost:3000
```

### Verify Installation

1. Open http://localhost:3000
2. Try a symptom query: "I feel bloated after dinner"
3. Try a food query: "Is paneer butter masala healthy?"
4. **Try food logging in chat**: "I'm eating roti for lunch"
5. Create a diet plan at `/diet`
6. Log food at `/diet/log` (or via chat)
7. Check progress with rolling window summary at `/diet/progress/[planId]`

---

## Project Structure

```
health-care-AI/
├── backend/                          # NestJS Backend
│   ├── src/
│   │   ├── agent/                    # LangGraph agent orchestration
│   │   │   ├── graph.ts              # Agent state machine
│   │   │   ├── llm.chat.service.ts   # LLM communication
│   │   │   ├── tavily-mcp.service.ts # External search
│   │   │   ├── food-tracking.service.ts # Food extraction & logging
│   │   │   ├── context-builder.service.ts # Context management (primary - hybrid pattern)
│   │   │   ├── conversation-context.service.ts # Legacy (available but not used by default)
│   │   │   └── conversation-summarizer.service.ts # Legacy (available but not used by default)
│   │   ├── chat/                     # Chat management
│   │   │   ├── chat.controller.ts    # REST endpoints
│   │   │   └── schemas/              # Conversation & message models
│   │   ├── common/                   # Shared infrastructure
│   │   │   ├── config/               # Configuration service
│   │   │   ├── mongo/                # MongoDB connection
│   │   │   └── redis/                # Redis caching
│   │   ├── diet/                     # Diet plan system
│   │   │   ├── diet-plan.controller.ts
│   │   │   ├── food-log.controller.ts
│   │   │   ├── food-log.service.ts   # Shared food logging service
│   │   │   ├── food-search.controller.ts
│   │   │   ├── diet-recommendation.service.ts
│   │   │   └── schemas/              # Diet plan & food log models
│   │   ├── rag/                      # RAG system
│   │   │   ├── ingest.service.ts     # Document ingestion
│   │   │   ├── embedding.service.ts  # Vector embeddings
│   │   │   ├── retriever.service.ts  # Hybrid search
│   │   │   ├── knowledge-saver.service.ts # Save external results
│   │   │   ├── admin.controller.ts   # Knowledge base CRUD
│   │   │   └── schemas/              # Document & chunk models
│   │   └── app.module.ts             # Root module
│   └── package.json
│
├── frontend/                         # Next.js Frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              # Chat interface
│   │   │   ├── diet/                 # Diet plan pages
│   │   │   │   ├── page.tsx          # Plan listing
│   │   │   │   ├── create/           # Plan creation
│   │   │   │   ├── log/              # Food logging
│   │   │   │   ├── progress/         # Progress analytics
│   │   │   │   └── plan/             # Plan details
│   │   │   ├── admin/                # Admin panel
│   │   │   │   ├── symptoms/         # Symptom KB management
│   │   │   │   └── food/             # Food KB management
│   │   │   ├── api.ts                # Chat API client
│   │   │   ├── diet-api.ts           # Diet API client
│   │   │   └── admin-api.ts          # Admin API client
│   │   └── components/
│   │       ├── Chat/                 # Chat components
│   │       ├── Admin/                # Admin components
│   │       └── Navigation.tsx         # Global navigation
│   └── package.json
│
├── seeds/                            # Knowledge base documents
│   ├── symptoms.md                   # Symptom guidance
│   ├── food.md                       # Food & nutrition
│   ├── constipation.md               # Detailed symptom info
│   ├── fatigue.md                    # Detailed symptom info
│   ├── indian-vegetables.md          # Food information
│   └── healthy-snacks.md             # Food information
│
├── docker/
│   └── redis/
│       └── docker-compose.yml        # Redis container config
│
├── scripts/                          # Utility scripts
│   ├── ingest.http                   # RAG ingestion tests
│   ├── diet-test.http                # Diet API tests
│   └── ingest-expanded.sh            # Batch ingestion
│
├── README.md                         # This file
├── QUICK_START.md                    # Quick setup guide
├── backend.env.example               # Backend env template
└── frontend.env.example              # Frontend env template
```

---

## API Documentation

### Chat Endpoints

#### `POST /chat/message`

Send a chat message and get AI response. Supports symptom queries, food questions, and food logging.

**Request:**

```json
{
  "userId": "demo-user",
  "text": "I feel bloated after dinner",
  "convId": "optional-conversation-id"
}
```

**Response (Symptom/Food Query):**

```json
{
  "success": true,
  "convId": "conversation-id",
  "messageId": "message-id",
  "intent": "symptom",
  "level": "self-care",
  "summary": "Brief summary...",
  "steps": ["Step 1", "Step 2"],
  "citations": [{"title": "Document Title", "section": "Section Name"}],
  "evaluation": {
    "relevance": 0.85,
    "clarity": 0.90,
    "completeness": 0.88,
    "citationQuality": 0.85,
    "overallScore": 0.87,
    "needsImprovement": false
  },
  "retryCount": 0
}
```

**Response (Food Logging - Single Item):**

```json
{
  "success": true,
  "convId": "conversation-id",
  "messageId": "message-id",
  "intent": "food-logging",
  "summary": "✅ I've logged roti for your lunch!\n\n**Nutrition logged:**\n- Calories: 200\n- Protein: 6g\n...\n**Today's Progress:**\n- Calories: 45% of target (1100 remaining)\n...",
  "foodLogged": {
    "foodName": "roti",
    "mealType": "lunch",
    "nutrition": {
      "calories": 200,
      "protein": 6,
      "carbs": 40,
      "fat": 2,
      "fiber": 2
    },
    "progress": {
      "caloriesProgress": 45,
      "proteinProgress": 30,
      "remaining": {
        "calories": 1100,
        "protein": 120,
        "carbs": 160,
        "fat": 63,
        "fiber": 28
      }
    }
  }
}
```

**Response (Food Logging - Multiple Items):**

```json
{
  "success": true,
  "convId": "conversation-id",
  "messageId": "message-id",
  "intent": "food-logging",
  "summary": "✅ I've logged 3 items for your lunch!\n\n**Items logged:** mutton biryani, sweet lassi, chicken 65\n\n**Total Nutrition logged:**\n- Calories: 850\n- Protein: 35g\n...\n**Individual items:**\n1. mutton biryani: 500 cal, 20g protein...\n2. sweet lassi: 200 cal, 8g protein...\n3. chicken 65: 150 cal, 7g protein...\n**Today's Progress:**\n...",
  "foodLogged": {
    "foodName": "mutton biryani, sweet lassi, chicken 65",
    "mealType": "lunch",
    "nutrition": {
      "calories": 850,
      "protein": 35,
      "carbs": 95,
      "fat": 32,
      "fiber": 5
    },
    "progress": {
      "caloriesProgress": 65,
      "proteinProgress": 45,
      "remaining": {
        "calories": 450,
        "protein": 85,
        "carbs": 105,
        "fat": 33,
        "fiber": 25
      }
    }
  }
}
```

**Response (Permission Question - Personalized Advice):**

```json
{
  "success": true,
  "convId": "conversation-id",
  "messageId": "message-id",
  "intent": "food",
  "summary": "Yes, you can have 100g of chocolate ice cream! Based on your current status, 100g (~220 calories) fits within your remaining 800 calories for today. However, consider having it as a treat after meeting your protein goals.",
  "steps": [
    "100g chocolate ice cream ≈ 220 cal, which fits your remaining budget",
    "You have 800 calories remaining today, so this is within your limits",
    "Consider having it after your main meals to ensure you meet protein targets",
    "If you want a lighter option, 50g would be ~110 calories"
  ],
  "citations": []
}
```

**Example Food Logging Messages:**

- Single item: "I'm eating roti for lunch"
- Single item: "I had paneer for dinner"
- Single item: "Just ate some rice"
- Single item: "Having dal for breakfast"
- **Multiple items**: "I had half plate mutton biryani, sweet lassi and 3 piece chicken 65"
- **Multiple items**: "I'm eating roti, dal, and rice for lunch"

**Example Permission Questions:**

- "Can I have 100g of chocolate ice cream?"
- "Should I eat paneer for dinner?"
- "Is it ok to have 2 rotis for lunch?"

#### `GET /chat/evaluation/:messageId`

Get evaluation metrics for a specific message.

**Response:**

```json
{
  "success": true,
  "messageId": "message-id",
  "evaluation": {
    "relevance": 0.85,
    "clarity": 0.90,
    "completeness": 0.88,
    "citationQuality": 0.85,
    "overallScore": 0.87,
    "needsImprovement": false,
    "feedback": null
  },
  "retryCount": 0,
  "intent": "symptom",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### `GET /chat/evaluations/user/:userId`

Get aggregate evaluation statistics for a user.

**Response:**

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
  },
  "evaluations": [...]
}
```

### RAG Endpoints

#### `POST /rag/ingest`

Ingest all seed documents into knowledge base.

**Response:**

```json
{
  "success": true,
  "documentsCreated": 6,
  "chunksCreated": 45
}
```

#### `GET /admin/knowledge/:domain`

List all documents in a domain (symptom or food).

#### `POST /admin/knowledge/:domain`

Create a new knowledge base document.

#### `PUT /admin/knowledge/:domain/:id`

Update an existing document.

#### `DELETE /admin/knowledge/:domain/:id`

Delete a document.

### Diet Plan Endpoints

#### `POST /diet/plans`

Create a new diet plan.

**Request:**

```json
{
  "userId": "demo-user",
  "name": "Weight Loss Plan",
  "durationDays": 30,
  "dailyMacroTargets": {
    "calories": 2000,
    "protein": 150,
    "carbs": 200,
    "fat": 65,
    "fiber": 30
  },
  "goals": ["weight loss"],
  "dietaryRestrictions": ["vegetarian"]
}
```

#### `GET /diet/plans/user/:userId/active`

Get active diet plan for user.

#### `GET /diet/plans/user/:userId`

List all diet plans for user.

### Food Log Endpoints

#### `POST /diet/logs`

Log food intake.

**Request:**

```json
{
  "userId": "demo-user",
  "dietPlanId": "plan-id",
  "date": "2024-01-15",
  "food": {
    "name": "Roti",
    "quantity": "2 pieces",
    "mealType": "lunch",
    "macros": {
      "calories": 200,
      "protein": 6,
      "carbs": 40,
      "fat": 2,
      "fiber": 2
    }
  }
}
```

#### `GET /diet/logs/user/:userId/date/:date`

Get food log for a specific date.

#### `GET /diet/logs/user/:userId/recommendations?date=:date`

Get AI-powered meal recommendations.

#### `GET /diet/logs/user/:userId/progress/:planId`

Get progress statistics for a diet plan, including rolling window summary.

**Response:**

```json
{
  "success": true,
  "progress": {
    "totalDaysLogged": 15,
    "daysOnTrack": 12,
    "adherenceRate": 80,
    "averages": {
      "calories": 1950,
      "protein": 145,
      "carbs": 195,
      "fat": 63,
      "fiber": 28
    },
    "rollingWindow": {
      "windowDays": 7,
      "daysLogged": 7,
      "daysOnTrack": 6,
      "adherenceRate": 86,
      "averages": {...},
      "totals": {...},
      "targets": {...},
      "variance": {...},
      "trend": "improving"
    }
  }
}
```

#### `GET /diet/logs/user/:userId/rolling-window?date=:date&days=:days`

Get rolling window summary for a specific date range.

**Query Parameters:**

- `date` (optional): Target date (default: today)
- `days` (optional): Window size in days (default: from `ROLLING_WINDOW_DAYS` env var, default: 7)

**Response:**

```json
{
  "success": true,
  "rollingWindow": {
    "windowDays": 7,
    "daysLogged": 7,
    "daysOnTrack": 6,
    "adherenceRate": 86,
    "averages": {
      "calories": 1950,
      "protein": 145,
      "carbs": 195,
      "fat": 63,
      "fiber": 28
    },
    "totals": {...},
    "targets": {...},
    "variance": {...},
    "trend": "improving" | "declining" | "stable"
  }
}
```

### Food Search Endpoints

#### `GET /diet/food-search/search?q=:query`

Search for food in knowledge base.

#### `GET /diet/food-search/nutrition?food=:name&quantity=:qty`

Get nutrition information for a food item.

---

## Development Guide

### Backend Development

```bash
cd backend

# Install dependencies
pnpm install

# Development mode (hot-reload)
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint
```

### Frontend Development

```bash
cd frontend

# Install dependencies
pnpm install

# Development mode
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

### Environment Variables

#### Backend (`backend/.env`)

```env
# Server
PORT=3001
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb://localhost:27017/diet-coach-poc

# Redis
REDIS_URL=redis://localhost:6379

# LM Studio
LLM_BASE_URL=http://localhost:1234/v1
LLM_CHAT_MODEL=openai/gpt-oss-20b
EMBED_MODEL=text-embedding-nomic-embed-text-v1.5

# RAG Configuration
RAG_TOP_K=5
RAG_SIMILARITY_THRESHOLD=0.3
CHUNK_SIZE=500
CHUNK_OVERLAP=50

# Rolling Window Configuration
ROLLING_WINDOW_DAYS=7

# Conversation Context Configuration
CONVERSATION_CONTEXT_ENABLED=true
CONVERSATION_RECENT_MESSAGES=3  # Fixed window size (no summarization)
# Note: CONVERSATION_SUMMARIZE_AFTER is not used in current implementation (simple fixed window approach)

# Tavily (Optional)
TAVILY_API_KEY=your_tavily_api_key_here
```

#### Frontend (`frontend/.env`)

```env
NEXT_PUBLIC_API_BASE=http://localhost:3001
```

---

## Design Principles

1. **Local-First**: All processing happens locally; no external API dependencies (except optional Tavily)
2. **Privacy**: No PII storage beyond conversation user IDs
3. **Safety**: Always include medical disclaimers for health queries
4. **Transparency**: Provide citations for all RAG-based answers
5. **Modularity**: Clean separation of concerns across modules
6. **Self-Learning**: Automatically save external search results to knowledge base

---

## Features

### ✅ Implemented

- [x] RAG-powered chat assistant
- [x] Intent classification (symptom/food/food-logging/unknown)
- [x] **Food tracking in chat**: Natural language food logging for single or multiple items
- [x] **Personalized dietary advice**: Context-aware recommendations for permission questions
- [x] **Today's progress display**: Current day's progress with detailed breakdown on progress page
- [x] **Multi-turn conversation context**: Fixed-window conversation history with context-aware responses
- [x] **Rolling window analytics**: Configurable N-day rolling window summary with trend analysis
- [x] **Context builder service**: Unified deterministic state + conversation context management
- [x] **Unified food logging service**: Shared service eliminating code duplication
- [x] Safety guards and disclaimers
- [x] Citation tracking
- [x] Tavily search integration
- [x] Self-learning knowledge base
- [x] Diet plan creation and management
- [x] Daily food logging (REST API and chat)
- [x] Auto-populate nutrition from KB
- [x] AI-powered meal recommendations
- [x] Progress tracking and analytics with real-time feedback
- [x] Knowledge base admin interface
- [x] Separate symptom and food collections
- [x] Global navigation
- [x] Responsive UI with animations

### 🚀 Future Enhancements

- [ ] Adaptive conversation context retrieval (selective message retrieval)
- [ ] User authentication and profiles
- [ ] Weight tracking integration
- [ ] Meal planning and recipes
- [ ] Shopping list generation
- [ ] Barcode scanning for packaged foods
- [ ] Image recognition for food logging
- [ ] Export reports (PDF, CSV)
- [ ] Multi-language support
- [ ] Voice input/output
- [ ] Mobile app

---

## Troubleshooting

### LM Studio Connection Issues

- Ensure LM Studio server is running on port 1234
- Check models are loaded and active
- Verify `LLM_BASE_URL` in backend .env

### MongoDB Connection Failed

- Ensure MongoDB service is running: `brew services list`
- Check connection string in `MONGO_URI`

### Redis Connection Failed

- Verify Docker container is running: `docker ps`
- Check Redis logs: `docker-compose logs redis`

### Slow Response Times

- Ensure sufficient RAM for local models (16GB+ recommended)
- Consider using smaller/quantized models
- Check CPU/GPU usage in LM Studio

### Negative Progress Percentage

- Fixed in latest version - ensure backend is restarted
- Check diet plan start date is not in the future

---

## Recent Updates

### 🎉 Latest Features (2024)

#### 1. **Food Tracking in Chat** ✨

- Log food directly in chat using natural language
- **Single or multiple items**: "I'm eating roti for lunch" or "I had biryani, lassi, and chicken 65"
- Automatic nutrition lookup from knowledge base for all items
- **Structured UI display**: Beautiful card-based layout showing nutrition, progress bars, and tips
- Real-time progress feedback with tips
- Integrated into agent graph with reflection and evaluation

#### 2. **Rolling Window Summary** 📊

- Configurable N-day rolling window (default: 7 days)
- Calculates averages, totals, adherence rate, and trends
- Trend analysis: improving/declining/stable
- Accessible via API: `GET /diet/logs/user/:userId/rolling-window`
- Configurable via `ROLLING_WINDOW_DAYS` environment variable

#### 3. **Multi-Turn Conversation Context** 💬

- Maintains conversation history with **simple fixed-window approach** (no summarization)
- Last N messages kept in full (configurable, default: 3)
- Context-aware responses using diet plan and progress
- **Hybrid pattern**: Deterministic state (always accurate) + simple conversation context (fixed window)
- Configurable via environment variables:
  - `CONVERSATION_CONTEXT_ENABLED=true`
  - `CONVERSATION_RECENT_MESSAGES=3`
- **Note**: Uses `ContextBuilderService` which implements the recommended hybrid pattern (see `IMPLEMENTATION_SUMMARY.md`)

#### 4. **Context Builder Service** 🏗️

- **Unified service** for building agent context (primary service)
- **Hybrid pattern implementation**: Separates deterministic state from simple conversation context
  - **Deterministic state**: Always accurate (diet plan, today's consumption, rolling window stats, profile)
  - **Simple conversation context**: Fixed window approach (last N messages, no summarization)
- Used by all agent nodes for consistent context injection
- See `IMPLEMENTATION_SUMMARY.md` and `CONTEXT_ARCHITECTURE.md` for detailed architecture

#### 5. **Unified Food Logging Service** 🔄

- **Code refactoring**: Eliminated all duplicate code
- Single `FoodLogService` used by both REST API and chat
- Shared methods:
  - `calculateDailySummary()` - Calculate totals from food items
  - `calculateRemainingMacros()` - Calculate remaining macros
  - `addFoodToLog()` - Add food to log (creates or updates)
  - `calculateProgress()` - Calculate progress against targets
- Consistent behavior across all entry points

#### 6. **Enhanced Agent Graph** 🤖

- New intent: `food-logging` for natural language food tracking
- New nodes:
  - Food Extraction Node - Extracts food name(s), meal type, quantity (supports multiple items)
  - Nutrition Lookup Node - Searches RAG for nutrition data (processes all items)
  - Food Logging Node - Saves all items to food log using shared service
- Progress feedback integrated into responses
- Same reflection and evaluation system as other intents

#### 7. **Multiple Food Items Logging** 🍽️

- **Log multiple items in one message**: "I had half plate mutton biryani, sweet lassi and 3 piece chicken 65"
- Extracts all food items from a single message
- Looks up nutrition for each item individually
- Logs all items sequentially to food log
- Shows combined nutrition totals and individual item breakdowns
- Example response includes all logged items with total nutrition

#### 8. **Personalized Dietary Advice** 💡

- **Context-aware recommendations**: Uses profile, diet plan, today's consumption, and rolling window stats
- **Permission questions**: "Can I have 100g of chocolate ice cream?" gets personalized YES/NO advice
- **Smart fallback**: Even without knowledge base docs, uses general nutrition knowledge + user context
- Compares requested food against:
  - Today's remaining macros
  - Rolling window trends
  - User's goals and dietary restrictions
- Provides specific portion guidance and alternatives

#### 9. **Today's Progress Display** 📈

- **New section on progress page**: Shows current day's progress with detailed breakdown
- Displays all macros (calories, protein, carbs, fat, fiber) with:
  - Consumed vs target values
  - Progress bars with color coding
  - Remaining amounts
  - Variance indicators
- Additional info: meals logged, water intake, overall status
- Beautiful gradient card design with clear visual hierarchy

### 🔧 Code Quality Improvements

- **Zero Code Duplication**: All food logging logic consolidated into shared service
- **Multiple Items Support**: Enhanced food extraction to handle multiple items in single message
- **Smart Fallback Logic**: Permission questions with user context proceed even without KB docs
- **Type Safety**: Comprehensive TypeScript interfaces
- **Circular Dependency Resolution**: Using `forwardRef()` for module dependencies
- **Consistent Error Handling**: Standardized error responses
- **Better Logging**: Enhanced logging for debugging and monitoring
- **UI Enhancements**: Structured display for food logging responses with progress visualization

### 📚 Documentation Updates

- Added `CONVERSATION_CONTEXT.md` - Conversation context architecture
- Updated `MEMORY_MANAGEMENT.md` - Memory patterns and best practices
- Enhanced API documentation with food logging examples
- Updated architecture diagrams with new nodes

---

## License

This is a proof-of-concept project for demonstration purposes.

---

## Contributing

This is a POC project. For production use, consider:

- Adding authentication
- Implementing rate limiting
- Adding comprehensive error handling
- Setting up monitoring and logging
- Adding unit and integration tests
- Implementing CI/CD pipeline
