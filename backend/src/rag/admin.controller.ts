import { Controller, Get, Post, Put, Delete, Body, Param, Query, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RagDocument, RagDocumentDocument } from './schemas/document.schema';
import { RagChunk, RagChunkDocument } from './schemas/chunk.schema';
import { IngestService } from './ingest.service';

export interface CreateDocumentDto {
  domain: 'symptom' | 'food';
  title: string;
  content: string;
  tags?: string[];
  section?: string;
}

export interface UpdateDocumentDto {
  title?: string;
  content?: string;
  tags?: string[];
  section?: string;
}

@Controller('admin/knowledge')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    @InjectModel(RagDocument.name) private ragDocModel: Model<RagDocumentDocument>,
    @InjectModel(RagChunk.name) private ragChunkModel: Model<RagChunkDocument>,
    private readonly ingestService: IngestService,
  ) { }

  /**
   * Get all documents for a domain
   */
  @Get(':domain')
  async getDocuments (@Param('domain') domain: 'symptom' | 'food') {
    this.logger.log(`Fetching all documents for domain: ${domain}`);

    const documents = await this.ragDocModel
      .find({ domain })
      .sort({ createdAt: -1 })
      .exec();

    // Get chunk counts for each document
    const documentsWithCounts = await Promise.all(
      documents.map(async (doc) => {
        const chunkCount = await this.ragChunkModel.countDocuments({ docId: doc._id });
        return {
          id: doc._id,
          domain: doc.domain,
          title: doc.title,
          sourceId: doc.sourceId,
          tags: doc.tags,
          chunkCount,
          createdAt: doc.createdAt,
          updatedAt: (doc as any).updatedAt,
        };
      }),
    );

    return {
      success: true,
      domain,
      documents: documentsWithCounts,
      total: documentsWithCounts.length,
    };
  }

  /**
   * Get a single document with its chunks
   */
  @Get(':domain/:id')
  async getDocument (
    @Param('domain') domain: 'symptom' | 'food',
    @Param('id') id: string,
  ) {
    this.logger.log(`Fetching document ${id} from domain: ${domain}`);

    const document = await this.ragDocModel.findOne({ _id: id, domain }).exec();

    if (!document) {
      return {
        success: false,
        message: 'Document not found',
      };
    }

    const chunks = await this.ragChunkModel
      .find({ docId: document._id })
      .select('text meta')
      .exec();

    // Reconstruct content from chunks
    const content = chunks.map((chunk) => chunk.text).join('\n\n');

    return {
      success: true,
      document: {
        id: document._id,
        domain: document.domain,
        title: document.title,
        sourceId: document.sourceId,
        tags: document.tags,
        content,
        chunkCount: chunks.length,
        createdAt: document.createdAt,
        updatedAt: (document as any).updatedAt,
      },
    };
  }

  /**
   * Create a new document
   */
  @Post(':domain')
  async createDocument (
    @Param('domain') domain: 'symptom' | 'food',
    @Body() dto: CreateDocumentDto,
  ) {
    this.logger.log(`Creating new document in domain: ${domain}`);

    // Validate domain matches
    if (dto.domain !== domain) {
      return {
        success: false,
        message: 'Domain mismatch between URL and body',
      };
    }

    try {
      // Use ingest service to create document with embeddings
      const result = await this.ingestService.ingest({
        domain: dto.domain,
        docs: [
          {
            title: dto.title,
            text: dto.content,
            tags: dto.tags,
            section: dto.section,
          },
        ],
      });

      this.logger.log(
        `Document created: ${result.documentsCreated} docs, ${result.chunksCreated} chunks`,
      );

      return {
        success: true,
        message: 'Document created successfully',
        documentsCreated: result.documentsCreated,
        chunksCreated: result.chunksCreated,
      };
    } catch (error) {
      this.logger.error('Failed to create document:', error);
      return {
        success: false,
        message: 'Failed to create document',
        error: error.message,
      };
    }
  }

  /**
   * Update a document
   */
  @Put(':domain/:id')
  async updateDocument (
    @Param('domain') domain: 'symptom' | 'food',
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    this.logger.log(`Updating document ${id} in domain: ${domain}`);

    try {
      const document = await this.ragDocModel.findOne({ _id: id, domain }).exec();

      if (!document) {
        return {
          success: false,
          message: 'Document not found',
        };
      }

      // Delete old chunks
      await this.ragChunkModel.deleteMany({ docId: document._id }).exec();

      // Update document metadata
      if (dto.title) document.title = dto.title;
      if (dto.tags) document.tags = dto.tags;
      (document as any).updatedAt = new Date();
      await document.save();

      // If content is provided, re-chunk and re-embed
      if (dto.content) {
        await this.ingestService.ingest({
          domain,
          docs: [
            {
              title: document.title,
              text: dto.content,
              tags: document.tags,
              section: dto.section,
            },
          ],
        });
      }

      this.logger.log(`Document ${id} updated successfully`);

      return {
        success: true,
        message: 'Document updated successfully',
      };
    } catch (error) {
      this.logger.error('Failed to update document:', error);
      return {
        success: false,
        message: 'Failed to update document',
        error: error.message,
      };
    }
  }

  /**
   * Delete a document and its chunks
   */
  @Delete(':domain/:id')
  async deleteDocument (
    @Param('domain') domain: 'symptom' | 'food',
    @Param('id') id: string,
  ) {
    this.logger.log(`Deleting document ${id} from domain: ${domain}`);

    try {
      const document = await this.ragDocModel.findOne({ _id: id, domain }).exec();

      if (!document) {
        return {
          success: false,
          message: 'Document not found',
        };
      }

      // Delete chunks first
      const chunksDeleted = await this.ragChunkModel.deleteMany({ docId: document._id }).exec();

      // Delete document
      await this.ragDocModel.deleteOne({ _id: id }).exec();

      this.logger.log(`Document ${id} deleted (${chunksDeleted.deletedCount} chunks removed)`);

      return {
        success: true,
        message: 'Document deleted successfully',
        chunksDeleted: chunksDeleted.deletedCount,
      };
    } catch (error) {
      this.logger.error('Failed to delete document:', error);
      return {
        success: false,
        message: 'Failed to delete document',
        error: error.message,
      };
    }
  }

  /**
   * Get statistics for a domain
   */
  @Get(':domain/stats')
  async getDomainStats (@Param('domain') domain: 'symptom' | 'food') {
    this.logger.log(`Fetching stats for domain: ${domain}`);

    const documentCount = await this.ragDocModel.countDocuments({ domain });
    const chunkCount = await this.ragChunkModel.countDocuments({ domain });

    return {
      success: true,
      domain,
      stats: {
        documents: documentCount,
        chunks: chunkCount,
        averageChunksPerDocument: documentCount > 0 ? Math.round(chunkCount / documentCount) : 0,
      },
    };
  }
}

