import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RagDocument, RagDocumentSchema } from './schemas/document.schema';
import { RagChunk, RagChunkSchema } from './schemas/chunk.schema';
import { EmbeddingService } from './embedding.service';
import { IngestService } from './ingest.service';
import { IngestController } from './ingest.controller';
import { AdminController } from './admin.controller';
import { RetrieverService } from './retriever.service';
import { KnowledgeSaverService } from './knowledge-saver.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RagDocument.name, schema: RagDocumentSchema },
      { name: RagChunk.name, schema: RagChunkSchema },
    ]),
  ],
  controllers: [IngestController, AdminController],
  providers: [EmbeddingService, IngestService, RetrieverService, KnowledgeSaverService],
  exports: [EmbeddingService, RetrieverService, KnowledgeSaverService],
})
export class RagModule {}

