# Multi-Turn Conversation Context

This document describes the implementation of conversation context management for multi-turn conversations.

## Overview

The system supports **multi-turn conversation context** using a **simple fixed window approach** (no summarization). This enables the AI agent to:

- ✅ Maintain context across multiple conversation turns
- ✅ Reference previous questions and answers
- ✅ Handle follow-up questions intelligently
- ✅ Simple and reliable (no summarization complexity)

**Note**: The current implementation uses a **tiered summarization** approach for long conversations. For conversations with ≤20 messages, it uses a simple fixed window. For longer conversations, it generates summaries of older messages while keeping recent messages in full detail. The primary service is `ContextBuilderService` which implements the recommended hybrid pattern (deterministic state + conversation context with summarization).

See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) and [CONTEXT_ARCHITECTURE.md](./CONTEXT_ARCHITECTURE.md) for the current implementation details.

## Architecture

### Current Implementation (Simple Fixed Window)

**Primary Service**: `ContextBuilderService` (`context-builder.service.ts`)

- Builds complete agent context (deterministic state + conversation context)
- Tiered summarization for long conversations (>20 messages)
- Simple fixed window for short conversations (≤20 messages)
- Implements recommended hybrid pattern

**Summarization Service**: `ConversationSummarizerService` (`conversation-summarizer.service.ts`)

- LLM-based abstractive summarization
- Generates mid-term and long-term summaries
- Automatically triggered when conversation exceeds threshold
- Incremental updates (only regenerates when needed)

**GraphState Integration** (`graph.ts`)

- `agentContext` added to GraphState
- Context injected into intent classifier and answer synthesizer prompts
- Enables multi-turn conversation understanding
- Automatic summarization trigger after saving messages

## Implementation Details

### Simple Fixed Window Approach

The system uses a **simple fixed window** strategy (no summarization):

- **Recent Messages**: Last N messages (default: 3) kept in full
- **No Summarization**: Kept simple for reliability and performance
- **Future Enhancement**: Optional summarization can be added later if needed

### How It Works

```
Conversation Flow:
┌─────────────────────────────────────────────────────────┐
│ Last N Messages:  Kept in full (default: 3)            │
│ Older Messages:   Not included (simple approach)        │
└─────────────────────────────────────────────────────────┘

Context Sent to LLM:
┌─────────────────────────────────────────────────────────┐
│ **Recent Conversation:**                                │
│ User: [Message N-2]                                      │
│ Assistant: [Response N-2]                               │
│ User: [Message N-1]                                     │
│ Assistant: [Response N-1]                               │
│ User: [Message N]                                       │
│ Assistant: [Response N]                                 │
│ User: [Current Message]                                 │
└─────────────────────────────────────────────────────────┘
```

### Context Building Process

1. **Retrieval**: Fetch last N messages from MongoDB (default: 3)
2. **Formatting**: Format messages for LLM prompts
3. **Injection**: Include in agent context via `ContextBuilderService`
4. **No Summarization**: Simple approach, no LLM calls for summarization

### Example

**Simple Fixed Window** (last 3 messages):

```
Context includes last 3 messages:

User: "I feel bloated after dinner"
Assistant: "Bloating can be caused by..."
User: "What foods should I avoid?"
Assistant: "Avoid gas-producing foods like..."
User: "What about paneer?"
Assistant: "Paneer is generally fine, but..."
User: [Current question]
```

**Note**: Older messages beyond the window are not included. This keeps the approach simple and reliable.

## Configuration

Add to `backend/.env`:

```env
# Conversation Context Configuration
CONVERSATION_CONTEXT_ENABLED=true        # Enable/disable feature (default: true)
CONVERSATION_RECENT_MESSAGES=3          # Keep last N messages in full (default: 3)
CONVERSATION_SUMMARIZE_AFTER=20         # Start summarizing after N messages (default: 20)
```

### Configuration Options

