import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RagDocument, RagDocumentDocument } from './schemas/document.schema';
import { RagChunk, RagChunkDocument } from './schemas/chunk.schema';
import { EmbeddingService } from './embedding.service';
import { ConfigService } from '../common/config/config.service';

export interface IngestDocInput {
  title: string;
  text: string;
  tags?: string[];
  section?: string;
}

export interface IngestInput {
  domain: 'symptom' | 'food';
  docs: IngestDocInput[];
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    @InjectModel(RagDocument.name) private ragDocModel: Model<RagDocumentDocument>,
    @InjectModel(RagChunk.name) private ragChunkModel: Model<RagChunkDocument>,
    private readonly embeddingService: EmbeddingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Ingest documents into RAG system
   */
  async ingest(input: IngestInput): Promise<{ documentsCreated: number; chunksCreated: number }> {
    this.logger.log(`Starting ingestion for domain: ${input.domain}`);

    let totalDocs = 0;
    let totalChunks = 0;

    for (const docInput of input.docs) {
      // Create document record
      const doc = await this.ragDocModel.create({
        domain: input.domain,
        title: docInput.title,
        sourceId: this.generateSourceId(docInput.title),
        tags: docInput.tags || [],
      });

      totalDocs++;
      this.logger.log(`Created document: ${doc.title}`);

      // Chunk the text
      const chunks = this.chunkText(docInput.text);
      this.logger.log(`Generated ${chunks.length} chunks for ${doc.title}`);

      // Generate embeddings for chunks
      const embeddings = await this.embeddingService.embedBatch(chunks);

      // Store chunks with embeddings
      const chunkDocs = chunks.map((chunkText, idx) => ({
        docId: doc._id,
        domain: input.domain,
        text: chunkText,
        embedding: Array.from(embeddings[idx]),
        meta: {
          section: docInput.section,
          ...(input.domain === 'symptom' && this.extractRedFlags(chunkText)),
          ...(input.domain === 'food' && this.extractDietTags(chunkText)),
        },
      }));

      await this.ragChunkModel.insertMany(chunkDocs);
      totalChunks += chunkDocs.length;
    }

    this.logger.log(
      `Ingestion complete: ${totalDocs} documents, ${totalChunks} chunks created`,
    );

    return {
      documentsCreated: totalDocs,
      chunksCreated: totalChunks,
    };
  }

  /**
   * Simple sentence-based chunker with overlap
   */
  private chunkText(text: string): string[] {
    const chunkSize = this.configService.chunkSize;
    const overlap = this.configService.chunkOverlap;

    // Split by sentences (simple approach)
    const sentences = text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentLength = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.split(/\s+/).length;

      if (currentLength + sentenceLength > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push(currentChunk.join('. ') + '.');

        // Create overlap by keeping last few sentences
        const overlapSentences: string[] = [];
        let overlapLength = 0;
        for (let i = currentChunk.length - 1; i >= 0; i--) {
          const len = currentChunk[i].split(/\s+/).length;
          if (overlapLength + len <= overlap) {
            overlapSentences.unshift(currentChunk[i]);
            overlapLength += len;
          } else {
            break;
          }
        }

        currentChunk = overlapSentences;
        currentLength = overlapLength;
      }

      currentChunk.push(sentence);
      currentLength += sentenceLength;
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('. ') + '.');
    }

    return chunks;
  }

  /**
   * Extract red flag keywords from symptom chunks
   */
  private extractRedFlags(text: string): { redFlags?: string[] } {
    const redFlagKeywords = [
      'emergency',
      'seek immediate',
      'call emergency',
      'severe pain',
      'chest pain',
      'difficulty breathing',
      'blood',
      'unconscious',
      'confusion',
      'severe',
    ];

    const found = redFlagKeywords.filter((keyword) =>
      text.toLowerCase().includes(keyword.toLowerCase()),
    );

    return found.length > 0 ? { redFlags: found } : {};
  }

  /**
   * Extract diet-related tags from food chunks
   */
  private extractDietTags(text: string): { dietTags?: string[] } {
    const dietKeywords = [
      'protein',
      'fiber',
      'carbohydrate',
      'fat',
      'vitamin',
      'mineral',
      'calories',
      'sodium',
      'sugar',
      'whole grain',
    ];

    const found = dietKeywords.filter((keyword) =>
      text.toLowerCase().includes(keyword.toLowerCase()),
    );

    return found.length > 0 ? { dietTags: found } : {};
  }

  /**
   * Generate a simple source ID from title
   */
  private generateSourceId(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  /**
   * Clear all documents and chunks for a domain (useful for re-ingestion)
   */
  async clearDomain(domain: 'symptom' | 'food'): Promise<void> {
    const docs = await this.ragDocModel.find({ domain }).exec();
    const docIds = docs.map((d) => d._id);

    await this.ragChunkModel.deleteMany({ docId: { $in: docIds } }).exec();
    await this.ragDocModel.deleteMany({ domain }).exec();

    this.logger.log(`Cleared all data for domain: ${domain}`);
  }
}

