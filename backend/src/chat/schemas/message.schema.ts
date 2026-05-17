import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument, Types } from 'mongoose';

export type MessageDocument = Message & MongooseDocument;

@Schema({ collection: 'messages' })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  convId: Types.ObjectId;

  @Prop({ required: true, enum: ['user', 'assistant', 'tool'] })
  role: 'user' | 'assistant' | 'tool';

  @Prop({ required: true })
  text: string;

  @Prop({ type: Object })
  json?: Record<string, any>;

  @Prop()
  intent?: string;

  @Prop({ type: [Object] })
  topDocs?: Array<{
    text: string;
    score: number;
    domain: string;
  }>;

  @Prop({ type: Object })
  evaluation?: {
    relevance: number;
    clarity: number;
    completeness: number;
    citationQuality: number;
    overallScore: number;
    needsImprovement: boolean;
    feedback?: string;
  };

  @Prop()
  retryCount?: number;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Index for conversation lookups
MessageSchema.index({ convId: 1, createdAt: 1 });

