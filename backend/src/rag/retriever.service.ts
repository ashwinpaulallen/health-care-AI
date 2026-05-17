import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RagChunk, RagChunkDocument } from './schemas/chunk.schema';
import { EmbeddingService } from './embedding.service';
import { ConfigService } from '../common/config/config.service';
import { cosineSimilarity } from '../utils/cosine';

export interface RetrievedChunk {
  text: string;
  score: number;
  domain: 'symptom' | 'food';
  docId: string;
  meta?: {
    section?: string;
    redFlags?: string[];
    dietTags?: string[];
  };
}

@Injectable()
export class RetrieverService {
  private readonly logger = new Logger(RetrieverService.name);

  constructor(
    @InjectModel(RagChunk.name) private ragChunkModel: Model<RagChunkDocument>,
    private readonly embeddingService: EmbeddingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Retrieve relevant chunks using hybrid search (keyword + vector)
   */
  async retrieve(
    query: string,
    domain: 'symptom' | 'food',
    k?: number,
  ): Promise<RetrievedChunk[]> {
    const topK = k || this.configService.ragTopK;
    const threshold = this.configService.ragSimilarityThreshold;

    this.logger.log(`Retrieving top ${topK} chunks for domain: ${domain}`);

    // Step 1: Text prefilter using MongoDB text search
    const textCandidates = await this.ragChunkModel
      .find(
        {
          domain,
          $text: { $search: query },
        },
        { score: { $meta: 'textScore' } },
      )
      .sort({ score: { $meta: 'textScore' } })
      .limit(topK * 3) // Get more candidates for reranking
      .exec();

    this.logger.log(`Text search found ${textCandidates.length} candidates`);

    // If no text matches, fall back to all chunks in domain (last resort)
    let candidates = textCandidates;
    if (candidates.length === 0) {
      this.logger.log('No text matches, falling back to all chunks in domain');
      candidates = await this.ragChunkModel.find({ domain }).limit(topK * 5).exec();
    }

    // Step 2: Generate query embedding
    const queryEmbedding = await this.embeddingService.embedOne(query);

    // Step 3: Compute cosine similarity and rerank
    const scoredChunks = candidates.map((chunk) => {
      const chunkEmbedding = new Float32Array(chunk.embedding);
      const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);

      return {
        text: chunk.text,
        score: similarity,
        domain: chunk.domain,
        docId: chunk.docId.toString(),
        meta: chunk.meta,
      };
    });

    // Sort by similarity score (descending)
    scoredChunks.sort((a, b) => b.score - a.score);

    // Filter by threshold and take top K
    const results = scoredChunks.filter((chunk) => chunk.score >= threshold).slice(0, topK);

    this.logger.log(`Returning ${results.length} chunks with scores >= ${threshold}`);

    return results;
  }

  /**
   * Retrieve with spillover from other domain
   * Useful for getting context from both domains
   */
  async retrieveWithSpillover(
    query: string,
    primaryDomain: 'symptom' | 'food',
    primaryK: number = 4,
    spilloverK: number = 1,
  ): Promise<{ primary: RetrievedChunk[]; spillover: RetrievedChunk[] }> {
    const secondaryDomain = primaryDomain === 'symptom' ? 'food' : 'symptom';

    const [primary, spillover] = await Promise.all([
      this.retrieve(query, primaryDomain, primaryK),
      this.retrieve(query, secondaryDomain, spilloverK),
    ]);

    return { primary, spillover };
  }
}

