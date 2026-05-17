import { Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { Message, MessageDocument } from '../chat/schemas/message.schema';
import { DietPlan, DietPlanDocument } from '../diet/schemas/diet-plan.schema';
import { FoodLog, FoodLogDocument } from '../diet/schemas/food-log.schema';
import { ConfigService } from '../common/config/config.service';
import { FoodLogService } from '../diet/food-log.service';
import { ConversationSummarizerService } from './conversation-summarizer.service';

export interface DeterministicState {
  // User profile (deterministic)
  userId: string;
  profile?: {
    conditions?: string[];
    allergies?: string[];
    dietaryRestrictions?: string[];
  };

  // Diet plan (deterministic)
  dietPlan?: {
    name: string;
    dailyMacroTargets: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
    };
    goals?: string[];
    dietaryRestrictions?: string[];
    allergies?: string[];
  };

  // Today's consumption (deterministic)
  todayConsumption?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    mealsLogged: number;
  };

  // Rolling window stats (deterministic)
  rollingWindowStats?: {
    windowDays: number;
    daysLogged: number;
    averages: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
    };
    trend: 'improving' | 'declining' | 'stable';
  };
}

export interface ConversationContext {
  // Simple fixed window - last N messages (full detail)
  recentMessages: Array<{
    role: 'user' | 'assistant';
    text: string;
    intent?: string;
    createdAt: Date;
  }>;

  // Tiered summaries for older messages
  summary?: string;
}

