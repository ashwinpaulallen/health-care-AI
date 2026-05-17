import { Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { FoodLog, FoodLogDocument, FoodItem, DailySummary } from '../diet/schemas/food-log.schema';
import { DietPlan, DietPlanDocument } from '../diet/schemas/diet-plan.schema';
import { RetrieverService } from '../rag/retriever.service';
import { LlmChatService } from './llm.chat.service';
import { FoodLogService } from '../diet/food-log.service';

export interface FoodNutritionInfo {
  name: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  servingSize?: string;
  description?: string;
}

export interface ExtractedFoodInfo {
  foodName: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  quantity?: string;
  confidence: number;
}

export interface ExtractedFoodItems {
  items: ExtractedFoodInfo[];
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'; // Overall meal type if not specified per item
}

export interface FoodLoggingResult {
  success: boolean;
  foodLog?: {
    id: string;
    date: Date;
    dailySummary?: DailySummary;
  };
  progress?: {
    caloriesProgress: number;
    proteinProgress: number;
    carbsProgress: number;
    fatProgress: number;
    fiberProgress: number;
    remaining: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
    };
  };
  message?: string;
  error?: string;
}

@Injectable()
export class FoodTrackingService {
  private readonly logger = new Logger(FoodTrackingService.name);

  constructor(
    private readonly retrieverService: RetrieverService,
    private readonly llmService: LlmChatService,
    private readonly foodLogService: FoodLogService,
  ) {}

  /**
   * Extract food information from user message
   * Detects: food name, meal type, quantity
   * Supports multiple food items in a single message
   */
  async extractFoodInfo(userMessage: string): Promise<ExtractedFoodInfo | null> {
    // Use the new multi-item extraction method
    const result = await this.extractMultipleFoodItems(userMessage);
    if (!result || result.items.length === 0) {
      return null;
    }
    // Return first item for backward compatibility
    return {
      ...result.items[0],
      mealType: result.items[0].mealType || result.mealType,
    };
  }

  /**
   * Extract multiple food items from user message
   * Detects: food names, meal type, quantities for each item
   */
  async extractMultipleFoodItems(userMessage: string): Promise<ExtractedFoodItems | null> {
    this.logger.log(`Extracting food items from: "${userMessage}"`);

    const systemPrompt = `You are a food information extractor. Extract ALL food items from user messages.

User messages may contain multiple food items, for example:
- "I had half plate mutton biryani, sweet lassi and 3 piece chicken 65"
- "I'm eating roti, dal, and rice for lunch"
- "Just ate 2 samosas and a cup of tea"

Extract ALL food items mentioned. For each item, extract:
1. Food name (the actual food item)
2. Quantity (if mentioned, e.g., "half plate", "3 piece", "2 rotis", "1 cup", "100g")
3. Meal type: breakfast, lunch, dinner, or snack (if mentioned, otherwise infer from context)

If meal type is not mentioned for individual items, infer from context or time of day, or default to "snack".

Respond with ONLY valid JSON:
{
  "items": [
    {
      "foodName": "extracted food name",
      "mealType": "breakfast|lunch|dinner|snack",
      "quantity": "quantity if mentioned, else null",
      "confidence": 0.0-1.0
    }
  ],
  "mealType": "overall meal type if specified for the entire meal"
}

IMPORTANT: Extract ALL food items mentioned in the message. Do not skip any items.`;

    try {
      const result = await this.llmService.chatJSON<ExtractedFoodItems>(
        systemPrompt,
        userMessage,
        JSON.stringify({
          items: [
            {
              foodName: 'string',
              mealType: 'breakfast|lunch|dinner|snack',
              quantity: 'string or null',
              confidence: 'number 0.0-1.0',
            },
          ],
          mealType: 'breakfast|lunch|dinner|snack',
        }),
      );

      if (!result || !result.items || result.items.length === 0) {
        this.logger.warn(`No food items extracted from message`);
        return null;
      }

      // Filter out low confidence items
      const validItems = result.items.filter(
        (item) => item.foodName && item.confidence >= 0.5,
      );

      if (validItems.length === 0) {
        this.logger.warn(`No valid food items extracted (all below confidence threshold)`);
        return null;
      }

      // Use overall meal type if individual items don't have one
      const overallMealType = result.mealType || validItems[0]?.mealType || 'snack';
      validItems.forEach((item) => {
        if (!item.mealType) {
          item.mealType = overallMealType;
        }
      });

      this.logger.log(
        `Extracted ${validItems.length} food item(s): ${validItems.map((i) => i.foodName).join(', ')} for ${overallMealType}`,
      );

      return {
        items: validItems,
        mealType: overallMealType,
      };
    } catch (error) {
      this.logger.error('Failed to extract food items:', error);
      return null;
    }
  }

