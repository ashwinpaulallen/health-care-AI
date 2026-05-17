# AI Agent Memory Management Patterns

This document explains how memory is managed for AI Agents in this health-care AI POC project.

## Overview

The project implements a **hybrid context pattern** with **persistent conversation storage**. The agent uses:

- **Deterministic state** (always accurate): Diet plan, progress, rolling window stats
- **Simple conversation context** (fixed window): Last N messages kept in full
- **Persistent storage**: Conversation history stored in MongoDB for context retrieval

See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) and [CONTEXT_ARCHITECTURE.md](./CONTEXT_ARCHITECTURE.md) for detailed architecture.

---

## Memory Management Patterns

### 1. **Context-Aware Agent Execution** ⚡

**Pattern**: Each query is processed with context from deterministic state and conversation history.

**Implementation**:

- The `runAgentGraph()` function receives `AgentContext` with deterministic state and conversation context
- Context is built by `ContextBuilderService` before agent execution
- Each agent execution starts with a fresh `GraphState` object but includes context

**Code Location**: `backend/src/agent/context-builder.service.ts`, `backend/src/agent/graph.ts`

```typescript
// Context is built before agent execution
const agentContext = await contextBuilderService.buildContext(
  userId,
  convId,
  dietPlanModel,
  foodLogModel,
  messageModel,
);

// Agent receives context
const { response } = await runAgentGraph(
  userQuery,
  // ... services
  agentContext,  // Context injected
);
```

**Context Components**:

- ✅ **Deterministic State**: Diet plan, today's consumption, rolling window stats (always accurate)
- ✅ **Conversation Context**: Last N messages in full (simple fixed window, no summarization)
- ✅ **RAG Results**: Fresh retrieval per query (adaptive)

**Benefits**:

- ✅ Context-aware responses using diet plan and progress
- ✅ Multi-turn conversation support (fixed window)
- ✅ Predictable deterministic state (no context drift)
- ✅ Lower token usage (simple fixed window, no summarization)

---

### 2. **In-Memory Graph State** 🔄

**Pattern**: State is maintained only during a single agent execution.

**Implementation**:

- `GraphState` interface holds all intermediate data during execution
- State is passed between nodes and mutated progressively
- State is discarded after response is generated

**GraphState Structure** (`backend/src/agent/graph.ts:13-46`):

```typescript
export interface GraphState {
  userQuery: string;              // Original query
  intent?: 'symptom' | 'food' | 'food-logging' | 'unknown';
  primaryDocs?: RetrievedChunk[];  // RAG results
  spilloverDocs?: RetrievedChunk[];
  tavilyResults?: TavilySearchResult[];
  usedTavily?: boolean;
  safetyLevel?: 'self-care' | 'caution' | 'seek-care';
  response?: AgentResponse;       // Final response
  evaluation?: EvaluationMetrics;
  reflection?: ReflectionResult;
  retryCount?: number;
  agentContext?: AgentContext;    // Complete context: deterministic state + conversation
  // Food logging state
  foodLogging?: { ... };
}
```

**State Flow**:

1. **Intent Classifier** → Sets `intent`
2. **Retriever** → Sets `primaryDocs`, `spilloverDocs`, `tavilyResults`
3. **Safety Guard** → Sets `safetyLevel`
4. **Answer Synthesizer** → Sets `response`
5. **Reflection** → Sets `evaluation`, `reflection`
6. **Self-Correction** → May update `response`, `retryCount`

**Memory Lifecycle**:

- Created: At start of `runAgentGraph()`
- Mutated: Through each node execution
- Discarded: After response is returned

---

### 3. **Persistent Conversation Storage** 💾

**Pattern**: Conversation and message history stored in MongoDB and used for agent context via `ContextBuilderService`.

**Storage Schema**:

**Conversations** (`backend/src/chat/schemas/conversation.schema.ts`):

```typescript
@Schema({ collection: 'conversations' })
export class Conversation {
  userId: string;        // Indexed
  startedAt: Date;
  lastAt: Date;
}
```

**Messages** (`backend/src/chat/schemas/message.schema.ts`):

```typescript
@Schema({ collection: 'messages' })
export class Message {
  convId: Types.ObjectId;  // Links to conversation
  role: 'user' | 'assistant' | 'tool';
  text: string;            // Message content
  json?: Record<string, any>;  // Structured response data
  intent?: string;
  topDocs?: Array<{ ... }>;    // Retrieved documents
  evaluation?: { ... };         // Quality metrics
  retryCount?: number;
  createdAt: Date;
}
```

**Storage Process** (`backend/src/agent/graph.ts:752-901`):

