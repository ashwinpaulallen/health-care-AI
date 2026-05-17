import { Module, forwardRef } from '@nestjs/common';
import { LlmChatService } from './llm.chat.service';
import { TavilyMcpService } from './tavily-mcp.service';
import { EvaluationService } from './evaluation.service';
import { ReflectionService } from './reflection.service';
import { ConversationSummarizerService } from './conversation-summarizer.service';
import { ConversationContextService } from './conversation-context.service';
import { ContextBuilderService } from './context-builder.service';
import { FoodTrackingService } from './food-tracking.service';
import { SummarizationService } from './summarization.service';
import { RagModule } from '../rag/rag.module';
import { CommonModule } from '../common/common.module';
import { DietModule } from '../diet/diet.module';

@Module({
  imports: [RagModule, CommonModule, forwardRef(() => DietModule)], // Use forwardRef to handle circular dependency
  providers: [
    LlmChatService,
    TavilyMcpService,
    EvaluationService,
    ReflectionService,
    ConversationSummarizerService,
    ConversationContextService,
    ContextBuilderService,
    FoodTrackingService,
    SummarizationService,
  ],
  exports: [
    LlmChatService,
    TavilyMcpService,
    EvaluationService,
    ReflectionService,
    ConversationSummarizerService,
    ConversationContextService,
    ContextBuilderService,
    FoodTrackingService,
    SummarizationService,
  ],
})
export class AgentModule { }
