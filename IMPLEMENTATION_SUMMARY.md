# Implementation Summary - Hybrid Context Pattern

## What Was Implemented

Refactored the conversation context implementation to follow the **recommended hybrid pattern** that separates:

1. **Deterministic State** (always accurate)
2. **Simple Conversation Context** (fixed window)
3. **Adaptive RAG Retrieval** (semantic similarity)

## Key Changes

### 1. ContextBuilderService (`context-builder.service.ts`)

**New service** that implements the hybrid pattern:

- **buildDeterministicState()**: 
  - Fetches user profile (allergies, restrictions)
  - Fetches active diet plan with targets
  - Calculates today's consumption
  - Calculates rolling window stats (7-day average, trend)
  - All calculations are **deterministic** (never adaptive)

- **buildConversationContext()**:
  - Simple fixed window approach
  - Keeps last N messages in full (default: 3)
  - No summarization (kept simple as recommended)
  - Future: Can add adaptive selection later

### 2. GraphState Refactoring

**Before:**
```typescript
interface GraphState {
  dietPlan?: { ... };
  conversationContext?: ConversationContext;
}
```

**After:**
```typescript
interface GraphState {
  agentContext?: AgentContext; // Unified context
}

interface AgentContext {
  deterministicState: DeterministicState;  // Always accurate
  conversationContext: ConversationContext; // Simple fixed window
}
```

### 3. Answer Synthesizer Updates

Now uses:
- **Deterministic state**: Profile, diet plan, today's consumption, rolling stats
- **Simple conversation**: Last 3 messages in full
- **RAG results**: Adaptive retrieval (unchanged)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              ContextBuilderService                       │
│                                                          │
│  ┌──────────────────────┐  ┌─────────────────────────┐ │
│  │ Deterministic State  │  │ Conversation Context    │ │
│  │                      │  │                         │ │
│  │ • Profile            │  │ • Last N messages        │ │
│  │ • Diet Plan          │  │ • Simple recency        │ │
│  │ • Today's Totals     │  │ • No summarization      │ │
│  │ • 7-day Stats       │  │                         │ │
│  │ • Trend Analysis     │  │                         │ │
│  │                      │  │                         │ │
│  │ Always Accurate      │  │ Fixed Window            │ │
│  └──────────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Agent Graph                           │
│                                                          │
│  1. Intent Classifier                                    │
│  2. Retriever (RAG - Adaptive)                           │
│  3. Safety Guard (Uses Deterministic State)             │
│  4. Answer Synthesizer                                  │
│     ├─→ Deterministic State (always accurate)          │
│     ├─→ Conversation Context (simple recency)           │
│     └─→ RAG Results (adaptive retrieval)               │
│  5. Reflection & Evaluation                             │
│  6. Self-Correction                                     │
└─────────────────────────────────────────────────────────┘
```

## What's Deterministic vs Adaptive

### ✅ Deterministic (Always Accurate)

- User profile (allergies, restrictions)
- Diet plan targets
- Today's consumption totals
- Remaining macros calculation
- Rolling window averages
- Trend analysis (improving/declining/stable)
- Safety level determination

### ✅ Adaptive (Selection-Based)

- RAG retrieval (semantic similarity)
- Document selection (top-k chunks)
- Tavily search results

### ✅ Simple (Fixed Window)

- Conversation context (last N messages)
- No summarization (for now)
- Future: Optional adaptive message selection

## Benefits

1. **Reliability**: Critical data is always accurate
2. **Safety**: Safety decisions use deterministic logic
3. **Simplicity**: Conversation context is straightforward
4. **Performance**: No unnecessary LLM calls for summarization
5. **Maintainability**: Clear separation of concerns

## Configuration

```env
# Conversation Context (Simple)
CONVERSATION_CONTEXT_ENABLED=true
CONVERSATION_RECENT_MESSAGES=3  # Fixed window

# Rolling Window (Deterministic)
ROLLING_WINDOW_DAYS=7
```

## Example Usage

```typescript
// ContextBuilder automatically:
// 1. Fetches deterministic state (diet plan, stats)
// 2. Fetches conversation context (last 3 messages)
// 3. Combines into AgentContext

const agentContext = await contextBuilderService.buildContext(
  userId,
  convId,
  dietPlanModel,
  foodLogModel,
  messageModel,
);

// Agent uses both:
// - Deterministic state for accurate calculations
// - Conversation context for multi-turn awareness
// - RAG for knowledge retrieval
```

## Future Enhancements

1. **Adaptive Message Selection**: Use semantic similarity to select relevant older messages
2. **Optional Summarization**: Only when conversation is very long (>20 messages)
3. **Context Compression**: Further optimize for very long conversations

## Files Changed

- ✅ `context-builder.service.ts` - New service
- ✅ `graph.ts` - Updated to use AgentContext
- ✅ `chat.controller.ts` - Uses ContextBuilderService
- ✅ `agent.module.ts` - Exports ContextBuilderService
- ✅ `config.service.ts` - Added conversation context config

## Migration Notes

The old `ConversationContextService` and `ConversationSummarizerService` are still available but not used by default. They can be used for future adaptive features.

The new pattern is **simpler and more reliable** for the POC use case.

