import { Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { Message, MessageDocument } from '../chat/schemas/message.schema';
import { ConversationSummarizerService, ConversationMessage, ConversationSummary } from './conversation-summarizer.service';
import { ConfigService } from '../common/config/config.service';

export interface ConversationContext {
  recentMessages: ConversationMessage[]; // Last N messages in full
  summary?: ConversationSummary; // Summary of older messages
  keyEntities: string[]; // Important entities from entire conversation
  topics: string[]; // Main topics discussed
}

@Injectable()
export class ConversationContextService {
  private readonly logger = new Logger(ConversationContextService.name);

  constructor(
    private readonly summarizerService: ConversationSummarizerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get conversation context with adaptive summarization
   * Implements sliding window approach: keep recent messages, summarize older ones
   */
  async getConversationContext(
    messageModel: Model<MessageDocument>,
    convId: string,
    recentMessageCount?: number, // Keep last N messages in full
    summarizeAfter?: number, // Start summarizing after N messages
  ): Promise<ConversationContext> {
    // Use config values if not provided
    const recentCount = recentMessageCount ?? this.configService.conversationRecentMessages;
    const summarizeThreshold = summarizeAfter ?? this.configService.conversationSummarizeAfter;

    // Check if context is enabled
    if (!this.configService.conversationContextEnabled) {
      return {
        recentMessages: [],
        keyEntities: [],
        topics: [],
      };
    }
    try {
      // Fetch all messages for this conversation
      const allMessages = await messageModel
        .find({ convId })
        .sort({ createdAt: 1 }) // Oldest first
        .exec();

      if (allMessages.length === 0) {
        return {
          recentMessages: [],
          keyEntities: [],
          topics: [],
        };
      }

      // Convert to ConversationMessage format
      const conversationMessages: ConversationMessage[] = allMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        text: msg.text,
        intent: msg.intent,
        createdAt: msg.createdAt,
      }));

      // If conversation is short, return all messages
      if (conversationMessages.length <= recentCount) {
        return {
          recentMessages: conversationMessages,
          keyEntities: [],
          topics: [],
        };
      }

      // Split into recent and older messages
      const recentMessages = conversationMessages.slice(-recentCount);
      const olderMessages = conversationMessages.slice(0, -recentCount);

      // Only summarize if we have enough older messages
      let summary: ConversationSummary | undefined;
      if (olderMessages.length >= summarizeThreshold - recentCount) {
        this.logger.log(
          `Summarizing ${olderMessages.length} older messages (keeping ${recentMessages.length} recent)`,
        );

        // Summarize older messages
        summary = await this.summarizerService.summarizeConversationSegment(olderMessages);

        this.logger.log(
          `Summary created: ${summary.summary.substring(0, 100)}... (${summary.keyEntities.length} entities, ${summary.topics.length} topics)`,
        );
      }

      // Extract all key entities and topics
      const allKeyEntities = new Set<string>();
      const allTopics = new Set<string>();

      if (summary) {
        summary.keyEntities.forEach((e) => allKeyEntities.add(e));
        summary.topics.forEach((t) => allTopics.add(t));
      }

      // Also extract entities from recent messages (simple keyword extraction)
      recentMessages.forEach((msg) => {
        const text = msg.text.toLowerCase();
        // Extract potential entities (words longer than 4 chars, capitalized in original)
        const words = text.split(/\s+/).filter((w) => w.length > 4);
        words.forEach((w) => {
          // Simple heuristic: if word appears multiple times, it might be an entity
          if (text.split(w).length > 2) {
            allKeyEntities.add(w);
          }
        });
      });

      return {
        recentMessages,
        summary,
        keyEntities: Array.from(allKeyEntities).slice(0, 15), // Limit to 15 entities
        topics: Array.from(allTopics).slice(0, 10), // Limit to 10 topics
      };
    } catch (error) {
      this.logger.error('Failed to get conversation context:', error);
      // Return empty context on error
      return {
        recentMessages: [],
        keyEntities: [],
        topics: [],
      };
    }
  }

  /**
   * Format conversation context for inclusion in LLM prompt
   */
  formatContextForPrompt(context: ConversationContext): string {
    if (context.recentMessages.length === 0 && !context.summary) {
      return '';
    }

    let formatted = '';

    // Add summary if available
    if (context.summary && context.summary.summary) {
      formatted += `**Previous Conversation Summary:**\n${context.summary.summary}\n\n`;
      
      if (context.summary.keyEntities.length > 0) {
        formatted += `**Key Topics Discussed:** ${context.summary.topics.join(', ')}\n`;
        formatted += `**Important Entities:** ${context.summary.keyEntities.slice(0, 5).join(', ')}\n\n`;
      }
    }

    // Add recent messages
    if (context.recentMessages.length > 0) {
      formatted += `**Recent Conversation:**\n`;
      context.recentMessages.forEach((msg, idx) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        formatted += `${role}: ${msg.text}\n`;
      });
      formatted += '\n';
    }

    return formatted;
  }

  /**
   * Check if conversation needs summarization
   * Returns true if conversation has more than threshold messages
   */
  async shouldSummarize(
    messageModel: Model<MessageDocument>,
    convId: string,
    threshold: number = 6,
  ): Promise<boolean> {
    try {
      const count = await messageModel.countDocuments({ convId }).exec();
      return count > threshold;
    } catch (error) {
      this.logger.error('Failed to check if should summarize:', error);
      return false;
    }
  }
}

