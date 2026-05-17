import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';

export type RagDocumentDocument = RagDocument & MongooseDocument;

@Schema({ collection: 'rag_documents', timestamps: true })
export class RagDocument {
  @Prop({ required: true, enum: ['symptom', 'food'], index: true })
  domain: 'symptom' | 'food';

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  sourceId: string;

  @Prop()
  sourceUrl?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  createdAt?: Date;
}

export const RagDocumentSchema = SchemaFactory.createForClass(RagDocument);

// Create index on domain for filtering
RagDocumentSchema.index({ domain: 1 });

