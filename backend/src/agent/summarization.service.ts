import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { ConfigService } from '../common/config/config.service';
import { MessageDocument } from '../chat/schemas/message.schema';

export interface SummaryResult {
    summary: string;
    keyTopics: string[];
    fromMessageIndex: number;
    toMessageIndex: number;
}

@Injectable()
export class SummarizationService {
    private readonly logger = new Logger(SummarizationService.name);
    private llm: ChatOpenAI;

    constructor(private readonly configService: ConfigService) {
        // Initialize LangChain ChatOpenAI with LM Studio configuration
        this.llm = new ChatOpenAI({
            model: this.configService.llmChatModel,
            configuration: {
                baseURL: this.configService.llmBaseUrl,
                apiKey: 'not-needed-for-local',
            },
            temperature: 0.3,
            maxTokens: 500, // Keep summaries concise
        });

        this.logger.log(`Initialized SummarizationService with LM Studio: ${this.configService.llmBaseUrl}`);
    }

    /**
     * Generate incremental summary for new messages
     * Only summarizes messages since last summary
     */
    async generateIncrementalSummary (
        newMessages: MessageDocument[],
        previousSummary?: string,
        conversationContext?: 'health-query' | 'food-logging' | 'general',
    ): Promise<string> {
        try {
            const contextHint = conversationContext
                ? `This is a ${conversationContext} conversation.`
                : '';

            const prompt = `You are summarizing a health-care AI conversation.

${previousSummary ? `Previous Summary:\n${previousSummary}\n\n` : ''}

New Messages to Summarize:
${newMessages.map((m, i) => `${i + 1}. ${m.role}: ${m.text}`).join('\n')}

Instructions:
${contextHint}
- Create a concise summary that captures key health topics, user goals, and important context
- Preserve medical details (symptoms, conditions, dietary restrictions, allergies)
- Keep track of food logging patterns and diet plan discussions
- If merging with previous summary, integrate smoothly without redundancy
- Focus on facts, avoid speculation
- Max 150 words

Summary:`;

            const response = await this.llm.invoke(prompt);
            const summary = response.content.toString().trim();

            this.logger.debug(`Generated summary: ${summary.substring(0, 100)}...`);
            return summary;
        } catch (error) {
            this.logger.error('Failed to generate summary:', error);
            // Fallback: simple concatenation
            return this.generateFallbackSummary(newMessages, previousSummary);
        }
    }

    /**
     * Extract key topics from messages for quick filtering
     */
    extractKeyTopics (messages: MessageDocument[]): string[] {
        const topics = new Set<string>();

        messages.forEach(msg => {
            if (msg.intent) {
                if (msg.intent === 'symptom') topics.add('health-symptoms');
                if (msg.intent === 'food-logging') topics.add('food-tracking');
                if (msg.intent === 'food') topics.add('nutrition');
            }

            // Extract topics from evaluation if available
            if (msg.topDocs && msg.topDocs.length > 0) {
                msg.topDocs.forEach(doc => {
                    if (doc.domain) topics.add(doc.domain);
                });
            }
        });

        return Array.from(topics);
    }

    /**
     * Determine if summarization is needed
     */
    shouldSummarize (
        totalMessages: number,
        lastSummarizedIndex: number,
    ): boolean {
        const threshold = this.configService.conversationSummarizeAfter;
        return totalMessages - lastSummarizedIndex >= threshold;
    }

    /**
     * Create summary metadata for storage
     */
    async createSummaryMetadata (
        messages: MessageDocument[],
        fromIndex: number,
        toIndex: number,
        previousSummary?: string,
    ): Promise<SummaryResult> {
        const messagesToSummarize = messages.slice(fromIndex, toIndex);
        const summary = await this.generateIncrementalSummary(
            messagesToSummarize,
            previousSummary,
        );
        const keyTopics = this.extractKeyTopics(messagesToSummarize);

        return {
            summary,
            keyTopics,
            fromMessageIndex: fromIndex,
            toMessageIndex: toIndex,
        };
    }

    /**
     * Fallback summary when LLM fails
     */
    private generateFallbackSummary (
        messages: MessageDocument[],
        previousSummary?: string,
    ): string {
        const userMessages = messages
            .filter(m => m.role === 'user')
            .map(m => m.text)
            .join('. ');

        const summary = userMessages.substring(0, 300) + '...';

        if (previousSummary) {
            return `${previousSummary}\n\nRecent: ${summary}`;
        }

        return summary;
    }
}
