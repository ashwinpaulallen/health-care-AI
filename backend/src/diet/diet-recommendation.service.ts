import { Injectable, Logger } from '@nestjs/common';
import { DietPlan } from './schemas/diet-plan.schema';
import { FoodLog } from './schemas/food-log.schema';
import { LlmChatService } from '../agent/llm.chat.service';
import { RetrieverService } from '../rag/retriever.service';
import { FoodLogService } from './food-log.service';

export interface DietRecommendation {
  summary: string;
  remainingMacros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  suggestions: {
    breakfast?: string[];
    lunch?: string[];
    dinner?: string[];
    snacks?: string[];
  };
  warnings?: string[];
  tips?: string[];
  motivationalMessage?: string;
}

@Injectable()
export class DietRecommendationService {
  private readonly logger = new Logger(DietRecommendationService.name);

  constructor(
    private readonly llmService: LlmChatService,
    private readonly retrieverService: RetrieverService,
    private readonly foodLogService: FoodLogService,
  ) {}

  /**
   * Generate AI-powered recommendations based on diet plan and current intake
   */
  async generateRecommendations(
    dietPlan: DietPlan,
    foodLog: FoodLog | null,
    date: Date,
  ): Promise<DietRecommendation> {
    this.logger.log('Generating diet recommendations');

    try {
      // Calculate remaining macros
      const targets = dietPlan.dailyMacroTargets;
      const consumed = foodLog?.dailySummary || {
        totalCalories: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        totalFiber: 0,
        mealsLogged: 0,
      };

      const remaining = this.foodLogService.calculateRemainingMacros(targets, consumed);

      // Determine which meals are left
      const currentHour = new Date().getHours();
      const mealsEaten = foodLog?.foods.map(f => f.mealType) || [];
      const mealsRemaining = this.determineMealsRemaining(currentHour, mealsEaten);

      // Get food suggestions from RAG
      const foodContext = await this.getFoodContext(remaining, dietPlan);

      // Generate AI recommendations
      const aiRecommendations = await this.generateAIRecommendations(
        dietPlan,
        consumed,
        remaining,
        mealsRemaining,
        foodContext,
        foodLog,
      );

      return {
        summary: aiRecommendations.summary,
        remainingMacros: remaining,
        suggestions: aiRecommendations.suggestions,
        warnings: aiRecommendations.warnings,
        tips: aiRecommendations.tips,
        motivationalMessage: aiRecommendations.motivationalMessage,
      };
    } catch (error) {
      this.logger.error('Failed to generate recommendations:', error);
      
      // Return basic recommendations as fallback
      return this.generateBasicRecommendations(dietPlan, foodLog);
    }
  }

  /**
   * Get relevant food context from RAG
   */
  private async getFoodContext(remaining: any, dietPlan: DietPlan): Promise<string> {
    try {
      // Build query for food retrieval
      const goals = dietPlan.goals?.join(', ') || 'balanced nutrition';
      const restrictions = dietPlan.dietaryRestrictions?.join(', ') || 'none';
      
      const query = `Foods high in protein (${remaining.protein}g needed) and fiber (${remaining.fiber}g needed), 
        suitable for ${goals}, with ${restrictions} dietary restrictions. 
        Total calories needed: ${remaining.calories}`;

      const chunks = await this.retrieverService.retrieve(query, 'food', 5);

      if (chunks.length === 0) {
        return 'General healthy food recommendations';
      }

      return chunks.map(c => c.text).join('\n\n');
    } catch (error) {
      this.logger.error('Failed to retrieve food context:', error);
      return 'General healthy food recommendations';
    }
  }

  /**
   * Generate AI recommendations using LLM
   */
  private async generateAIRecommendations(
    dietPlan: DietPlan,
    consumed: any,
    remaining: any,
    mealsRemaining: string[],
    foodContext: string,
    foodLog: FoodLog | null,
  ): Promise<any> {
    const systemPrompt = `You are a nutrition AI assistant helping users follow their diet plan.

**User's Diet Plan:**
- Goals: ${dietPlan.goals?.join(', ') || 'balanced nutrition'}
- Dietary Restrictions: ${dietPlan.dietaryRestrictions?.join(', ') || 'none'}
- Allergies: ${dietPlan.allergies?.join(', ') || 'none'}

**Daily Targets:**
- Calories: ${dietPlan.dailyMacroTargets.calories} kcal
- Protein: ${dietPlan.dailyMacroTargets.protein}g
- Carbs: ${dietPlan.dailyMacroTargets.carbs}g
- Fat: ${dietPlan.dailyMacroTargets.fat}g
- Fiber: ${dietPlan.dailyMacroTargets.fiber}g

**Today's Consumption:**
- Calories: ${consumed.totalCalories} kcal
- Protein: ${consumed.totalProtein}g
- Carbs: ${consumed.totalCarbs}g
- Fat: ${consumed.totalFat}g
- Fiber: ${consumed.totalFiber}g
- Meals logged: ${consumed.mealsLogged}

**Remaining for Today:**
- Calories: ${remaining.calories} kcal
- Protein: ${remaining.protein}g
- Carbs: ${remaining.carbs}g
- Fat: ${remaining.fat}g
- Fiber: ${remaining.fiber}g

**Meals Remaining:** ${mealsRemaining.join(', ')}

${foodLog?.symptoms?.length ? `**Reported Symptoms:** ${foodLog.symptoms.join(', ')}` : ''}
${foodLog?.energyLevel ? `**Energy Level:** ${foodLog.energyLevel}/5` : ''}

**Food Knowledge Base:**
${foodContext}

Provide personalized recommendations in JSON format with these fields:
- summary: Brief overview of progress (2-3 sentences)
- suggestions: Object with arrays for each meal type (breakfast, lunch, dinner, snacks) - only include meals remaining
- warnings: Array of any concerns (e.g., too much/little of a nutrient, symptoms to watch)
- tips: Array of 2-3 practical tips
- motivationalMessage: Encouraging message (1 sentence)

Keep suggestions specific, actionable, and culturally appropriate (Indian diet context).`;

    const userQuery = `Based on my current intake, what should I eat for the remaining meals today?`;

    try {
      const response = await this.llmService.chatJSON<any>(
        systemPrompt,
        userQuery,
        `{
          "summary": "string",
          "suggestions": {
            "breakfast": ["string"],
            "lunch": ["string"],
            "dinner": ["string"],
            "snacks": ["string"]
          },
          "warnings": ["string"],
          "tips": ["string"],
          "motivationalMessage": "string"
        }`,
      );

      return response || this.getDefaultRecommendations(mealsRemaining);
    } catch (error) {
      this.logger.error('LLM recommendation failed:', error);
      return this.getDefaultRecommendations(mealsRemaining);
    }
  }

