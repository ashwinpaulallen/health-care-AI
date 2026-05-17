import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';

export type ConversationDocument = Conversation & MongooseDocument;

@Schema({ collection: 'conversations' })
export class Conversation {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ default: () => new Date() })
  startedAt: Date;

  @Prop({ default: () => new Date() })
  lastAt: Date;

  // Cached summaries for conversation context
  @Prop({ type: Object })
  summaries?: {
    // Incremental summary of messages 6-20
    midTerm?: {
      summary: string;
      fromMessageIndex: number;
      toMessageIndex: number;
      generatedAt: Date;
      keyTopics: string[];
    };
    // High-level summary of messages 20+
    longTerm?: {
      summary: string;
      fromMessageIndex: number;
      toMessageIndex: number;
      generatedAt: Date;
      keyTopics: string[];
    };
  };

  // Track last summarized message for incremental updates
  @Prop({ default: 0 })
  lastSummarizedMessageIndex?: number;

  // Total message count for quick reference
  @Prop({ default: 0 })
  messageCount?: number;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Index for user lookups
ConversationSchema.index({ userId: 1, lastAt: -1 });

