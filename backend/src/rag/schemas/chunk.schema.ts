import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument, Types } from 'mongoose';

export type RagChunkDocument = RagChunk & MongooseDocument;

export interface ChunkMeta {
  section?: string;
  redFlags?: string[];
  dietTags?: string[];
}

@Schema({ collection: 'rag_chunks' })
export class RagChunk {
  @Prop({ type: Types.ObjectId, ref: 'RagDocument', required: true, index: true })
  docId: Types.ObjectId;

  @Prop({ required: true, enum: ['symptom', 'food'], index: true })
  domain: 'symptom' | 'food';

  @Prop({ required: true, text: true })
  text: string;

  @Prop({ type: [Number], required: true })
  embedding: number[];

  @Prop({ type: Object })
  meta?: ChunkMeta;
}

export const RagChunkSchema = SchemaFactory.createForClass(RagChunk);

// Create text index for keyword search
RagChunkSchema.index({ text: 'text' });

// Compound index for domain + text search
RagChunkSchema.index({ domain: 1, text: 'text' });

