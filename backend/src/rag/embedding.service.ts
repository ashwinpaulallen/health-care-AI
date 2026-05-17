import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../common/config/config.service';
import { RedisService } from '../common/redis/redis.service';
import { createHash } from 'crypto';
import { normalizeVector } from '../utils/cosine';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Generate embedding for a single text
   */
  async embedOne(text: string): Promise<Float32Array> {
    // Check cache first
    const cacheKey = this.getCacheKey(text);
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      this.logger.debug('Embedding cache hit');
      const parsedArray = JSON.parse(cached);
      return new Float32Array(parsedArray);
    }

    // Generate embedding via LM Studio using raw HTTP (OpenAI SDK has compatibility issues)
    try {
      this.logger.debug(`Calling embeddings API with model: ${this.configService.embedModel}, text length: ${text.length}, baseURL: ${this.configService.llmBaseUrl}`);
      this.logger.debug(`Text preview: ${text.substring(0, 100)}...`);
      
      const url = `${this.configService.llmBaseUrl}/embeddings`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.configService.embedModel,
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const embedding = data.data[0].embedding;
      
      this.logger.debug(`Response received - embedding length: ${embedding.length}, first 5: ${embedding.slice(0, 5)}`);
      
      const normalized = normalizeVector(embedding);
      this.logger.debug(`After normalization - length: ${normalized.length}, first 5: ${Array.from(normalized.slice(0, 5))}`);

      // Cache the result
      await this.redisService.set(
        cacheKey,
        JSON.stringify(Array.from(normalized)),
        this.configService.cacheTtl,
      );

      return normalized;
    } catch (error) {
      this.logger.error('Failed to generate embedding:', error);
      throw new Error('Embedding generation failed');
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const embeddings: Float32Array[] = [];

    // Process in batches to avoid overwhelming the local server
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((text) => this.embedOne(text)));
      embeddings.push(...batchResults);

      this.logger.log(
        `Embedded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`,
      );
    }

    return embeddings;
  }

  /**
   * Generate cache key using SHA256 hash of text
   */
  private getCacheKey(text: string): string {
    const hash = createHash('sha256').update(text).digest('hex');
    return `emb:chunk:${hash}`;
  }
}

