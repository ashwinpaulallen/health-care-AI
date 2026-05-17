import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RagDocument, RagDocumentDocument } from './schemas/document.schema';
import { RagChunk, RagChunkDocument } from './schemas/chunk.schema';
import { EmbeddingService } from './embedding.service';
import { IngestService, IngestDocInput } from './ingest.service';
import { TavilySearchResult } from '../agent/tavily-mcp.service';
import { ConfigService } from '../common/config/config.service';

@Injectable()
export class KnowledgeSaverService {
  private readonly logger = new Logger(KnowledgeSaverService.name);

  constructor(
    @InjectModel(RagDocument.name) private ragDocModel: Model<RagDocumentDocument>,
    @InjectModel(RagChunk.name) private ragChunkModel: Model<RagChunkDocument>,
    private readonly embeddingService: EmbeddingService,
    private readonly ingestService: IngestService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Save Tavily search results to knowledge base
   */
  async saveSearchResultsToKnowledgeBase(
    query: string,
    results: TavilySearchResult[],
    domain: 'symptom' | 'food',
  ): Promise<{ documentsCreated: number; chunksCreated: number }> {
    this.logger.log(`Saving ${results.length} search results to ${domain} knowledge base`);

    if (results.length === 0) {
      return { documentsCreated: 0, chunksCreated: 0 };
    }

    // Combine search results into a comprehensive document
    const combinedContent = this.combineSearchResults(query, results);

    // Check if document already exists (avoid duplicates)
    const existingDoc = await this.ragDocModel.findOne({
      domain,
      title: `Internet Search: ${query}`,
      sourceId: this.generateSourceId(`tavily-${query}`),
    });

    if (existingDoc) {
      this.logger.log(`Document already exists for query: ${query}, skipping save`);
      return { documentsCreated: 0, chunksCreated: 0 };
    }

    // Use ingest service to save the document
    const docInput: IngestDocInput = {
      title: `Internet Search: ${query}`,
      text: combinedContent,
      tags: ['tavily-search', 'auto-generated', query.toLowerCase()],
      section: 'Internet Research',
    };

    const ingestResult = await this.ingestService.ingest({
      domain,
      docs: [docInput],
    });

    this.logger.log(
      `Saved search results: ${ingestResult.documentsCreated} documents, ${ingestResult.chunksCreated} chunks`,
    );

    return ingestResult;
  }

  /**
   * Combine multiple search results into a single document
   */
  private combineSearchResults(query: string, results: TavilySearchResult[]): string {
    let content = `# ${query}\n\n`;
    content += `*This information was retrieved from internet search and added to the knowledge base.*\n\n`;
    content += `**Sources:** ${results.length} articles\n\n`;
    content += `---\n\n`;

    results.forEach((result, index) => {
      content += `## ${result.title}\n\n`;
      content += `**Source:** [${result.url}](${result.url})\n\n`;
      content += `${result.content}\n\n`;
      
      if (index < results.length - 1) {
        content += `---\n\n`;
      }
    });

    content += `\n\n*Note: This content was automatically generated from internet search results.*`;

    return content;
  }

  /**
   * Generate a source ID for the document
   */
  private generateSourceId(title: string): string {
    return `tavily-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
  }
}