export interface AgentContext {
  deterministicState: DeterministicState;
  conversationContext: ConversationContext;
}

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly conversationSummarizerService: ConversationSummarizerService,
    private readonly foodLogService: FoodLogService,
  ) { }

  /**
   * Build complete context for agent execution
   * Separates deterministic state from adaptive conversation context
   */
  async buildContext (
    userId: string,
    convId: string | undefined,
    dietPlanModel?: Model<DietPlanDocument>,
    foodLogModel?: Model<FoodLogDocument>,
    messageModel?: Model<MessageDocument>,
    conversationModel?: Model<any>,
  ): Promise<AgentContext> {
    // 1. Build deterministic state (always accurate, never adaptive)
    const deterministicState = await this.buildDeterministicState(
      userId,
      dietPlanModel,
      foodLogModel,
    );

    // 2. Build tiered conversation context (recent full + older summarized)
    const conversationContext = await this.buildConversationContext(
      convId,
      messageModel,
      conversationModel,
    );

    return {
      deterministicState,
      conversationContext,
    };
  }

  /**
   * Build deterministic state - always accurate, never adaptive
   * Includes: profile, diet plan, today's consumption, rolling stats
   */
  private async buildDeterministicState (
    userId: string,
    dietPlanModel?: Model<DietPlanDocument>,
    foodLogModel?: Model<FoodLogDocument>,
  ): Promise<DeterministicState> {
    const state: DeterministicState = {
      userId,
    };

    // Fetch active diet plan
    if (dietPlanModel) {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const activePlan = await dietPlanModel
          .findOne({
            userId,
            status: 'active',
            endDate: { $gte: today },
            startDate: { $lte: tomorrow },
          })
          .exec();

        const anyActivePlan =
          activePlan ||
          (await dietPlanModel
            .findOne({
              userId,
              status: 'active',
            })
            .exec());

        if (anyActivePlan) {
          state.dietPlan = {
            name: anyActivePlan.name,
            dailyMacroTargets: anyActivePlan.dailyMacroTargets,
            goals: anyActivePlan.goals,
            dietaryRestrictions: anyActivePlan.dietaryRestrictions,
            allergies: anyActivePlan.allergies,
          };

          // Extract profile from diet plan
          state.profile = {
            allergies: anyActivePlan.allergies,
            dietaryRestrictions: anyActivePlan.dietaryRestrictions,
          };

          // Fetch today's consumption
          if (foodLogModel) {
            try {
              const todayLog = await foodLogModel
                .findOne({
                  userId,
                  date: today,
                })
                .exec();

              if (todayLog?.dailySummary) {
                state.todayConsumption = {
                  calories: todayLog.dailySummary.totalCalories,
                  protein: todayLog.dailySummary.totalProtein,
                  carbs: todayLog.dailySummary.totalCarbs,
                  fat: todayLog.dailySummary.totalFat,
                  fiber: todayLog.dailySummary.totalFiber,
                  mealsLogged: todayLog.dailySummary.mealsLogged,
                };
              }
            } catch (error) {
              this.logger.debug('Could not fetch today\'s food log', error);
            }
          }

          // Calculate rolling window stats (deterministic)
          if (foodLogModel) {
            try {
              const windowDays = this.configService.rollingWindowDays;
              const today = new Date();
              today.setHours(23, 59, 59, 999);
              const windowStart = new Date(today);
              windowStart.setDate(windowStart.getDate() - (windowDays - 1));
              windowStart.setHours(0, 0, 0, 0);

              const windowLogs = await foodLogModel
                .find({
                  userId,
                  date: { $gte: windowStart, $lte: today },
                })
                .sort({ date: 1 })
                .exec();

              if (windowLogs.length > 0) {
                const stats = this.calculateRollingStats(
                  windowLogs,
                  anyActivePlan.dailyMacroTargets,
                  windowDays,
                );
                state.rollingWindowStats = stats;
              }
            } catch (error) {
              this.logger.debug('Could not calculate rolling window stats', error);
            }
          }
        }
      } catch (error) {
        this.logger.debug('Could not fetch diet plan', error);
      }
    }

    return state;
  }

  /**
   * Build conversation context - tiered approach
   * - Recent messages (last N): Full detail, no summarization
   * - Older messages: Summarized if available
   */
  private async buildConversationContext (
    convId: string | undefined,
    messageModel?: Model<MessageDocument>,
    conversationModel?: Model<any>,
  ): Promise<ConversationContext> {
    const recentMessageCount = this.configService.conversationRecentMessages;

    if (!convId || !messageModel) {
      return {
        recentMessages: [],
      };
    }

    try {
      // Fetch last N messages (full detail)
      const messages = await messageModel
        .find({ convId })
        .sort({ createdAt: -1 })
        .limit(recentMessageCount)
        .exec();

      // Reverse to get chronological order (oldest first)
      messages.reverse();

      const context: ConversationContext = {
        recentMessages: messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          text: msg.text,
          intent: msg.intent,
          createdAt: msg.createdAt,
        })),
      };

      // Fetch conversation summaries if available
      if (conversationModel) {
        try {
          const conversation = await conversationModel.findById(convId).exec();
          if (conversation?.summaries) {
            context.summary = this.buildSummaryText(conversation.summaries);
          }
        } catch (error) {
          this.logger.debug('Could not fetch conversation summaries', error);
        }
      }

      return context;
    } catch (error) {
      this.logger.debug('Could not fetch conversation context', error);
      return {
        recentMessages: [],
      };
    }
  }

  /**
   * Build summary text from conversation summaries
   */
  private buildSummaryText (summaries: any): string | undefined {
    const parts: string[] = [];

    if (summaries.longTerm) {
      parts.push(`Earlier conversation: ${summaries.longTerm.summary}`);
    }

    if (summaries.midTerm) {
      parts.push(`Recent context: ${summaries.midTerm.summary}`);
    }

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  /**
   * Calculate rolling window stats (deterministic calculation)
   */
  private calculateRollingStats (
    foodLogs: FoodLogDocument[],
    targets: DietPlanDocument['dailyMacroTargets'],
    windowDays: number,
  ): DeterministicState['rollingWindowStats'] {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalFiber = 0;
    let daysLogged = 0;

    foodLogs.forEach((log) => {
      if (log.dailySummary) {
        totalCalories += log.dailySummary.totalCalories;
        totalProtein += log.dailySummary.totalProtein;
        totalCarbs += log.dailySummary.totalCarbs;
        totalFat += log.dailySummary.totalFat;
        totalFiber += log.dailySummary.totalFiber;
        daysLogged++;
      }
    });

    const avgCalories = daysLogged > 0 ? totalCalories / daysLogged : 0;
    const avgProtein = daysLogged > 0 ? totalProtein / daysLogged : 0;
    const avgCarbs = daysLogged > 0 ? totalCarbs / daysLogged : 0;
    const avgFat = daysLogged > 0 ? totalFat / daysLogged : 0;
    const avgFiber = daysLogged > 0 ? totalFiber / daysLogged : 0;

    // Calculate trend (comparing first half vs second half)
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (foodLogs.length >= 4) {
      const midPoint = Math.floor(foodLogs.length / 2);
      const firstHalf = foodLogs.slice(0, midPoint);
      const secondHalf = foodLogs.slice(midPoint);

      let firstHalfAvg = 0;
      let secondHalfAvg = 0;

      firstHalf.forEach((log) => {
        if (log.dailySummary) {
          firstHalfAvg += log.dailySummary.totalCalories;
        }
      });
      firstHalfAvg /= firstHalf.length;

      secondHalf.forEach((log) => {
        if (log.dailySummary) {
          secondHalfAvg += log.dailySummary.totalCalories;
        }
      });
      secondHalfAvg /= secondHalf.length;

      const diff = secondHalfAvg - firstHalfAvg;
      if (Math.abs(diff) < 50) {
        trend = 'stable';
      } else if (diff < 0) {
        trend = 'improving';
      } else {
        trend = 'declining';
      }
    }

    return {
      windowDays,
      daysLogged,
      averages: {
        calories: Math.round(avgCalories),
        protein: Math.round(avgProtein),
        carbs: Math.round(avgCarbs),
        fat: Math.round(avgFat),
        fiber: Math.round(avgFiber),
      },
      trend,
    };
  }

  /**
   * Format deterministic state for LLM prompt
   */
  formatDeterministicState (state: DeterministicState): string {
    let formatted = '';

    // Profile
    if (state.profile) {
      if (state.profile.allergies?.length) {
        formatted += `**User Allergies:** ${state.profile.allergies.join(', ')}\n`;
      }
      if (state.profile.dietaryRestrictions?.length) {
        formatted += `**Dietary Restrictions:** ${state.profile.dietaryRestrictions.join(', ')}\n`;
      }
    }

    // Diet plan
    if (state.dietPlan) {
      const targets = state.dietPlan.dailyMacroTargets;
      formatted += `\n**Active Diet Plan:** ${state.dietPlan.name}\n`;
      formatted += `**Daily Targets:** ${targets.calories} cal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat, ${targets.fiber}g fiber\n`;

      if (state.dietPlan.goals?.length) {
        formatted += `**Goals:** ${state.dietPlan.goals.join(', ')}\n`;
      }
    }

    // Today's consumption
    if (state.todayConsumption) {
      const consumed = state.todayConsumption;
      formatted += `\n**Today's Consumption:** ${consumed.calories} cal, ${consumed.protein}g protein, ${consumed.carbs}g carbs, ${consumed.fat}g fat, ${consumed.fiber}g fiber (${consumed.mealsLogged} meals)\n`;

      if (state.dietPlan) {
        const targets = state.dietPlan.dailyMacroTargets;
        const remaining = this.foodLogService.calculateRemainingMacros(targets, {
          totalCalories: consumed.calories,
          totalProtein: consumed.protein,
          totalCarbs: consumed.carbs,
          totalFat: consumed.fat,
          totalFiber: consumed.fiber,
        });
        formatted += `**Remaining Today:** ${remaining.calories} cal, ${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat, ${remaining.fiber}g fiber\n`;
      }
    }

    // Rolling window stats
    if (state.rollingWindowStats) {
      const stats = state.rollingWindowStats;
      formatted += `\n**Last ${stats.windowDays} Days Average:** ${stats.averages.calories} cal, ${stats.averages.protein}g protein, ${stats.averages.carbs}g carbs, ${stats.averages.fat}g fat, ${stats.averages.fiber}g fiber\n`;
      formatted += `**Trend:** ${stats.trend}\n`;
    }

    return formatted;
  }

  /**
   * Format conversation context for LLM prompt
   */
  formatConversationContext (context: ConversationContext): string {
    let formatted = '';

    // Include summary of older messages if available
    if (context.summary) {
      formatted += '\n**Conversation Summary (Older Messages):**\n';
      formatted += context.summary + '\n';
    }

    // Include recent messages in full
    if (context.recentMessages.length > 0) {
      formatted += '\n**Recent Conversation:**\n';
      context.recentMessages.forEach((msg) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        formatted += `${role}: ${msg.text}\n`;
      });
      formatted += '\n';
    }

    return formatted;
  }

  /**
   * Update conversation summaries when threshold is exceeded
   * Generates tiered summaries: mid-term (messages 4-20) + long-term (1-3)
   */
  async updateConversationSummaries (
    convId: string,
    totalMessages: number,
    messageModel: Model<MessageDocument>,
    conversationModel: Model<any>,
  ): Promise<void> {
    try {
      const conversation = await conversationModel.findById(convId).exec();
      if (!conversation) {
        this.logger.debug(`Conversation ${convId} not found for summarization`);
        return;
      }

      const summarizeAfter = this.configService.conversationSummarizeAfter;
      const recentCount = this.configService.conversationRecentMessages;

      // Only summarize if we have enough messages
      if (totalMessages <= summarizeAfter) {
        this.logger.debug(`Conversation has ${totalMessages} messages, threshold is ${summarizeAfter}`);
        return;
      }

      // Check if we need to regenerate summaries
      const lastSummarized = conversation.lastSummarizedMessageIndex || 0;
      const newMessagesSinceLastSummary = totalMessages - lastSummarized;

      // Regenerate if we have 5+ new messages since last summary, or no summaries exist
      if (newMessagesSinceLastSummary < 5 && conversation.summaries) {
        this.logger.debug(`Summaries are fresh (${newMessagesSinceLastSummary} new messages)`);
        return;
      }

      this.logger.log(`Generating summaries for conversation ${convId} (${totalMessages} messages)`);

      // Fetch all messages except the last N (which we keep in full)
      const messagesToSummarize = await messageModel
        .find({ convId })
        .sort({ createdAt: 1 })
        .limit(totalMessages - recentCount)
        .exec();

      if (messagesToSummarize.length === 0) {
        this.logger.debug('No messages to summarize');
        return;
      }

      // Determine ranges for tiered summarization
      // Long-term: oldest messages (up to message index totalMessages - recentCount - 17)
      // Mid-term: messages in the middle (last 17 messages before recent window)
      const midTermSize = Math.min(17, messagesToSummarize.length);
      const longTermEnd = messagesToSummarize.length - midTermSize;

      const longTermMessages = messagesToSummarize.slice(0, longTermEnd);
      const midTermMessages = messagesToSummarize.slice(longTermEnd);

      const summaries: any = {};

      // Generate mid-term summary (messages closer to recent window)
      if (midTermMessages.length > 0) {
        this.logger.log(`Generating mid-term summary for ${midTermMessages.length} messages`);
        const midTermSummary = await this.conversationSummarizerService.summarizeConversationSegment(
          midTermMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            text: m.text,
            intent: m.intent,
            createdAt: m.createdAt,
          }))
        );

        summaries.midTerm = {
          summary: midTermSummary.summary,
          fromMessageIndex: longTermEnd,
          toMessageIndex: messagesToSummarize.length - 1,
          generatedAt: new Date(),
          keyTopics: midTermSummary.topics,
        };
      }

      // Generate long-term summary (oldest messages)
      if (longTermMessages.length > 0) {
        this.logger.log(`Generating long-term summary for ${longTermMessages.length} messages`);
        const longTermSummary = await this.conversationSummarizerService.summarizeConversationSegment(
          longTermMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            text: m.text,
            intent: m.intent,
            createdAt: m.createdAt,
          }))
        );

        summaries.longTerm = {
          summary: longTermSummary.summary,
          fromMessageIndex: 0,
          toMessageIndex: longTermEnd - 1,
          generatedAt: new Date(),
          keyTopics: longTermSummary.topics,
        };
      }

      // Store summaries in conversation
      conversation.summaries = summaries;
      conversation.lastSummarizedMessageIndex = totalMessages;
      conversation.messageCount = totalMessages;
      await conversation.save();

      this.logger.log(`Summaries updated for conversation ${convId}`);
    } catch (error) {
      this.logger.error(`Failed to update conversation summaries for ${convId}:`, error);
      // Don't throw - summarization is optional, conversation should continue
    }
  }
}
