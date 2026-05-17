# Context Architecture - Hybrid Pattern

This document describes the recommended hybrid pattern for context management in the health-care AI POC.

## Philosophy

**Adaptive Context Management (ACM) is best for:**
- ✅ Selecting which old chat messages are relevant
- ✅ RAG retrieval over symptom/food knowledge
- ✅ Choosing which summaries to show

**Deterministic state is best for:**
- ✅ Core numeric logic (nutrient targets, rolling windows, trends)
- ✅ User identity/profile, conditions, allergies
- ✅ Safety-critical decisions (red flags → "seek-care")

## Recommended Pattern

### 1. Always Deterministic

These are **never** adaptive - always calculated accurately:

- **Profile**: Allergies, dietary restrictions, conditions
- **Diet Plan**: Daily macro targets (calories, protein, carbs, fat, fiber)
- **Today's Totals**: Current consumption for today
- **7-day Stats**: Rolling window averages and trend analysis
- **Pattern Flags**: Trend indicators (improving/declining/stable)

### 2. Simple Conversation Context

- **Last 3-5 messages**: Keep in full (simple recency)
- **No summarization**: For now, keep it simple
- **Future**: Optional 1-2 older messages or summary, selected adaptively

### 3. Knowledge (RAG)

- **RAG with embeddings**: From LM Studio → top-k chunks only
- **Adaptive selection**: Based on semantic similarity
- **Tavily fallback**: For external knowledge when needed

## Implementation

### ContextBuilder Service

The `ContextBuilderService` implements this pattern:

```typescript
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

### Graph Flow

```
1. ContextBuilder Node (implicit)
   ├─→ Pulls stable state (profile, stats, flags) - DETERMINISTIC
   ├─→ Pulls recent messages (fixed window) - SIMPLE
   └─→ Optionally hits ConversationRetriever for older pieces (FUTURE)

2. Intent Classifier Node
   └─→ Uses agentContext for context-aware classification

3. Retriever Node
   └─→ RAG retrieval (ADAPTIVE - semantic similarity)

4. Safety Guard Node
   └─→ Uses deterministic state for safety decisions

5. Answer Synthesizer Node
   ├─→ Uses deterministic state (always accurate)
   ├─→ Uses conversation context (simple recency)
   └─→ Uses RAG results (adaptive retrieval)
```

## Key Principles

### Deterministic = Always Accurate

```typescript
// ✅ GOOD: Deterministic calculation
const remaining = {
  calories: Math.max(0, targets.calories - consumed.calories),
  protein: Math.max(0, targets.protein - consumed.protein),
  // ... always accurate, never adaptive
};

// ❌ BAD: Adaptive calculation for numeric logic
const remaining = await llmService.calculateRemaining(targets, consumed); // NO!
```

### Simple Conversation = Fixed Window

```typescript
// ✅ GOOD: Simple fixed window
const recentMessages = messages.slice(-3); // Last 3 messages

// ❌ BAD: Complex summarization for short conversations
if (messages.length > 3) {
  await summarize(messages.slice(0, -3)); // Overkill for now
}
```

### Adaptive = Only for Selection

```typescript
// ✅ GOOD: Adaptive for RAG retrieval
const chunks = await retrieverService.retrieve(query, domain, topK);

// ✅ GOOD: Adaptive for message selection (future)
const relevantMessages = await selectRelevantMessages(query, allMessages);
```

## Current Implementation

### ContextBuilderService

- **buildContext()**: Main entry point
  - Calls `buildDeterministicState()` - always accurate
  - Calls `buildConversationContext()` - simple fixed window
  - Returns `AgentContext` with both

### Deterministic State Includes

1. **Profile**: Allergies, dietary restrictions (from diet plan)
2. **Diet Plan**: Name, targets, goals
3. **Today's Consumption**: Current intake, remaining macros
4. **Rolling Window Stats**: 7-day average, trend

### Conversation Context Includes

1. **Recent Messages**: Last N messages (default: 3)
2. **No Summarization**: Simple recency-based selection

## Future Enhancements

### Optional Adaptive Conversation Retrieval

```typescript
// Future: Adaptive selection of older messages
interface ConversationRetriever {
  selectRelevantMessages(
    query: string,
    allMessages: Message[],
    maxMessages: number
  ): Promise<Message[]>;
}
```

This would:
- Use semantic similarity to find relevant older messages
- Only include messages that are actually relevant to current query
- Still keep recent messages in full
- Optional summarization for very old messages

## Configuration

```env
# Conversation Context
CONVERSATION_CONTEXT_ENABLED=true
CONVERSATION_RECENT_MESSAGES=3  # Fixed window size

# Rolling Window (deterministic)
ROLLING_WINDOW_DAYS=7
```

## Benefits of This Pattern

1. **Reliability**: Deterministic state is always accurate
2. **Safety**: Critical decisions use deterministic logic
3. **Simplicity**: Conversation context is straightforward
4. **Performance**: No unnecessary summarization
5. **Scalability**: Can add adaptive features later

## Example Flow

```
User: "I feel bloated"
→ ContextBuilder: 
   - Deterministic: No diet plan, no consumption
   - Conversation: Empty (first message)
→ Agent: Answers based on RAG only

User: "What about rice?"
→ ContextBuilder:
   - Deterministic: Still no diet plan
   - Conversation: ["User: I feel bloated", "Assistant: ..."]
→ Agent: Answers with conversation context

User: "Can I eat paneer?"
→ ContextBuilder:
   - Deterministic: Diet plan found! Targets, today's consumption, 7-day stats
   - Conversation: Last 2 messages
→ Agent: Answers with both deterministic state and conversation context
```

## Conclusion

This hybrid pattern provides:
- ✅ **Deterministic accuracy** for critical data
- ✅ **Simple conversation context** for multi-turn support
- ✅ **Adaptive retrieval** for knowledge base
- ✅ **Room for growth** with optional adaptive conversation retrieval

The key insight: **Not everything needs to be adaptive**. Use deterministic state for facts, adaptive selection for relevance.