| Variable                       | Default | Description                                            |
| ------------------------------ | ------- | ------------------------------------------------------ |
| `CONVERSATION_CONTEXT_ENABLED` | `true`  | Enable/disable conversation context                    |
| `CONVERSATION_RECENT_MESSAGES` | `3`     | Number of recent messages to keep in full (always kept in detail) |
| `CONVERSATION_SUMMARIZE_AFTER` | `20`    | Start summarizing after this many messages (tiered approach) |

## Usage

### Automatic Integration

The feature is **automatically enabled** when:

- User sends a message with `convId` (existing conversation)
- `CONVERSATION_CONTEXT_ENABLED=true` (default)

### API Usage

No changes needed to the API. The feature works transparently:

```bash
# First message (no context)
POST /chat/message
{
  "userId": "user-123",
  "text": "I feel bloated"
}

# Response includes convId
{
  "convId": "conv-456",
  "summary": "...",
  ...
}

# Follow-up message (with context)
POST /chat/message
{
  "userId": "user-123",
  "convId": "conv-456",  # ← Context automatically loaded
  "text": "What about rice?"
}
```

## Benefits

### 1. **Context Awareness**

- Agent can reference previous questions
- Handles follow-up questions intelligently
- Maintains conversation coherence

### 2. **Efficient Token Usage**

- Summarization reduces token count
- Only recent messages sent in full
- Older context compressed but preserved

### 3. **Scalability**

- Works with long conversations
- No context window overflow
- Adaptive to conversation length

### 4. **Intelligent Summarization**

- Extracts key entities (symptoms, foods, etc.)
- Preserves important context
- Maintains conversation flow

## How Summarization Works

### Tiered Approach

The system uses a **tiered summarization strategy** that adapts to conversation length:

#### Short Conversations (≤20 messages)
- **Strategy**: Simple fixed window
- **Behavior**: Keep last 3 messages in full detail
- **No summarization** needed

#### Long Conversations (>20 messages)
- **Strategy**: Tiered summarization
- **Structure**:
  - **Recent messages** (last 3): Full detail
  - **Mid-term summary**: Messages 4-20 summarized
  - **Long-term summary**: Oldest messages (1-3) summarized

### Example: 25-Message Conversation

```
┌─────────────────────────────────────────────┐
│ Long-term Summary (Messages 1-8)           │
│ "User discussed bloating issues with rice  │
│  and paneer. Explored dietary triggers..."  │
├─────────────────────────────────────────────┤
│ Mid-term Summary (Messages 9-22)           │
│ "User asked about diet plan progress and   │
│  requested meal suggestions for dinner..." │
├─────────────────────────────────────────────┤
│ Recent Messages (23-25) - Full Detail      │
│ User: "What about dinner tonight?"          │
│ Assistant: "Based on your remaining..."     │
│ User: "Can I have chicken?"                 │
└─────────────────────────────────────────────┘
```

### Incremental Updates

- Summaries are **regenerated** when:
  - Conversation exceeds 20 messages (first time)
  - 5+ new messages added since last summarization
- Summaries are **reused** when:
  - Fewer than 5 new messages since last update
  - Reduces LLM calls and latency

### Token Usage Optimization

| Conversation Length | Without Summarization | With Summarization | Savings |
|---------------------|----------------------|-------------------|---------|
| 10 messages         | ~1,000 tokens        | ~1,000 tokens     | 0%      |
| 20 messages         | ~2,000 tokens        | ~2,000 tokens     | 0%      |
| 30 messages         | ~3,000 tokens        | ~600 tokens       | ~80%    |
| 50 messages         | ~5,000 tokens        | ~700 tokens       | ~86%    |
| 100 messages        | ~10,000 tokens       | ~800 tokens       | ~92%    |

## Technical Details

### Summarization Algorithm

1. **Abstractive Summarization**: Uses LLM to generate concise summaries
2. **Entity Extraction**: Identifies important entities (symptoms, foods, conditions)
3. **Topic Extraction**: Captures main discussion topics
4. **Fallback**: Simple keyword-based summary if LLM fails