  /**
   * Determine which meals are remaining based on time and logged meals
   */
  private determineMealsRemaining(currentHour: number, mealsEaten: string[]): string[] {
    const allMeals = ['breakfast', 'lunch', 'dinner', 'snacks'];
    const remaining: string[] = [];

    // Breakfast: before 11 AM
    if (currentHour < 11 && !mealsEaten.includes('breakfast')) {
      remaining.push('breakfast');
    }

    // Lunch: before 4 PM
    if (currentHour < 16 && !mealsEaten.includes('lunch')) {
      remaining.push('lunch');
    }

    // Dinner: before 10 PM
    if (currentHour < 22 && !mealsEaten.includes('dinner')) {
      remaining.push('dinner');
    }

    // Snacks: anytime
    if (!mealsEaten.includes('snacks') || mealsEaten.filter(m => m === 'snacks').length < 2) {
      remaining.push('snacks');
    }

    return remaining.length > 0 ? remaining : ['snacks'];
  }

  /**
   * Generate basic recommendations without AI
   */
  private generateBasicRecommendations(
    dietPlan: DietPlan,
    foodLog: FoodLog | null,
  ): DietRecommendation {
    const targets = dietPlan.dailyMacroTargets;
    const consumed = foodLog?.dailySummary || {
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      totalFiber: 0,
      mealsLogged: 0,
    };

      const remaining = this.foodLogService.calculateRemainingMacros(targets, consumed);

    const percentConsumed = Math.round((consumed.totalCalories / targets.calories) * 100);

    return {
      summary: `You've consumed ${consumed.totalCalories} out of ${targets.calories} calories (${percentConsumed}%). ${remaining.calories > 0 ? `You have ${remaining.calories} calories remaining for today.` : 'You\'ve met your calorie goal!'}`,
      remainingMacros: remaining,
      suggestions: {
        snacks: [
          'Mixed nuts (almonds, walnuts)',
          'Greek yogurt with berries',
          'Vegetable sticks with hummus',
        ],
      },
      tips: [
        'Stay hydrated - aim for 8-10 glasses of water',
        'Include protein in every meal',
        'Choose whole grains over refined carbs',
      ],
      motivationalMessage: 'Keep up the great work! Consistency is key to reaching your goals.',
    };
  }

  /**
   * Get default recommendations structure
   */
  private getDefaultRecommendations(mealsRemaining: string[]): any {
    const suggestions: any = {};

    if (mealsRemaining.includes('breakfast')) {
      suggestions.breakfast = [
        'Oats with nuts and fruits',
        'Vegetable poha with peanuts',
        'Whole wheat toast with eggs',
      ];
    }

    if (mealsRemaining.includes('lunch')) {
      suggestions.lunch = [
        'Brown rice with dal and vegetables',
        'Roti with paneer curry and salad',
        'Quinoa pulao with raita',
      ];
    }

    if (mealsRemaining.includes('dinner')) {
      suggestions.dinner = [
        'Grilled chicken/paneer with vegetables',
        'Vegetable khichdi with yogurt',
        'Whole wheat roti with dal and sabzi',
      ];
    }

    if (mealsRemaining.includes('snacks')) {
      suggestions.snacks = [
        'Roasted chana',
        'Fruit with nuts',
        'Vegetable soup',
      ];
    }

    return {
      summary: 'Here are some healthy meal suggestions to meet your daily targets.',
      suggestions,
      warnings: [],
      tips: [
        'Balance your meals with protein, carbs, and healthy fats',
        'Include plenty of vegetables for fiber',
      ],
      motivationalMessage: 'You\'re doing great! Stay consistent with your plan.',
    };
  }
}

