import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
  // LM Studio Configuration
  get llmBaseUrl (): string {
    return process.env.LLM_BASE_URL || 'http://localhost:1234/v1';
  }

  get llmChatModel (): string {
    return process.env.LLM_CHAT_MODEL || 'openai/gpt-oss-20b';
  }

  get embedModel (): string {
    return process.env.EMBED_MODEL || 'text-embedding-nomic-embed-text-v1.5';
  }

  // Database Configuration
  get mongoUri (): string {
    return process.env.MONGO_URI || 'mongodb://localhost:27017/diet-coach-poc';
  }

  // Redis Configuration
  get redisUrl (): string {
    return process.env.REDIS_URL || 'redis://localhost:6379';
  }

  // Server Configuration
  get port (): number {
    return parseInt(process.env.PORT || '3001', 10);
  }

  get nodeEnv (): string {
    return process.env.NODE_ENV || 'development';
  }

  // RAG Configuration
  get ragTopK (): number {
    return parseInt(process.env.RAG_TOP_K || '5', 10);
  }

  get ragSimilarityThreshold (): number {
    return parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.7');
  }

  get chunkSize (): number {
    return parseInt(process.env.CHUNK_SIZE || '500', 10);
  }

  get chunkOverlap (): number {
    return parseInt(process.env.CHUNK_OVERLAP || '50', 10);
  }

  // Cache Configuration
  get cacheTtl (): number {
    return parseInt(process.env.CACHE_TTL || '3600', 10);
  }

  // Diet Tracking Configuration
  get rollingWindowDays (): number {
    return parseInt(process.env.ROLLING_WINDOW_DAYS || '7', 10);
  }

  // Conversation Context Configuration
  get conversationRecentMessages (): number {
    // Simple fixed window: keep last N messages (default: 3)
    // No summarization - kept simple for reliability and performance
    return parseInt(process.env.CONVERSATION_RECENT_MESSAGES || '3', 10);
  }

  get conversationSummarizeAfter (): number {
    // Start summarizing after N messages (default: 20)
    // Tiered approach: recent messages (full) + mid-term summary + long-term summary
    // Helps reduce token usage for long conversations while maintaining context
    return parseInt(process.env.CONVERSATION_SUMMARIZE_AFTER || '20', 10);
  }

  get conversationContextEnabled (): boolean {
    return process.env.CONVERSATION_CONTEXT_ENABLED !== 'false'; // Default: true
  }
}
