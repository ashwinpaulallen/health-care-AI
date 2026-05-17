import { Injectable, Logger } from '@nestjs/common';
import { LlmChatService } from './llm.chat.service';
import { AgentResponse } from './graph';
import { RetrievedChunk } from '../rag/retriever.service';
import { EvaluationMetrics } from './evaluation.service';
import { ConversationContext } from './context-builder.service';

export interface ReflectionResult {
  evaluation: EvaluationMetrics;
  shouldRetry: boolean;
  retryReason?: string;
  suggestedImprovements?: string[];
}

@Injectable()
export class ReflectionService {
  private readonly logger = new Logger(ReflectionService.name);

  constructor(private readonly llmService: LlmChatService) {}

  /**
   * Reflect on the agent's response quality using LLM
   * This provides a more nuanced evaluation than pure metrics
   */
  async reflectOnResponse(
    query: string,
    response: AgentResponse,
    retrievedDocs: RetrievedChunk[],
    evaluationMetrics: EvaluationMetrics,
    conversationContext?: ConversationContext,
  ): Promise<ReflectionResult> {
    this.logger.log('Reflecting on response quality');

    // Build context for reflection
    const docContext = retrievedDocs
      .slice(0, 3)
      .map((doc, idx) => `[Doc ${idx + 1}] ${doc.text.substring(0, 200)}...`)
      .join('\n\n');

    // Build conversation context text if available
    let conversationContextText = '';
    if (conversationContext?.recentMessages.length > 0) {
      conversationContextText = '\n\n**Conversation History:**\n';
      conversationContext.recentMessages.forEach((msg, idx) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        conversationContextText += `${idx + 1}. ${role}: ${msg.text}\n`;
      });
      conversationContextText += '\n**IMPORTANT:** If the current query is a follow-up question (e.g., "will this help?", "do you think...?") and the conversation history discusses a symptom (bloating, pain, discomfort, etc.), the response MUST reference that symptom and answer in that context. If the response ignores the conversation context and provides generic advice, set shouldRetry to true.\n';
    }

    const systemPrompt = `You are a quality evaluator for an AI health assistant. Evaluate the following response and determine if it adequately addresses the user's query.

Evaluation Criteria:
1. **Relevance**: Does the answer directly address the query?
2. **Completeness**: Is the answer comprehensive enough?
3. **Clarity**: Is the answer clear and actionable?
4. **Citation Quality**: Are sources properly cited?
5. **Context Awareness**: Does the answer consider conversation history for follow-up questions?${conversationContext?.recentMessages.length ? ' (CRITICAL for this query)' : ''}

Current Metrics:
- Relevance: ${evaluationMetrics.relevance.toFixed(2)}
- Clarity: ${evaluationMetrics.clarity.toFixed(2)}
- Completeness: ${evaluationMetrics.completeness.toFixed(2)}
- Citation Quality: ${evaluationMetrics.citationQuality.toFixed(2)}
- Overall Score: ${evaluationMetrics.overallScore.toFixed(2)}

User Query: "${query}"${conversationContextText}

Retrieved Context:
${docContext || 'No context retrieved'}

Agent Response:
Summary: ${response.summary}
Steps: ${response.steps?.join(', ') || 'None'}
Citations: ${response.citations.length} citation(s)

Respond with JSON in this format:
{
  "shouldRetry": boolean,
  "retryReason": "string (if shouldRetry is true)",
  "suggestedImprovements": ["improvement1", "improvement2"]
}

If overall score is below 0.7 OR if the answer doesn't adequately address the query${conversationContext?.recentMessages.length ? ' OR if the answer ignores conversation context for a follow-up question' : ''}, set shouldRetry to true.`;

    try {
      const reflection = await this.llmService.chatJSON<{
        shouldRetry: boolean;
        retryReason?: string;
        suggestedImprovements?: string[];
      }>(
        systemPrompt,
        'Evaluate the response quality and determine if a retry is needed.',
        '{"shouldRetry": boolean, "retryReason": "string (optional)", "suggestedImprovements": ["string"]}',
      );

      const shouldRetry =
        reflection?.shouldRetry ||
        evaluationMetrics.needsImprovement ||
        evaluationMetrics.overallScore < 0.7;

      this.logger.log(
        `Reflection complete - Should retry: ${shouldRetry}, Overall score: ${evaluationMetrics.overallScore.toFixed(2)}`,
      );

      return {
        evaluation: evaluationMetrics,
        shouldRetry,
        retryReason: reflection?.retryReason || evaluationMetrics.feedback,
        suggestedImprovements: reflection?.suggestedImprovements || [],
      };
    } catch (error) {
      this.logger.error('Reflection failed, using metrics-based decision:', error);
      // Fallback to metrics-based decision
      return {
        evaluation: evaluationMetrics,
        shouldRetry: evaluationMetrics.needsImprovement,
        retryReason: evaluationMetrics.feedback,
        suggestedImprovements: [],
      };
    }
  }
}