  /**
   * Lookup nutrition information for a food item
   */
  async lookupNutrition(foodName: string, quantity?: string): Promise<FoodNutritionInfo | null> {
    this.logger.log(`Looking up nutrition for: ${foodName}${quantity ? `, quantity: ${quantity}` : ''}`);

    try {
      // Search food knowledge base
      const chunks = await this.retrieverService.retrieve(foodName, 'food', 3);

      if (chunks.length === 0) {
        this.logger.warn(`No nutrition info found for: ${foodName}`);
        return null;
      }

      // Use LLM to extract structured nutritional information
      const foodContext = chunks.map((c) => c.text).join('\n\n');

      const systemPrompt = `You are a nutrition data extractor. Extract nutritional information for the food item "${foodName}" from the provided context.

Context:
${foodContext}

Extract and return nutritional information in JSON format. If specific values aren't available, estimate based on similar foods or use reasonable defaults.

Return format:
{
  "name": "food name",
  "calories": number (per 100g or per typical serving),
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams),
  "fiber": number (grams),
  "servingSize": "typical serving size description",
  "description": "brief description"
}

${quantity ? `The user mentioned quantity: "${quantity}". Adjust the nutrition values accordingly if possible, or note the serving size.` : ''}`;

      const response = await this.llmService.chatJSON<FoodNutritionInfo>(
        systemPrompt,
        `Extract nutritional information for "${foodName}"${quantity ? ` with quantity "${quantity}"` : ''}`,
        JSON.stringify({
          name: 'string',
          calories: 'number',
          protein: 'number',
          carbs: 'number',
          fat: 'number',
          fiber: 'number',
          servingSize: 'string',
          description: 'string',
        }),
      );

      if (!response || !response.name) {
        this.logger.warn(`Failed to extract nutrition info for: ${foodName}`);
        return null;
      }

      // Ensure name matches
      response.name = response.name || foodName;

      this.logger.log(
        `Nutrition found: ${response.name} - ${response.calories || 0} cal, ${response.protein || 0}g protein`,
      );

      return response;
    } catch (error) {
      this.logger.error('Failed to lookup nutrition:', error);
      return null;
    }
  }

