import { Controller, Post, Body, Get, Param, Logger, Delete } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IsString, IsOptional } from 'class-validator';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { DietPlan, DietPlanDocument } from '../diet/schemas/diet-plan.schema';
import { FoodLog, FoodLogDocument } from '../diet/schemas/food-log.schema';
import { LlmChatService } from '../agent/llm.chat.service';
import { RetrieverService } from '../rag/retriever.service';
import { TavilyMcpService } from '../agent/tavily-mcp.service';
import { KnowledgeSaverService } from '../rag/knowledge-saver.service';
import { EvaluationService } from '../agent/evaluation.service';
import { ReflectionService } from '../agent/reflection.service';
import { ContextBuilderService } from '../agent/context-builder.service';
import { FoodTrackingService } from '../agent/food-tracking.service';
import { ConfigService } from '../common/config/config.service';
import runChatTurn from '../agent/graph';

class ChatMessageDto {
  @IsString()
  userId: string;

  @IsString()
  @IsOptional()
  convId?: string;

  @IsString()
  text: string;
}

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(DietPlan.name) private dietPlanModel: Model<DietPlanDocument>,
    @InjectModel(FoodLog.name) private foodLogModel: Model<FoodLogDocument>,
    private readonly llmService: LlmChatService,
    private readonly retrieverService: RetrieverService,
    private readonly tavilyService: TavilyMcpService,
    private readonly knowledgeSaverService: KnowledgeSaverService,
    private readonly evaluationService: EvaluationService,
    private readonly reflectionService: ReflectionService,
    private readonly contextBuilderService: ContextBuilderService,
    private readonly foodTrackingService: FoodTrackingService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * POST /chat/message - Send a chat message and get response
   */
  @Post('message')
  async sendMessage (@Body() dto: ChatMessageDto) {
    this.logger.log(`Received message from user: ${dto.userId}`);
    this.logger.log(`Services available - Tavily: ${!!this.tavilyService}, KnowledgeSaver: ${!!this.knowledgeSaverService}`);

    // Run the complete chat turn with persistence
    // ContextBuilderService handles all context building (deterministic state + conversation)
    // FoodTrackingService handles food logging when user reports eating food
    // Include Tavily and KnowledgeSaver services for internet search fallback
    // Include Evaluation and Reflection services for self-evaluation and correction
    const result = await runChatTurn(
      {
        userId: dto.userId,
        convId: dto.convId,
        text: dto.text,
        dietPlanModel: this.dietPlanModel,
        foodLogModel: this.foodLogModel,
        messageModel: this.messageModel,
        contextBuilderService: this.contextBuilderService,
        foodTrackingService: this.foodTrackingService,
        configService: this.configService,
      },
      this.conversationModel,
      this.messageModel,
      this.llmService,
      this.retrieverService,
      this.evaluationService,
      this.reflectionService,
      this.tavilyService,
      this.knowledgeSaverService,
    );

    // Return response
    return {
      success: true,
      ...result,
    };
  }

  /**
   * GET /chat/conversation/:convId - Get conversation history (last 50 messages)
   */
  @Get('conversation/:convId')
  async getConversation (@Param('convId') convId: string) {
    this.logger.log(`Fetching conversation: ${convId}`);

    const conversation = await this.conversationModel.findById(convId).exec();
    if (!conversation) {
      return {
        success: false,
        error: 'Conversation not found',
      };
    }

    // Fetch last 50 messages for reloads
    const messages = await this.messageModel
      .find({ convId: new Types.ObjectId(convId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();

    // Reverse to get chronological order (oldest first)
    messages.reverse();

    return {
      success: true,
      conversation: {
        id: (conversation._id as any).toString(),
        userId: conversation.userId,
        startedAt: conversation.startedAt,
        lastAt: conversation.lastAt,
      },
      messages: messages.map((msg) => ({
        id: (msg._id as any).toString(),
        role: msg.role,
        text: msg.text,
        json: msg.json,
        intent: msg.intent,
        topDocs: msg.topDocs,
        evaluation: msg.evaluation,
        retryCount: msg.retryCount,
        createdAt: msg.createdAt,
      })),
    };
  }

  /**
   * GET /chat/user/:userId/conversations - Fetch user's conversation list with metadata
   */
  @Get('user/:userId/conversations')
  async getUserConversations (@Param('userId') userId: string) {
    this.logger.log(`Fetching conversations for user: ${userId}`);

    const conversations = await this.conversationModel
      .find({ userId })
      .sort({ lastAt: -1 })
      .limit(20)
      .exec();

    // Fetch first message and message count for each conversation
    const conversationsWithMetadata = await Promise.all(
      conversations.map(async (conv) => {
        // Get first user message for title
        let firstMessage = await this.messageModel
          .findOne({ convId: conv._id, role: 'user' })
          .sort({ createdAt: 1 })
          .exec();

        // If no user message, get the first message of any role
        if (!firstMessage) {
          firstMessage = await this.messageModel
            .findOne({ convId: conv._id })
            .sort({ createdAt: 1 })
            .exec();
        }

        // Get message count
        const messageCount = await this.messageModel
          .countDocuments({ convId: conv._id })
          .exec();

        const title = firstMessage?.text?.substring(0, 60) || 'New Conversation';

        this.logger.debug(`Conversation ${conv._id}: title="${title}", messageCount=${messageCount}`);

        return {
          id: (conv._id as any).toString(),
          userId: conv.userId,
          startedAt: conv.startedAt,
          lastAt: conv.lastAt,
          title,
          messageCount,
        };
      }),
    );

    return {
      success: true,
      conversations: conversationsWithMetadata,
    };
  }

  /**
   * GET /chat/health - Health check endpoint
   */
  @Get('health')
  async health () {
    return {
      success: true,
      message: 'Chat service is healthy',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * DELETE /chat/conversation/:convId - Delete a conversation and its messages
   */
  @Delete('conversation/:convId')
  async deleteConversation (@Param('convId') convId: string) {
    this.logger.log(`Deleting conversation: ${convId}`);

    try {
      // Delete all messages in the conversation
      const deleteResult = await this.messageModel.deleteMany({ convId: new Types.ObjectId(convId) }).exec();
      this.logger.log(`Deleted ${deleteResult.deletedCount} messages`);

      // Delete the conversation
      const conversation = await this.conversationModel.findByIdAndDelete(convId).exec();

      if (!conversation) {
        return {
          success: false,
          error: 'Conversation not found',
        };
      }

      return {
        success: true,
        message: 'Conversation deleted successfully',
      };
    } catch (error) {
      this.logger.error('Error deleting conversation:', error);
      return {
        success: false,
        error: 'Failed to delete conversation',
      };
    }
  }

  /**
   * GET /chat/evaluation/:messageId - Get evaluation metrics for a message
   */
  @Get('evaluation/:messageId')
  async getEvaluation (@Param('messageId') messageId: string) {
    this.logger.log(`Fetching evaluation for message: ${messageId}`);

    const message = await this.messageModel.findById(messageId).exec();
    if (!message) {
      return {
        success: false,
        error: 'Message not found',
      };
    }

    if (!message.evaluation) {
      return {
        success: false,
        error: 'No evaluation data available for this message',
      };
    }

    return {
      success: true,
      messageId: (message._id as any).toString(),
      evaluation: message.evaluation,
      retryCount: message.retryCount || 0,
      intent: message.intent,
      createdAt: message.createdAt,
    };
  }

  /**
   * GET /chat/evaluations/user/:userId - Get all evaluations for a user
   */
  @Get('evaluations/user/:userId')
  async getUserEvaluations (@Param('userId') userId: string) {
    this.logger.log(`Fetching evaluations for user: ${userId}`);

    // Get all conversations for user
    const conversations = await this.conversationModel.find({ userId }).exec();
    const convIds = conversations.map((conv) => conv._id);

    // Get all messages with evaluations
    const messages = await this.messageModel
      .find({
        convId: { $in: convIds },
        role: 'assistant',
        evaluation: { $exists: true },
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();

    // Calculate aggregate statistics
    const evaluations = messages
      .filter((msg) => msg.evaluation)
      .map((msg) => msg.evaluation!);

    if (evaluations.length === 0) {
      return {
        success: true,
        message: 'No evaluations found',
        statistics: null,
        evaluations: [],
      };
    }

    const avgRelevance =
      evaluations.reduce((sum, e) => sum + e.relevance, 0) / evaluations.length;
    const avgClarity =
      evaluations.reduce((sum, e) => sum + e.clarity, 0) / evaluations.length;
    const avgCompleteness =
      evaluations.reduce((sum, e) => sum + e.completeness, 0) / evaluations.length;
    const avgCitationQuality =
      evaluations.reduce((sum, e) => sum + e.citationQuality, 0) / evaluations.length;
    const avgOverallScore =
      evaluations.reduce((sum, e) => sum + e.overallScore, 0) / evaluations.length;
    const needsImprovementCount = evaluations.filter((e) => e.needsImprovement).length;
    const totalRetries = messages.reduce((sum, msg) => sum + (msg.retryCount || 0), 0);

    return {
      success: true,
      statistics: {
        totalEvaluations: evaluations.length,
        averageRelevance: parseFloat(avgRelevance.toFixed(3)),
        averageClarity: parseFloat(avgClarity.toFixed(3)),
        averageCompleteness: parseFloat(avgCompleteness.toFixed(3)),
        averageCitationQuality: parseFloat(avgCitationQuality.toFixed(3)),
        averageOverallScore: parseFloat(avgOverallScore.toFixed(3)),
        needsImprovementCount,
        improvementRate: parseFloat((needsImprovementCount / evaluations.length).toFixed(3)),
        totalRetries,
        averageRetriesPerMessage: parseFloat((totalRetries / messages.length).toFixed(2)),
      },
      evaluations: messages.map((msg) => ({
        messageId: (msg._id as any).toString(),
        text: msg.text.substring(0, 100) + '...',
        intent: msg.intent,
        evaluation: msg.evaluation,
        retryCount: msg.retryCount || 0,
        createdAt: msg.createdAt,
      })),
    };
  }
}