### Context Format

Context is formatted for LLM prompts:

```
**Previous Conversation Summary:**
[2-3 sentence summary of older messages]

**Key Topics Discussed:** [topic1, topic2, ...]
**Important Entities:** [entity1, entity2, ...]

**Recent Conversation:**
User: [message 1]
Assistant: [response 1]
User: [message 2]
Assistant: [response 2]
User: [current message]
```

### Integration Points

1. **runChatTurn()**: Fetches conversation context before running agent graph
2. **runAgentGraph()**: Receives conversation context as parameter
3. **answerSynthesizerNode()**: Includes context in system prompts
4. **GraphState**: Stores conversation context throughout execution

## Performance Considerations

### Token Usage

- **Without Context**: ~2000 tokens per query
- **With Context (3 recent)**: ~2500 tokens per query
- **With Summary**: ~2800 tokens per query (vs ~5000+ without summarization)

### Latency

- **Summarization**: Adds ~500-1000ms per query (when triggered)
- **Context Retrieval**: ~50-100ms (MongoDB query)
- **Overall Impact**: Minimal for most queries

### Optimization

- Summarization only triggered when needed
- Recent messages cached in memory
- Summary cached until new messages added

## Limitations

### Current Limitations

1. **No Incremental Summarization**: Summary regenerated each time (could be optimized)
2. **Fixed Window Size**: Recent message count is fixed (could be adaptive)
3. **No Context Compression**: Summary size not optimized for very long conversations
4. **Single Summary**: All older messages summarized together (could be hierarchical)

### Future Improvements

1. **Incremental Summarization**: Only summarize new messages since last summary
2. **Adaptive Window**: Adjust recent message count based on conversation length
3. **Hierarchical Summarization**: Multiple levels of summarization for very long conversations
4. **Context Compression**: Further compress summaries for extremely long conversations
5. **Semantic Similarity**: Use semantic similarity to select most relevant messages

## Testing

### Test Scenarios

1. **Short Conversation** (< 6 messages)

   - All messages kept in full
   - No summarization triggered

2. **Medium Conversation** (6-10 messages)

   - Last 3 messages in full
   - Older messages summarized

3. **Long Conversation** (10+ messages)

   - Last 3 messages in full
   - All older messages summarized

4. **Follow-up Questions**
   - Agent references previous context
   - Maintains conversation coherence

### Example Test

```bash
# Message 1
POST /chat/message
{"userId": "test", "text": "I feel bloated"}

# Message 2 (follow-up)
POST /chat/message
{"userId": "test", "convId": "...", "text": "What foods should I avoid?"}

# Message 3 (follow-up)
POST /chat/message
{"userId": "test", "convId": "...", "text": "What about rice?"}

# Message 7+ (triggers summarization)
# Older messages summarized, recent 3 kept in full
```

## Troubleshooting

### Context Not Loading

1. Check `CONVERSATION_CONTEXT_ENABLED=true` in `.env`
2. Verify `convId` is provided in request
3. Check logs for context loading errors

### Summarization Not Working

1. Verify LLM service is available
2. Check logs for summarization errors
3. Fallback summary will be used if LLM fails

### High Token Usage

1. Reduce `CONVERSATION_RECENT_MESSAGES` (default: 3)
2. Lower `CONVERSATION_SUMMARIZE_AFTER` (default: 6)
3. Disable context: `CONVERSATION_CONTEXT_ENABLED=false`

## References

- **Adaptive Context Management (ACM) Framework**: Research on dynamic conversation context management
- **Sliding Window Approach**: Industry standard for conversation memory
- **Abstractive Summarization**: LLM-based conversation summarization

## Conclusion

The multi-turn conversation context feature enables the AI agent to maintain coherent, context-aware conversations while efficiently managing token usage through adaptive summarization. This implementation follows the latest best practices (2024) for conversation memory management in LLM-based agents.
