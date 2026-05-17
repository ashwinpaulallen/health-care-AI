import { Injectable, Logger } from '@nestjs/common';
import { LlmChatService } from './llm.chat.service';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  intent?: string;
  createdAt: Date;
}

export interface ConversationSummary {
  summary: string;
  keyEntities: string[];
  topics: string[];
  messageCount: number;
}

@Injectable()
export class ConversationSummarizerService {
  private readonly logger = new Logger(ConversationSummarizerService.name);

  constructor(private readonly llmService: LlmChatService) {}

  /**
   * Summarize a conversation segment (multiple messages)
   * Uses abstractive summarization to capture main points
   */
  async summarizeConversationSegment(
    messages: ConversationMessage[],
  ): Promise<ConversationSummary> {
    if (messages.length === 0) {
      return {
        summary: '',
        keyEntities: [],
        topics: [],
        messageCount: 0,
      };
    }

    // Format messages for summarization
    const conversationText = messages
      .map((msg, idx) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        return `${role}: ${msg.text}`;
      })
      .join('\n\n');

    const systemPrompt = `You are a conversation summarizer. Analyze the following conversation segment and create a concise summary.

Instructions:
1. Extract the main topics and themes discussed
2. Identify key entities (symptoms, foods, health conditions, diet goals, etc.)
3. Summarize the conversation in 2-3 sentences
4. Preserve important context that would be needed for future questions

Respond with ONLY valid JSON in this format:
{
  "summary": "Brief summary of the conversation (2-3 sentences)",
  "keyEntities": ["entity1", "entity2", ...],
  "topics": ["topic1", "topic2", ...]
}`;

    try {
      const result = await this.llmService.chatJSON<{
        summary: string;
        keyEntities: string[];
        topics: string[];
      }>(
        systemPrompt,
        `Conversation segment:\n\n${conversationText}`,
        JSON.stringify({
          summary: 'string (2-3 sentences)',
          keyEntities: ['string'],
          topics: ['string'],
        }),
      );

      if (!result) {
        // Fallback: create a simple summary
        return this.createFallbackSummary(messages);
      }

      return {
        summary: result.summary,
        keyEntities: result.keyEntities || [],
        topics: result.topics || [],
        messageCount: messages.length,
      };
    } catch (error) {
      this.logger.error('Failed to summarize conversation segment:', error);
      return this.createFallbackSummary(messages);
    }
  }

  /**
   * Create a fallback summary when LLM summarization fails
   */
  private createFallbackSummary(messages: ConversationMessage[]): ConversationSummary {
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantMessages = messages.filter((m) => m.role === 'assistant');

    // Extract key terms from user messages
    const allText = messages.map((m) => m.text).join(' ');
    const words = allText
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4);

    // Count word frequency
    const wordFreq: Record<string, number> = {};
    words.forEach((word) => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Get top entities
    const keyEntities = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    const summary = `Conversation about ${keyEntities.slice(0, 3).join(', ')}. ${
      userMessages.length
    } user questions and ${assistantMessages.length} responses.`;

    return {
      summary,
      keyEntities,
      topics: keyEntities.slice(0, 3),
      messageCount: messages.length,
    };
  }

  /**
   * Merge multiple summaries into a single summary
   * Useful when combining multiple conversation segments
   */
  async mergeSummaries(summaries: ConversationSummary[]): Promise<ConversationSummary> {
    if (summaries.length === 0) {
      return {
        summary: '',
        keyEntities: [],
        topics: [],
        messageCount: 0,
      };
    }

    if (summaries.length === 1) {
      return summaries[0];
    }

    // Combine all summaries
    const combinedText = summaries
      .map((s, idx) => `Summary ${idx + 1}: ${s.summary}`)
      .join('\n\n');

    const systemPrompt = `You are a conversation summarizer. Merge the following conversation summaries into a single, coherent summary.

Instructions:
1. Combine the summaries into 2-3 sentences
2. Merge duplicate entities and topics
3. Preserve all important information
4. Maintain chronological context if relevant

Respond with ONLY valid JSON:
{
  "summary": "Merged summary (2-3 sentences)",
  "keyEntities": ["entity1", "entity2", ...],
  "topics": ["topic1", "topic2", ...]
}`;

    try {
      const result = await this.llmService.chatJSON<{
        summary: string;
        keyEntities: string[];
        topics: string[];
      }>(
        systemPrompt,
        `Summaries to merge:\n\n${combinedText}`,
        JSON.stringify({
          summary: 'string',
          keyEntities: ['string'],
          topics: ['string'],
        }),
      );

      if (!result) {
        // Fallback: simple merge
        return this.mergeSummariesFallback(summaries);
      }

      return {
        summary: result.summary,
        keyEntities: [...new Set(result.keyEntities || [])],
        topics: [...new Set(result.topics || [])],
        messageCount: summaries.reduce((sum, s) => sum + s.messageCount, 0),
      };
    } catch (error) {
      this.logger.error('Failed to merge summaries:', error);
      return this.mergeSummariesFallback(summaries);
    }
  }

  /**
   * Fallback method to merge summaries
   */
  private mergeSummariesFallback(summaries: ConversationSummary[]): ConversationSummary {
    const allEntities = new Set<string>();
    const allTopics = new Set<string>();
    const summaryTexts: string[] = [];

    summaries.forEach((s) => {
      s.keyEntities.forEach((e) => allEntities.add(e));
      s.topics.forEach((t) => allTopics.add(t));
      summaryTexts.push(s.summary);
    });

    return {
      summary: summaryTexts.join(' '),
      keyEntities: Array.from(allEntities).slice(0, 10),
      topics: Array.from(allTopics).slice(0, 5),
      messageCount: summaries.reduce((sum, s) => sum + s.messageCount, 0),
    };
  }
}