1. **Get/Create Conversation**: Retrieve or create conversation record
2. **Persist User Message**: Save user query to MongoDB
3. **Run Agent Graph**: Process query (stateless)
4. **Persist Assistant Message**: Save response with metadata

**Retrieval** (`backend/src/chat/chat.controller.ts:86-128`):

- Can fetch last 50 messages for a conversation
- Used for UI display, not agent context
- Limited to 50 messages to prevent memory issues

```typescript
// Fetch last 50 messages for reloads
const messages = await this.messageModel
  .find({ convId: new Types.ObjectId(convId) })
  .sort({ createdAt: -1 })
  .limit(50)  // Hard limit
  .exec();
```

**Context Usage**:

- **ContextBuilderService** retrieves last N messages (default: 3) for conversation context
- Simple fixed window approach (no summarization)
- Messages are included in agent context for multi-turn support
- See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for details

---

### 4. **Context Window Management** 📏

**Pattern**: Strict limits on context size sent to LLM to prevent overflow.

**Implementation**:

**Document Truncation** (`backend/src/agent/graph.ts:354-377`):

```typescript
// Truncate excerpts to stay under ~1500 tokens (~6000 chars)
const maxTotalChars = 6000;
const excerpts: string[] = [];
let currentChars = 0;

for (let idx = 0; idx < Math.min(allDocs.length, 5); idx++) {
  const doc = allDocs[idx];
  const remainingChars = maxTotalChars - currentChars;
  if (remainingChars < 100) break;

  const maxDocChars = Math.min(remainingChars - 50, 800);
  const truncatedText = doc.text.substring(0, maxDocChars);
  // ...
}
```

**Token Limits** (`backend/src/agent/llm.chat.service.ts`):

- `chatJSON()`: `max_tokens: 2000` (response limit)
- `chat()`: `max_tokens: 1500` (response limit)
- Context: ~6000 characters (~1500 tokens) for retrieved documents

**Tavily Results Truncation** (`backend/src/agent/graph.ts:348-350`):

```typescript
state.tavilyResults.slice(0, 3).forEach((result, idx) => {
  tavilyContext += `\n[Source ${idx + 1}: ${result.title}]\n${result.content.substring(0, 500)}\n`;
});
```

**Limits Applied**:

- Max 5 documents included
- Max 800 chars per document
- Max 6000 chars total for excerpts
- Max 3 Tavily results
- Max 500 chars per Tavily result

---

### 5. **RAG-Based Context Instead of History** 🔍

**Pattern**: Uses retrieved documents from knowledge base instead of conversation history.

**Why This Approach?**:

- ✅ More accurate - uses verified knowledge base
- ✅ No context drift - each query gets fresh context
- ✅ Scalable - knowledge base grows, not conversation history
- ✅ Consistent - same query gets same context

**Implementation**:

1. **Retrieval**: Fetch relevant chunks from knowledge base
2. **Spillover**: Get related chunks from other domains
3. **Tavily Fallback**: Search internet if knowledge base insufficient
4. **Context Assembly**: Combine retrieved chunks into prompt

**Code**: `backend/src/agent/graph.ts:117-235`

---

### 6. **Context Builder Service** 🏗️

**Pattern**: Unified service for building agent context with deterministic state and conversation context.

**Implementation** (`backend/src/agent/context-builder.service.ts`):

```typescript
// Build complete context
const agentContext = await contextBuilderService.buildContext(
  userId,
  convId,
  dietPlanModel,
  foodLogModel,
  messageModel,
);

// Returns:
interface AgentContext {
  deterministicState: {
    userId: string;
    profile?: { allergies, dietaryRestrictions };
    dietPlan?: { name, dailyMacroTargets, goals };
    todayConsumption?: { calories, protein, carbs, fat, fiber };
    rollingWindowStats?: { averages, trend, windowDays };
  };
  conversationContext: {
    recentMessages: Array<{ role, text, intent }>; // Last N messages
  };
}
```

**Deterministic State** (always accurate):

- User profile (allergies, restrictions)
- Active diet plan with targets
- Today's consumption totals
- Rolling window stats (N-day averages, trend)

**Conversation Context** (simple fixed window):

- Last N messages kept in full (default: 3)
- No summarization (kept simple)
- Retrieved from MongoDB per query

**Usage in Prompts**:

- Deterministic state injected into answer synthesizer
- Conversation context included for multi-turn support
- Helps personalize responses with diet plan and progress

**Memory Impact**:

- Deterministic state: ~200-300 tokens
- Conversation context: ~100-200 tokens per message (N messages)
- Fetched fresh each query
- See [CONTEXT_ARCHITECTURE.md](./CONTEXT_ARCHITECTURE.md) for details

