import { Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { FoodLog, FoodLogDocument, FoodItem, DailySummary } from './schemas/food-log.schema';
import { DietPlan, DietPlanDocument } from './schemas/diet-plan.schema';

export interface AddFoodToLogResult {
  success: boolean;
  foodLog?: FoodLogDocument;
  dailySummary?: DailySummary;
  error?: string;
}

export interface ProgressCalculation {
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
}

export interface RemainingMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

@Injectable()
export class FoodLogService {
  private readonly logger = new Logger(FoodLogService.name);

  /**
   * Calculate daily summary from food items
   */
  calculateDailySummary(foods: FoodItem[]): DailySummary {
    const summary: DailySummary = {
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      totalFiber: 0,
      mealsLogged: foods.length,
    };

    for (const food of foods) {
      if (food.macros) {
        summary.totalCalories += food.macros.calories || 0;
        summary.totalProtein += food.macros.protein || 0;
        summary.totalCarbs += food.macros.carbs || 0;
        summary.totalFat += food.macros.fat || 0;
        summary.totalFiber += food.macros.fiber || 0;
      }
    }

    return summary;
  }

  /**
   * Calculate remaining macros (shared utility)
   */
  calculateRemainingMacros(
    targets: { calories: number; protein: number; carbs: number; fat: number; fiber: number },
    consumed: { totalCalories: number; totalProtein: number; totalCarbs: number; totalFat: number; totalFiber: number },
  ): RemainingMacros {
    return {
      calories: Math.max(0, targets.calories - consumed.totalCalories),
      protein: Math.max(0, targets.protein - consumed.totalProtein),
      carbs: Math.max(0, targets.carbs - consumed.totalCarbs),
      fat: Math.max(0, targets.fat - consumed.totalFat),
      fiber: Math.max(0, targets.fiber - consumed.totalFiber),
    };
  }

  /**
   * Add a food item to the food log for a specific date
   * Creates the log if it doesn't exist, updates if it does
   */
  async addFoodToLog(
    userId: string,
    foodItem: FoodItem,
    date: Date,
    dietPlanId?: string,
    foodLogModel?: Model<FoodLogDocument>,
  ): Promise<AddFoodToLogResult> {
    if (!foodLogModel) {
      return {
        success: false,
        error: 'Food log model not available',
      };
    }

    try {
      const logDate = new Date(date);
      logDate.setHours(0, 0, 0, 0);

      // Find or create food log for this date
      let foodLog = await foodLogModel
        .findOne({
          userId,
          date: logDate,
        })
        .exec();

      if (!foodLog) {
        // Create new food log
        foodLog = await foodLogModel.create({
          userId,
          dietPlanId: dietPlanId ? (dietPlanId as any) : undefined,
          date: logDate,
          foods: [foodItem],
          waterIntake: 0,
        });
        this.logger.log(`Created new food log for user ${userId} on ${logDate.toISOString()}`);
      } else {
        // Add to existing log
        foodLog.foods.push(foodItem);
        await foodLog.save();
        this.logger.log(`Added food to existing log for user ${userId} on ${logDate.toISOString()}`);
      }

      // Recalculate daily summary
      const dailySummary = this.calculateDailySummary(foodLog.foods);
      foodLog.dailySummary = dailySummary;
      await foodLog.save();

      return {
        success: true,
        foodLog,
        dailySummary,
      };
    } catch (error) {
      this.logger.error('Failed to add food to log:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Calculate progress against diet plan targets
   */
  async calculateProgress(
    userId: string,
    dailySummary: DailySummary,
    dietPlanModel?: Model<DietPlanDocument>,
  ): Promise<ProgressCalculation | null> {
    if (!dietPlanModel) {
      return null;
    }

    try {
      const dietPlan = await dietPlanModel
        .findOne({
          userId,
          status: 'active',
        })
        .exec();

      if (!dietPlan) {
        return null;
      }

      const targets = dietPlan.dailyMacroTargets;
      const consumed = dailySummary;

      const remaining = this.calculateRemainingMacros(targets, consumed);

      return {
        caloriesProgress: Math.round((consumed.totalCalories / targets.calories) * 100),
        proteinProgress: Math.round((consumed.totalProtein / targets.protein) * 100),
        carbsProgress: Math.round((consumed.totalCarbs / targets.carbs) * 100),
        fatProgress: Math.round((consumed.totalFat / targets.fat) * 100),
        fiberProgress: Math.round((consumed.totalFiber / targets.fiber) * 100),
        remaining,
      };
    } catch (error) {
      this.logger.error('Failed to calculate progress:', error);
      return null;
    }
  }
}