  /**
   * Log multiple food items to food log and calculate progress
   */
  async logMultipleFoods(
    userId: string,
    items: Array<{ foodInfo: ExtractedFoodInfo; nutrition: FoodNutritionInfo }>,
    dietPlanModel?: Model<DietPlanDocument>,
    foodLogModel?: Model<FoodLogDocument>,
  ): Promise<FoodLoggingResult> {
    this.logger.log(`Logging ${items.length} food item(s)`);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Log all items sequentially
      let lastFoodLog: FoodLogDocument | null = null;
      let lastDailySummary: DailySummary | null = null;

      for (const { foodInfo, nutrition } of items) {
        const foodItem: FoodItem = {
          name: nutrition.name,
          quantity: foodInfo.quantity || nutrition.servingSize || '1 serving',
          mealType: foodInfo.mealType,
          macros: {
            calories: nutrition.calories || 0,
            protein: nutrition.protein || 0,
            carbs: nutrition.carbs || 0,
            fat: nutrition.fat || 0,
            fiber: nutrition.fiber || 0,
          },
        };

        const addResult = await this.foodLogService.addFoodToLog(
          userId,
          foodItem,
          today,
          undefined, // dietPlanId - will be set automatically if needed
          foodLogModel,
        );

        if (!addResult.success || !addResult.foodLog || !addResult.dailySummary) {
          this.logger.error(`Failed to log food item: ${foodInfo.foodName}`);
          continue; // Continue with other items even if one fails
        }

        lastFoodLog = addResult.foodLog;
        lastDailySummary = addResult.dailySummary;
        this.logger.log(`Logged: ${foodInfo.foodName}`);
      }

      if (!lastFoodLog || !lastDailySummary) {
        return {
          success: false,
          error: 'Failed to log any food items',
        };
      }

      // Calculate progress using the final daily summary
      const progress = await this.foodLogService.calculateProgress(
        userId,
        lastDailySummary,
        dietPlanModel,
      );

      const loggedItems = items.map((i) => i.foodInfo.foodName).join(', ');
      this.logger.log(
        `All food items logged: ${loggedItems} - Daily total: ${lastDailySummary.totalCalories} cal, ${lastDailySummary.totalProtein}g protein`,
      );

      return {
        success: true,
        foodLog: {
          id: (lastFoodLog._id as any).toString(),
          date: lastFoodLog.date,
          dailySummary: lastDailySummary,
        },
        progress: progress || undefined,
      };
    } catch (error) {
      this.logger.error('Failed to log multiple foods:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Log food to food log and calculate progress
   */
  async logFood(
    userId: string,
    foodInfo: ExtractedFoodInfo,
    nutrition: FoodNutritionInfo,
    dietPlanModel?: Model<DietPlanDocument>,
    foodLogModel?: Model<FoodLogDocument>,
  ): Promise<FoodLoggingResult> {
    this.logger.log(`Logging food: ${foodInfo.foodName} for ${foodInfo.mealType}`);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Prepare food item
      const foodItem: FoodItem = {
        name: nutrition.name,
        quantity: foodInfo.quantity || nutrition.servingSize || '1 serving',
        mealType: foodInfo.mealType,
        macros: {
          calories: nutrition.calories || 0,
          protein: nutrition.protein || 0,
          carbs: nutrition.carbs || 0,
          fat: nutrition.fat || 0,
          fiber: nutrition.fiber || 0,
        },
      };

      // Use shared service to add food to log
      const addResult = await this.foodLogService.addFoodToLog(
        userId,
        foodItem,
        today,
        undefined, // dietPlanId - will be set automatically if needed
        foodLogModel,
      );

      if (!addResult.success || !addResult.foodLog || !addResult.dailySummary) {
        return {
          success: false,
          error: addResult.error || 'Failed to add food to log',
        };
      }

      // Calculate progress using shared service
      const progress = await this.foodLogService.calculateProgress(
        userId,
        addResult.dailySummary,
        dietPlanModel,
      );

      this.logger.log(
        `Food logged: ${foodInfo.foodName} - Daily total: ${addResult.dailySummary.totalCalories} cal, ${addResult.dailySummary.totalProtein}g protein`,
      );

      return {
        success: true,
        foodLog: {
          id: (addResult.foodLog._id as any).toString(),
          date: addResult.foodLog.date,
          dailySummary: addResult.dailySummary,
        },
        progress: progress || undefined,
      };
    } catch (error) {
      this.logger.error('Failed to log food:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate progress feedback message
   */
  async generateProgressFeedback(
    foodInfo: ExtractedFoodInfo,
    nutrition: FoodNutritionInfo,
    progress?: FoodLoggingResult['progress'],
    dietPlan?: DietPlanDocument,
  ): Promise<string> {
    let feedback = `✅ Logged ${nutrition.name} for ${foodInfo.mealType}!\n\n`;

    if (nutrition.calories) {
      feedback += `**Nutrition:** ${nutrition.calories} cal, ${nutrition.protein || 0}g protein, ${nutrition.carbs || 0}g carbs, ${nutrition.fat || 0}g fat, ${nutrition.fiber || 0}g fiber\n\n`;
    }

    if (progress && dietPlan) {
      const targets = dietPlan.dailyMacroTargets;
      feedback += `**Today's Progress:**\n`;
      feedback += `- Calories: ${progress.caloriesProgress}% (${progress.remaining.calories} remaining)\n`;
      feedback += `- Protein: ${progress.proteinProgress}% (${progress.remaining.protein}g remaining)\n`;
      feedback += `- Carbs: ${progress.carbsProgress}% (${progress.remaining.carbs}g remaining)\n`;
      feedback += `- Fat: ${progress.fatProgress}% (${progress.remaining.fat}g remaining)\n`;
      feedback += `- Fiber: ${progress.fiberProgress}% (${progress.remaining.fiber}g remaining)\n\n`;

      // Add encouragement or warnings
      if (progress.caloriesProgress > 100) {
        feedback += `⚠️ You've exceeded your daily calorie target. Consider lighter meals for the rest of the day.\n`;
      } else if (progress.caloriesProgress >= 80) {
        feedback += `Great progress! You're close to your daily targets.\n`;
      } else if (progress.caloriesProgress < 50) {
        feedback += `You're doing well! You have plenty of room for more meals today.\n`;
      }

      if (progress.proteinProgress < 50) {
        feedback += `💡 Tip: Consider adding more protein-rich foods to meet your target.\n`;
      }
    } else if (!dietPlan) {
      feedback += `💡 Create a diet plan to track your progress and get personalized recommendations!\n`;
    }

    return feedback;
  }
}