---

### 7. **Evaluation and Reflection Memory** 📊

**Pattern**: Quality metrics are calculated and stored, but not used for future queries.

**Storage**:

- Evaluation metrics stored with each assistant message
- Includes: relevance, clarity, completeness, citation quality
- Used for analytics, not agent improvement

**Reflection**:

- LLM-based reflection on response quality
- Determines if retry is needed
- Stored but not persisted across queries

**Code**: `backend/src/agent/evaluation.service.ts`, `backend/src/agent/reflection.service.ts`

---

## Memory Management Summary

| Aspect                   | Pattern              | Implementation                                               |
| ------------------------ | -------------------- | ------------------------------------------------------------ |
| **Agent State**          | Context-aware        | Fresh `GraphState` with `AgentContext`                       |
| **Conversation History** | Tiered summarization | Last 3 messages (full) + summaries for long conversations    |
| **Context Window**       | Strict limits        | 6000 chars for docs, 2000 tokens response                    |
| **RAG Context**          | Fresh retrieval      | Knowledge base chunks per query                              |
| **Deterministic State**  | Always accurate      | Diet plan, progress, rolling stats via ContextBuilderService |
| **Evaluation**           | Stored for analytics | Not used for agent improvement                               |

---

## Current Implementation

### ✅ Multi-Turn Context (IMPLEMENTED)

- ✅ Agent can reference previous messages
- ✅ Follow-up questions are understood
- ✅ Simple fixed window approach (last N messages, no summarization)
- ✅ ContextBuilderService manages context building

### ✅ Context Builder Service (IMPLEMENTED)

- ✅ Unified service for building agent context
- ✅ Separates deterministic state from conversation context
- ✅ Hybrid pattern: deterministic for accuracy, simple for conversation
- ✅ See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for details

### ❌ No Memory Optimization

- All messages stored indefinitely
- No automatic cleanup of old conversations
- No message deduplication

### ❌ No Context Caching

- RAG retrieval happens fresh each time
- No caching of frequently accessed documents
- Diet plan fetched every query

---

## Potential Improvements

### 1. **✅ Context Builder Service (IMPLEMENTED)**

- ✅ ContextBuilderService builds deterministic state + conversation context
- ✅ Simple fixed window approach (no summarization)
- ✅ Hybrid pattern: deterministic state + simple conversation context

See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) and [CONTEXT_ARCHITECTURE.md](./CONTEXT_ARCHITECTURE.md) for details.

### 2. **Incremental Summarization**

- Only summarize new messages since last summary
- Cache summaries to avoid regeneration
- Reduce summarization latency

### 3. **Smart Context Selection**

- Use semantic similarity to select most relevant messages
- Adaptive window size based on conversation length
- Prioritize messages with high relevance scores

### 4. **Context Window Budget Management**

```typescript
interface ContextBudget {
  systemPrompt: number;
  conversationHistory: number;
  retrievedDocs: number;
  dietPlan: number;
  total: number;
}
```

### 5. **Message Cleanup**

- Automatic deletion of old conversations
- Archive inactive conversations
- Compress old messages

---

## Configuration

```env
# Conversation Context
CONVERSATION_CONTEXT_ENABLED=true
CONVERSATION_RECENT_MESSAGES=3  # Default: 3 messages (always in full)
CONVERSATION_SUMMARIZE_AFTER=20 # Default: 20 messages (start summarization)

# Rolling Window
ROLLING_WINDOW_DAYS=7  # Default: 7 days for rolling stats
```

**Hardcoded Limits**:

- **Message Limit**: 50 messages per conversation fetch
- **Context Limit**: 6000 characters for documents
- **Response Limit**: 2000 tokens for JSON, 1500 for text
- **Document Limit**: 5 documents max
- **Tavily Limit**: 3 results max

---

## Conclusion

The current implementation uses a **hybrid context pattern** with **ContextBuilderService** that combines:

✅ **Deterministic State** (always accurate):

- Diet plan, progress, rolling window stats
- User profile (allergies, restrictions)
- Always calculated accurately, never adaptive

✅ **Simple Conversation Context** (fixed window):

- Last N messages kept in full (default: 3)
- No summarization (kept simple for reliability)
- Enables multi-turn conversation support

✅ **Benefits**:

- Context-aware responses using diet plan and progress
- Multi-turn conversation support
- Predictable deterministic state (no context drift)
- Lower token costs (simple fixed window)
- Easier to debug

This hybrid pattern provides the best balance of accuracy, simplicity, and functionality for the POC. See [CONTEXT_ARCHITECTURE.md](./CONTEXT_ARCHITECTURE.md) for the recommended pattern.
