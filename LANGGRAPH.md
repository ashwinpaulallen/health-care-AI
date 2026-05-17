# LangGraph Agent Architecture — Detailed Documentation

This document provides a comprehensive explanation of the Health Bot AI's LangGraph-based agent system, including detailed node-by-node breakdowns, state management, and decision flows.

---

## Table of Contents

1. [Overview](#overview)
2. [Graph State](#graph-state)
3. [Node-by-Node Breakdown](#node-by-node-breakdown)
4. [Decision Flows](#decision-flows)
5. [Evaluation System](#evaluation-system)
6. [Self-Correction Mechanism](#self-correction-mechanism)
7. [Example Flows](#example-flows)

---

## Overview

The Health Bot AI agent is built using **LangGraph TypeScript**, implementing a state machine that orchestrates multiple nodes to process user queries. The agent follows a **self-reflective architecture** where it evaluates its own responses and automatically corrects them when quality is insufficient.

### Key Characteristics

- **7+ Nodes**: Intent Classification → Food Extraction (if food-logging) → Nutrition Lookup → Food Logging → Retrieval → Safety Guard → Answer Synthesis → Reflection → Self-Correction
- **State-Based**: All nodes operate on a shared `GraphState` object
- **Self-Reflective**: Evaluates response quality and self-corrects
- **Tool-Enabled**: Can call external tools (Tavily search, food logging) when needed
- **Context-Aware**: Uses ContextBuilderService for deterministic state + conversation context

### High-Level Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER QUERY                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │         GraphState Created              │
        │  { userQuery, intent?, primaryDocs?,   │
        │    response?, evaluation?, ... }        │
        └──────────────────┬─────────────────────┘
                           │
                           ▼
        ┌────────────────────────────────────────┐
        │     Node 1: Intent Classifier          │
        │     • LLM classifies query             │
        │     • Output: symptom | food | food-logging | unknown │
        └──────────────────┬─────────────────────┘
                           │
                           ▼
        ┌────────────────────────────────────────┐
        │     Node 2: Retriever                  │
        │     • RAG search (hybrid: text+vector) │
        │     • Tavily fallback (if needed)      │
        │     • Save external results to KB      │
        └──────────────────┬─────────────────────┘
                           │
                           ▼
        ┌────────────────────────────────────────┐
        │     Node 3: Safety Guard                │
        │     • Check red flags                   │
        │     • Set safety level                  │
        └──────────────────┬─────────────────────┘
                           │
                           ▼
        ┌────────────────────────────────────────┐
        │     Node 4: Answer Synthesizer          │
        │     • Build context from docs          │
        │     • Generate structured response     │
        │     • Add citations                     │
        └──────────────────┬─────────────────────┘
                           │
                           ▼
        ┌────────────────────────────────────────┐
        │     Node 5: Reflection & Evaluation     │
        │     • Calculate metrics                 │
        │     • LLM reflection                    │
        │     • Determine if retry needed         │
        └──────────────────┬─────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
         Score >= 0.7          Score < 0.7
         (Good Quality)        (Needs Fix)
                │                     │
                │                     ▼
                │         ┌───────────────────────┐
                │         │ Node 6: Self-Correction│
                │         │ • Re-retrieve          │
                │         │ • Re-synthesize        │
                │         │ • Re-evaluate          │
                │         └───────────┬───────────┘
                │                     │
                └──────────┬──────────┘
                           │
                           ▼
        ┌────────────────────────────────────────┐
        │         Final Response                  │
        │  { summary, steps, citations,          │
        │    evaluation, retryCount }            │
        └────────────────────────────────────────┘
```

---

## Graph State

The `GraphState` interface is the central data structure that flows through all nodes. Each node reads from and writes to this state.

### State Structure

```typescript
interface GraphState {
  // Input
  userQuery: string;
  
  // Node 1 Output
  intent?: 'symptom' | 'food' | 'unknown';
  
  // Node 2 Output
  primaryDocs?: RetrievedChunk[];      // Top chunks from primary domain
  spilloverDocs?: RetrievedChunk[];     // Chunks from other domain
  tavilyResults?: TavilySearchResult[]; // External search results
  usedTavily?: boolean;                 // Whether Tavily was called
  
  // Node 3 Output
  safetyLevel?: 'self-care' | 'caution' | 'seek-care';
  
  // Node 4 Output
  response?: AgentResponse;              // Generated answer
  
  // Node 5 Output
  evaluation?: EvaluationMetrics;        // Quality metrics
  reflection?: ReflectionResult;          // LLM reflection decision
  
  // Node 6 Output
  retryCount?: number;                   // Number of correction attempts
  
  // Context (optional)
  dietPlan?: {
    name: string;
    dailyMacroTargets: { ... };
    todayConsumption?: { ... };
    // ...
  };
}
```

### State Flow

Each node receives the current state, processes it, and returns an updated state:

```typescript
// Example: Node receives state, updates it, returns new state
state = await intentClassifierNode(state, llmService);
// state.intent is now set

state = await retrieverNode(state, retrieverService, ...);
// state.primaryDocs, state.tavilyResults are now set
```

---

## Node-by-Node Breakdown

### Node 1: Intent Classifier

**Purpose**: Determine the type of query (symptom, food, or unknown)

**Input**: `userQuery` (string)

**Process**:
1. Constructs a system prompt with classification rules
2. Calls LLM with `chatJSON` to get structured output
3. Parses JSON response: `{"intent": "symptom|food|unknown"}`

**Output**: Updates `state.intent`

**System Prompt**:
```
You are an intent classifier for a health and nutrition assistant.

Classification rules:
- "symptom": Bodily feelings, physical issues, health concerns, medical symptoms
- "food": Nutrients, foods, meals, recipes, diet plans, eating habits
- "unknown": Unclear, unrelated, or general queries

Respond with ONLY valid JSON: {"intent": "symptom"} or {"intent": "food"} or {"intent": "unknown"}
```

**Decision Tree**:
```
User Query
    │
    ├─→ Bodily feelings/issues → symptom
    ├─→ Nutrients/foods/meals → food
    └─→ Unclear/unrelated → unknown
```

**Example**:
- Input: "I have been feeling bloated"
- Output: `intent: "symptom"`

---

### Node 2: Retriever

**Purpose**: Fetch relevant knowledge base chunks and optionally search external sources

**Input**: `userQuery`, `intent`

**Process**:
1. **Primary Retrieval**: Search knowledge base using hybrid search (text + vector)
   - Text search: MongoDB `$text` index for keyword matching
   - Vector search: Cosine similarity on embeddings
   - Domain filtering: Only search in `symptom` or `food` domain based on intent
2. **Spillover Retrieval**: Get 1 chunk from the other domain for context
3. **Quality Check**: Evaluate if results are sufficient
   - `hasGoodResults`: At least one chunk with score >= 0.5
   - `hasExactMatch`: Query terms appear in retrieved chunks
4. **Tavily Fallback**: If insufficient results, call Tavily search
   - Only if: `(!hasGoodResults || !hasExactMatch) && tavilyAvailable && intent !== 'unknown'`
5. **Knowledge Saving**: Save Tavily results to knowledge base for future use

**Output**: Updates `state.primaryDocs`, `state.spilloverDocs`, `state.tavilyResults`, `state.usedTavily`

**Retrieval Strategy Diagram**:
```
Query: "What are the benefits of quinoa?"
    │
    ├─→ Text Search (MongoDB)
    │   └─→ Find candidates with "quinoa" or "benefits"
    │
    ├─→ Generate Query Embedding
    │   └─→ Vector representation of query
    │
    ├─→ Cosine Similarity
    │   └─→ Compare with all chunk embeddings
    │
    ├─→ Rerank & Filter
    │   ├─→ Sort by similarity score
    │   ├─→ Apply threshold (>= 0.3)
    │   └─→ Take top 4 primary + 1 spillover
    │
    └─→ Quality Check
        ├─→ hasGoodResults? (score >= 0.5)
        ├─→ hasExactMatch? (query terms in chunks)
        └─→ If no → Trigger Tavily
```

**Tavily Trigger Logic**:
```
hasGoodResults = primary.length > 0 && primary.some(doc => doc.score >= 0.5)
hasExactMatch = primary.some(doc => queryTerms.some(term => doc.text.includes(term)))

shouldUseTavily = (!hasGoodResults || !hasExactMatch) 
                  && tavilyAvailable 
                  && intent === 'symptom' || intent === 'food'
```

**Example**:
- Input: `userQuery: "What is quinoa?"`, `intent: "food"`
- Process: Search food domain → Find 3 chunks about quinoa → Score: 0.72, 0.68, 0.61
- Output: `primaryDocs: [3 chunks]`, `usedTavily: false`

---

### Node 3: Safety Guard

**Purpose**: Detect red flags and set appropriate safety level for symptom queries

**Input**: `intent`, `userQuery`, `primaryDocs`, `spilloverDocs`

**Process**:
1. **Skip if not symptom**: If `intent !== 'symptom'`, return `self-care`
2. **Red Flag Detection**: Check for 5 specific red flags:
   - `chest pain`
   - `fainting`
   - `blood in stool`
   - `uncontrolled vomiting`
   - `severe dehydration`
3. **Check Locations**: Search in both user query text AND retrieved chunks
4. **Moderate Symptoms**: Check for keywords indicating moderate/prolonged symptoms
5. **Set Safety Level**: 
   - Red flag found → `seek-care`
   - Moderate/prolonged → `caution`
   - Default → `self-care`

**Output**: Updates `state.safetyLevel`

**Safety Level Decision Tree**:
```
intent === 'symptom'?
    │
    ├─→ No → self-care
    │
    └─→ Yes
        │
        ├─→ Red flag in query OR chunks? → seek-care
        │
        ├─→ "moderate" OR ">48h" OR "several days"? → caution
        │
        └─→ Default → self-care
```

**Example**:
- Input: `userQuery: "I have chest pain"`, `intent: "symptom"`
- Process: Detect "chest pain" in query → Red flag detected
- Output: `safetyLevel: "seek-care"`

---

### Node 4: Answer Synthesizer

**Purpose**: Generate a structured, cited response using LLM

**Input**: `intent`, `primaryDocs`, `spilloverDocs`, `tavilyResults`, `safetyLevel`, `dietPlan`

**Process**:
1. **Context Building**:
   - Combine primary and spillover docs
   - Include Tavily results if available
   - Add diet plan context (if user has active plan)
   - Add today's consumption data (if available)
2. **Excerpt Preparation**:
   - Format chunks as `[Document N/Section] text...`
   - Limit total context to ~6000 characters
   - Truncate individual chunks if needed
3. **Mode Selection**:
   - **Symptom Mode**: Careful health bot prompt with safety notes
   - **Food Mode**: Knowledgeable nutrition coach prompt
   - **Unknown Mode**: Fallback response
4. **LLM Generation**:
   - Call LLM with system prompt, context, and user query
   - Request structured JSON output
5. **Citation Building**:
   - Extract citations from knowledge base chunks
   - Add Tavily citations if used
6. **Response Validation**:
   - Ensure citations are present
   - Limit steps to 4, cautions to 2
   - Add medical disclaimer for symptom queries

**Output**: Updates `state.response`

**System Prompts**:

**Symptom Mode**:
```
You are a careful health bot. Use ONLY the provided excerpts to answer. 
Do not diagnose. Include safety note. Be concise and actionable.

Profile: null (POC - no user profile available)
Safety Level: {safetyLevel}
User Query: {userQuery}

Excerpts:
{excerpts}

Respond with JSON:
{
  "intent": "symptom",
  "level": "{safetyLevel}",
  "summary": "<=2 sentences",
  "steps": ["<=4 actionable steps"],
  "cautions": ["<=2 safety notes"],
  "citations": [{"title": "...", "section": "..."}]
}
```

**Food Mode**:
```
You are a knowledgeable nutrition coach. Use ONLY the provided excerpts. 
Focus on food facts, portions, and swaps. Be concise and practical.

User Query: {userQuery}
Diet Plan Context: {dietPlanContext if available}

Excerpts:
{excerpts}

Respond with JSON:
{
  "intent": "food",
  "summary": "<=2 sentences",
  "steps": ["<=4 concrete tips or swaps"],
  "citations": [{"title": "...", "section": "..."}]
}
```

**Example**:
- Input: `intent: "food"`, `primaryDocs: [quinoa chunks]`, `dietPlan: {calories: 2000, ...}`
- Process: Build context → Call LLM → Parse JSON
- Output: `response: { summary: "Quinoa is...", steps: [...], citations: [...] }`

---

### Node 5: Reflection & Evaluation

**Purpose**: Evaluate response quality and determine if self-correction is needed

**Input**: `userQuery`, `response`, `primaryDocs`, `spilloverDocs`

**Process**:
1. **Metric Calculation** (via `EvaluationService`):
   - **Relevance** (0-1): How well docs match query
     - Check if query terms appear in docs
     - Use average similarity score
   - **Clarity** (0-1): Answer clarity and understandability
     - Check summary length (50-500 chars ideal)
     - Verify steps are provided
     - Ensure not a fallback message
   - **Completeness** (0-1): How fully answer addresses query
     - Check answer length and structure
     - Verify steps and citations present
     - Match query keywords to summary
   - **Citation Quality** (0-1): Appropriateness of citations
     - Check citation count (2-3 ideal)
     - Verify citations match retrieved docs
   - **Overall Score**: Weighted average
     - `0.3 * relevance + 0.25 * clarity + 0.25 * completeness + 0.2 * citationQuality`
2. **LLM Reflection** (via `ReflectionService`):
   - Build reflection prompt with metrics and context
   - Ask LLM to evaluate if retry is needed
   - Get structured output: `{shouldRetry, retryReason, suggestedImprovements}`
3. **Decision**:
   - `shouldRetry = reflection.shouldRetry || overallScore < 0.7`
   - If `shouldRetry`, proceed to Node 6

**Output**: Updates `state.evaluation`, `state.reflection`, `state.response.evaluation`

**Evaluation Metrics Diagram**:
```
Response Quality Evaluation
    │
    ├─→ Relevance (30% weight)
    │   ├─→ Query terms in docs? → 0.5
    │   └─→ Average similarity score → 0.5
    │
    ├─→ Clarity (25% weight)
    │   ├─→ Summary length (50-500) → 0.2
    │   ├─→ Steps provided? → 0.15
    │   └─→ Not fallback message? → 0.15
    │
    ├─→ Completeness (25% weight)
    │   ├─→ Answer length > 20? → 0.2
    │   ├─→ Steps >= 2? → 0.25
    │   ├─→ Citations present? → 0.25
    │   └─→ Query keywords in summary? → 0.2
    │
    └─→ Citation Quality (20% weight)
        ├─→ Citation count >= 2? → 0.2
        ├─→ Citation count >= 3? → 0.1
        └─→ Citations match docs? → 0.2

Overall Score = Weighted Sum
Threshold: 0.7 (if below → trigger correction)
```

**Reflection Prompt**:
```
You are a quality evaluator for an AI health assistant.

Evaluation Criteria:
1. Relevance: Does the answer directly address the query?
2. Completeness: Is the answer comprehensive enough?
3. Clarity: Is the answer clear and actionable?
4. Citation Quality: Are sources properly cited?

Current Metrics:
- Relevance: {relevance}
- Clarity: {clarity}
- Completeness: {completeness}
- Citation Quality: {citationQuality}
- Overall Score: {overallScore}

User Query: "{query}"
Agent Response: {response}

Respond with JSON:
{
  "shouldRetry": boolean,
  "retryReason": "string (if shouldRetry is true)",
  "suggestedImprovements": ["improvement1", "improvement2"]
}
```

**Example**:
- Input: `response: {summary: "...", steps: [...], citations: [...]}`
- Metrics: `relevance: 0.65`, `clarity: 0.80`, `completeness: 0.70`, `citationQuality: 0.75`
- Overall: `0.725` → Above threshold → No retry needed
- Output: `evaluation: {...}`, `reflection: {shouldRetry: false}`

---

### Node 6: Self-Correction

**Purpose**: Automatically improve response quality through re-retrieval and re-synthesis

**Input**: `evaluation`, `reflection`, `retryCount`, `userQuery`, `intent`, `primaryDocs`

**Process**:
1. **Retry Check**:
   - Must have: `reflection.shouldRetry === true`
   - Must have: `overallScore < 0.7`
   - Must have: `retryCount < 2` (max 2 retries)
2. **Correction Strategies**:
   
   **Strategy 1: Low Relevance** (`relevance < 0.6`)
   - Re-retrieve with broader search (6 primary docs, 2 spillover)
   - If better docs found (score > 0.5), re-synthesize
   - If still insufficient and Tavily available, try Tavily
   
   **Strategy 2: Low Completeness** (`completeness < 0.6`)
   - Re-run answer synthesizer with same context
   - LLM may generate more complete answer on second attempt
3. **Re-evaluation**: After correction, re-run Node 5 to get new metrics
4. **Retry Limit**: Stop after 2 attempts to avoid infinite loops

**Output**: Updates `state.primaryDocs`, `state.response`, `state.retryCount`

**Self-Correction Flow Diagram**:
```
Evaluation Score < 0.7
    │
    ├─→ Relevance < 0.6?
    │   │
    │   ├─→ Yes → Broader Retrieval
    │   │   ├─→ Retrieve 6 primary + 2 spillover
    │   │   ├─→ Better docs found?
    │   │   │   ├─→ Yes → Re-synthesize
    │   │   │   └─→ No → Try Tavily (if available)
    │   │   └─→ Re-evaluate
    │   │
    │   └─→ No → Continue
    │
    └─→ Completeness < 0.6?
        │
        ├─→ Yes → Re-synthesize
        │   └─→ Re-run answer synthesizer
        │       └─→ Re-evaluate
        │
        └─→ No → Use current response
```

**Example**:
- Input: `evaluation: {relevance: 0.45, overallScore: 0.62}`, `retryCount: 0`
- Process: Low relevance detected → Re-retrieve with 6 docs → Found better chunks (score: 0.68)
- Action: Re-synthesize with new chunks → Re-evaluate → New score: 0.78
- Output: `retryCount: 1`, `response: {updated answer}`, `evaluation: {overallScore: 0.78}`

---

## Decision Flows

### Complete Flow with All Decision Points

```
START: User Query
    │
    ▼
[Node 1] Intent Classification
    │
    ├─→ symptom ──┐
    ├─→ food ─────┼─→ [Node 2] Retrieval
    └─→ unknown ───┘
                    │
                    ├─→ Good results? ──→ [Node 3] Safety Guard
                    │                       │
                    └─→ Poor results? ──→ Tavily Search ──→ [Node 3]
                                            │
                                            └─→ Save to KB
                    │
                    ▼
[Node 3] Safety Guard
    │
    ├─→ symptom? ──→ Check red flags ──→ Set safety level
    └─→ food/unknown? ──→ self-care
                    │
                    ▼
[Node 4] Answer Synthesis
    │
    ├─→ symptom mode ──→ Careful health bot prompt
    ├─→ food mode ──→ Nutrition coach prompt
    └─→ unknown mode ──→ Fallback response
                    │
                    ▼
[Node 5] Reflection & Evaluation
    │
    ├─→ Calculate metrics
    ├─→ LLM reflection
    └─→ Determine retry need
                    │
                    ├─→ Score >= 0.7? ──→ END (Good quality)
                    │
                    └─→ Score < 0.7? ──→ [Node 6] Self-Correction
                                            │
                                            ├─→ Relevance low? ──→ Re-retrieve
                                            ├─→ Completeness low? ──→ Re-synthesize
                                            └─→ Re-evaluate
                                                    │
                                                    └─→ Score improved? ──→ END
                                                    └─→ Max retries? ──→ END (Use best)
```

---

## Evaluation System

### Metrics Explained

#### 1. Relevance (0-1, 30% weight)

Measures how well retrieved documents match the user's query.

**Calculation**:
- Extract key terms from query (remove stop words, punctuation)
- Check if terms appear in retrieved chunks
- Calculate matching ratio: `matchingDocs / totalDocs`
- Use average similarity score from vector search
- Combine: `(matchingRatio * 0.5) + (avgScore * 0.5)`

**Example**:
- Query: "What are the benefits of quinoa?"
- Docs: 3 chunks about quinoa (scores: 0.72, 0.68, 0.61)
- Matching: All 3 contain "quinoa" and "benefits"
- Relevance: `(1.0 * 0.5) + (0.67 * 0.5) = 0.835`

#### 2. Clarity (0-1, 25% weight)

Measures how clear and understandable the answer is.

**Calculation**:
- Base score: 0.5
- Summary length (50-500 chars): +0.2
- Steps provided: +0.15
- Not fallback message: +0.15

**Example**:
- Summary: "Quinoa is a complete protein..." (120 chars) ✓
- Steps: ["Include in breakfast", "Use as rice substitute"] ✓
- Not fallback: ✓
- Clarity: `0.5 + 0.2 + 0.15 + 0.15 = 1.0`

#### 3. Completeness (0-1, 25% weight)

Measures how fully the answer addresses the query.

**Calculation**:
- Base score: 0.3
- Answer length > 20: +0.2
- Steps >= 2: +0.25
- Citations present: +0.25
- Query keywords in summary: +0.2 (proportional)

**Example**:
- Summary: "Quinoa provides complete protein..." (contains "quinoa" ✓)
- Steps: 3 steps ✓
- Citations: 2 citations ✓
- Completeness: `0.3 + 0.2 + 0.25 + 0.25 + 0.2 = 1.2` → Clamped to 1.0

#### 4. Citation Quality (0-1, 20% weight)

Measures appropriateness and presence of citations.

**Calculation**:
- Base score: 0.5 (for having citations)
- Citation count >= 2: +0.2
- Citation count >= 3: +0.1
- Citations match retrieved docs: +0.2

**Example**:
- Citations: 2 citations ✓
- Match docs: Both citations reference retrieved chunks ✓
- Citation Quality: `0.5 + 0.2 + 0.2 = 0.9`

### Overall Score Calculation

```typescript
overallScore = 
  (relevance * 0.30) +
  (clarity * 0.25) +
  (completeness * 0.25) +
  (citationQuality * 0.20)
```

**Threshold**: 0.7 (if below, trigger self-correction)

---

## Self-Correction Mechanism

### When Does Correction Trigger?

Correction is triggered when **ALL** of the following are true:
1. `reflection.shouldRetry === true` (LLM determined retry needed)
2. `evaluation.overallScore < 0.7` (Below quality threshold)
3. `retryCount < 2` (Haven't exceeded max retries)

### Correction Strategies

#### Strategy 1: Low Relevance Correction

**Trigger**: `evaluation.relevance < 0.6`

**Actions**:
1. Re-retrieve with broader search:
   - Increase primary docs from 4 to 6
   - Increase spillover from 1 to 2
   - This gives more candidates to find better matches
2. Check if better docs found:
   - If any doc has `score > 0.5`, use them
   - Update `state.primaryDocs` and `state.spilloverDocs`
3. Re-synthesize answer with new context
4. If still insufficient and Tavily available:
   - Call Tavily search (if not already used)
   - Re-synthesize with Tavily results

**Example**:
```
Initial: relevance = 0.45 (low)
Action: Re-retrieve with 6 docs
Result: Found 2 better docs (scores: 0.68, 0.72)
Action: Re-synthesize
New relevance: 0.78 (improved!)
```

#### Strategy 2: Low Completeness Correction

**Trigger**: `evaluation.completeness < 0.6`

**Actions**:
1. Re-run answer synthesizer with same context
2. LLM may generate more complete answer on second attempt
3. This leverages LLM's non-deterministic nature

**Example**:
```
Initial: completeness = 0.55 (low)
Action: Re-synthesize with same context
Result: LLM generates more detailed answer with 4 steps (was 2)
New completeness: 0.85 (improved!)
```

### Retry Limit

- **Maximum retries**: 2
- **Rationale**: Prevents infinite loops and excessive LLM calls
- **After max retries**: Use best response found so far

---

## Example Flows

### Example 1: High-Quality Response (No Correction Needed)

```
User Query: "What are the benefits of quinoa?"

[Node 1] Intent: "food"
[Node 2] Retrieval:
  - Found 4 chunks about quinoa
  - Scores: 0.78, 0.72, 0.68, 0.61
  - Exact match: Yes (contains "quinoa" and "benefits")
[Node 3] Safety: "self-care" (food query)
[Node 4] Synthesis:
  - Summary: "Quinoa is a complete protein..."
  - Steps: 3 actionable tips
  - Citations: 2 citations
[Node 5] Evaluation:
  - Relevance: 0.85
  - Clarity: 0.90
  - Completeness: 0.88
  - Citation Quality: 0.85
  - Overall: 0.87
  - Should retry: false
[Node 6] Skipped (score >= 0.7)

Final Response: High quality, no correction needed
```

### Example 2: Low Quality Response (Correction Triggered)

```
User Query: "What is dragon fruit?"

[Node 1] Intent: "food"
[Node 2] Retrieval:
  - Found 2 chunks (scores: 0.42, 0.38)
  - Exact match: No (no chunks contain "dragon fruit")
  - Triggered Tavily search
  - Saved Tavily results to KB
[Node 3] Safety: "self-care"
[Node 4] Synthesis:
  - Summary: "Dragon fruit is a tropical fruit..."
  - Steps: 2 steps
  - Citations: 1 citation
[Node 5] Evaluation:
  - Relevance: 0.55 (low - query term not in KB)
  - Clarity: 0.75
  - Completeness: 0.60
  - Citation Quality: 0.65
  - Overall: 0.64
  - Should retry: true
[Node 6] Self-Correction:
  - Relevance < 0.6 → Re-retrieve
  - Found new chunks from Tavily-saved KB
  - Scores: 0.72, 0.68 (better!)
  - Re-synthesize
  - Re-evaluate:
    - Relevance: 0.78
    - Overall: 0.76
[Final] Response improved after correction
```

### Example 3: Symptom Query with Red Flag

```
User Query: "I have chest pain"

[Node 1] Intent: "symptom"
[Node 2] Retrieval:
  - Found chunks about chest pain
  - Scores: 0.85, 0.78
[Node 3] Safety Guard:
  - Detected red flag: "chest pain"
  - Safety level: "seek-care"
[Node 4] Synthesis:
  - Summary: "Chest pain requires immediate medical attention..."
  - Steps: ["Call emergency services", "Do not drive yourself", ...]
  - Cautions: ["This is not medical advice...", "Chest pain can be life-threatening..."]
  - Citations: 2 citations
[Node 5] Evaluation:
  - Relevance: 0.90
  - Clarity: 0.95
  - Completeness: 0.92
  - Citation Quality: 0.88
  - Overall: 0.91
  - Should retry: false
[Final] High-quality response with appropriate safety escalation
```

---

## Summary

The Health Bot AI agent implements a sophisticated self-reflective architecture that:

1. **Classifies** user intent accurately
2. **Retrieves** relevant knowledge with fallback to external sources
3. **Guards** against unsafe medical advice
4. **Synthesizes** structured, cited responses
5. **Evaluates** its own output quality
6. **Corrects** itself when quality is insufficient

This creates a robust, self-improving system that delivers high-quality, safe, and accurate health and nutrition guidance.

