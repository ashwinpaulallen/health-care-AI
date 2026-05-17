import { Controller, Get, Post, Put, Body, Param, Query, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FoodLog, FoodLogDocument, FoodItem, DailySummary } from './schemas/food-log.schema';
import { DietPlan, DietPlanDocument } from './schemas/diet-plan.schema';
import { DietRecommendationService } from './diet-recommendation.service';
import { FoodLogService } from './food-log.service';
import { ConfigService } from '../common/config/config.service';

export interface LogFoodDto {
  userId: string;
  dietPlanId?: string;
  date: string;  // ISO date string
  food: FoodItem;
}

export interface UpdateFoodLogDto {
  foods?: FoodItem[];
  waterIntake?: number;
  notes?: string;
  symptoms?: string[];
  energyLevel?: number;
  hungerLevel?: number;
}

@Controller('diet/logs')
export class FoodLogController {
  private readonly logger = new Logger(FoodLogController.name);

  constructor(
    @InjectModel(FoodLog.name) private foodLogModel: Model<FoodLogDocument>,
    @InjectModel(DietPlan.name) private dietPlanModel: Model<DietPlanDocument>,
    private readonly recommendationService: DietRecommendationService,
    private readonly foodLogService: FoodLogService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Log a food item
   */
  @Post()
  async logFood(@Body() dto: LogFoodDto) {
    this.logger.log(`Logging food for user: ${dto.userId}`);

    try {
      const logDate = new Date(dto.date);
      logDate.setHours(0, 0, 0, 0);

      // Use shared service to add food to log
      const result = await this.foodLogService.addFoodToLog(
        dto.userId,
        dto.food,
        logDate,
        dto.dietPlanId,
        this.foodLogModel,
      );

      if (!result.success) {
        return {
          success: false,
          message: 'Failed to log food',
          error: result.error,
        };
      }

      this.logger.log(`Food logged successfully for date: ${logDate.toISOString()}`);

      return {
        success: true,
        message: 'Food logged successfully',
        foodLog: {
          id: result.foodLog!._id,
          date: result.foodLog!.date,
          foods: result.foodLog!.foods,
          dailySummary: result.dailySummary,
        },
      };
    } catch (error) {
      this.logger.error('Failed to log food:', error);
      return {
        success: false,
        message: 'Failed to log food',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get food log for a specific date
   */
  @Get('user/:userId/date/:date')
  async getFoodLogByDate(
    @Param('userId') userId: string,
    @Param('date') date: string,
  ) {
    this.logger.log(`Fetching food log for user: ${userId}, date: ${date}`);

    try {
      const logDate = new Date(date);
      logDate.setHours(0, 0, 0, 0);

      const foodLog = await this.foodLogModel.findOne({
        userId,
        date: logDate,
      }).exec();

      if (!foodLog) {
        return {
          success: true,
          message: 'No food log found for this date',
          foodLog: null,
        };
      }

      return {
        success: true,
        foodLog: {
          id: foodLog._id,
          userId: foodLog.userId,
          dietPlanId: foodLog.dietPlanId,
          date: foodLog.date,
          foods: foodLog.foods,
          dailySummary: foodLog.dailySummary,
          waterIntake: foodLog.waterIntake,
          notes: foodLog.notes,
          symptoms: foodLog.symptoms,
          energyLevel: foodLog.energyLevel,
          hungerLevel: foodLog.hungerLevel,
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch food log:', error);
      return {
        success: false,
        message: 'Failed to fetch food log',
        error: error.message,
      };
    }
  }

  /**
   * Get food logs for a date range
   */
  @Get('user/:userId/range')
  async getFoodLogsByRange(
    @Param('userId') userId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    this.logger.log(`Fetching food logs for user: ${userId}, range: ${startDate} to ${endDate}`);

    try {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const foodLogs = await this.foodLogModel
        .find({
          userId,
          date: { $gte: start, $lte: end },
        })
        .sort({ date: -1 })
        .exec();

      return {
        success: true,
        foodLogs: foodLogs.map(log => ({
          id: log._id,
          date: log.date,
          dailySummary: log.dailySummary,
          mealsLogged: log.foods.length,
          waterIntake: log.waterIntake,
          energyLevel: log.energyLevel,
          symptoms: log.symptoms,
        })),
        total: foodLogs.length,
      };
    } catch (error) {
      this.logger.error('Failed to fetch food logs:', error);
      return {
        success: false,
        message: 'Failed to fetch food logs',
        error: error.message,
      };
    }
  }

  /**
   * Update food log (water intake, notes, symptoms, etc.)
   */
  @Put(':id')
  async updateFoodLog(@Param('id') id: string, @Body() dto: UpdateFoodLogDto) {
    this.logger.log(`Updating food log: ${id}`);

    try {
      const foodLog = await this.foodLogModel.findById(id).exec();

      if (!foodLog) {
        return {
          success: false,
          message: 'Food log not found',
        };
      }

      if (dto.foods) {
        foodLog.foods = dto.foods;
        foodLog.dailySummary = this.calculateDailySummary(dto.foods);
      }
      if (dto.waterIntake !== undefined) foodLog.waterIntake = dto.waterIntake;
      if (dto.notes) foodLog.notes = dto.notes;
      if (dto.symptoms) foodLog.symptoms = dto.symptoms;
      if (dto.energyLevel) foodLog.energyLevel = dto.energyLevel;
      if (dto.hungerLevel) foodLog.hungerLevel = dto.hungerLevel;

      await foodLog.save();

      this.logger.log(`Food log updated: ${id}`);

      return {
        success: true,
        message: 'Food log updated successfully',
        foodLog: {
          id: foodLog._id,
          dailySummary: foodLog.dailySummary,
        },
      };
    } catch (error) {
      this.logger.error('Failed to update food log:', error);
      return {
        success: false,
        message: 'Failed to update food log',
        error: error.message,
      };
    }
  }

  /**
   * Get AI recommendations based on current day's intake
   */
  @Get('user/:userId/recommendations')
  async getRecommendations(
    @Param('userId') userId: string,
    @Query('date') date?: string,
  ) {
    this.logger.log(`Getting recommendations for user: ${userId}`);

    try {
      const targetDate = date ? new Date(date) : new Date();
      targetDate.setHours(0, 0, 0, 0);
      
      // Also check tomorrow to catch plans starting today (timezone issues)
      const tomorrow = new Date(targetDate);
      tomorrow.setDate(tomorrow.getDate() + 1);

      this.logger.debug(`Getting recommendations: userId=${userId}, targetDate=${targetDate.toISOString()}`);

      // Get active diet plan - use lenient date filtering like getActiveDietPlan
      let dietPlan = await this.dietPlanModel.findOne({
        userId,
        status: 'active',
        endDate: { $gte: targetDate }, // Must not have ended
        startDate: { $lte: tomorrow }, // Can start today or in the past
      }).exec();

      // Fallback: if no plan found with date filter, try any active plan
      if (!dietPlan) {
        this.logger.debug('No active plan found with date filter, trying any active plan');
        dietPlan = await this.dietPlanModel.findOne({
          userId,
          status: 'active',
        }).exec();
      }

      if (!dietPlan) {
        this.logger.warn(`No active diet plan found for user: ${userId}`);
        return {
          success: false,
          message: 'No active diet plan found. Please create a diet plan first.',
        };
      }

      this.logger.debug(`Found active diet plan: ${dietPlan._id} for recommendations`);

      // Get today's food log
      const foodLog = await this.foodLogModel.findOne({
        userId,
        date: targetDate,
      }).exec();

      // Get recommendations from AI service
      const recommendations = await this.recommendationService.generateRecommendations(
        dietPlan,
        foodLog,
        targetDate,
      );

      return {
        success: true,
        recommendations,
      };
    } catch (error) {
      this.logger.error('Failed to get recommendations:', error);
      return {
        success: false,
        message: 'Failed to get recommendations',
        error: error.message,
      };
    }
  }

  /**
   * Get rolling window summary (last N days)
   */
  @Get('user/:userId/rolling-window')
  async getRollingWindowSummary(
    @Param('userId') userId: string,
    @Query('date') date?: string,
    @Query('days') days?: string,
  ) {
    const windowDays = days ? parseInt(days, 10) : this.configService.rollingWindowDays;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(23, 59, 59, 999);
    
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - (windowDays - 1));
    startDate.setHours(0, 0, 0, 0);

    this.logger.log(`Getting rolling window summary for user: ${userId}, days: ${windowDays}, from ${startDate.toISOString()} to ${targetDate.toISOString()}`);

    try {
      // Get active diet plan
      const dietPlan = await this.dietPlanModel.findOne({
        userId,
        status: 'active',
      }).exec();

      // Get food logs for the rolling window
      const foodLogs = await this.foodLogModel
        .find({
          userId,
          date: { $gte: startDate, $lte: targetDate },
        })
        .sort({ date: 1 })
        .exec();

      // Calculate rolling window statistics
      const rollingWindowStats = this.calculateRollingWindowStats(foodLogs, dietPlan, windowDays);

      return {
        success: true,
        rollingWindow: rollingWindowStats,
      };
    } catch (error) {
      this.logger.error('Failed to get rolling window summary:', error);
      return {
        success: false,
        message: 'Failed to get rolling window summary',
        error: error.message,
      };
    }
  }

  /**
   * Get progress summary for diet plan
   */
  @Get('user/:userId/progress/:dietPlanId')
  async getProgress(
    @Param('userId') userId: string,
    @Param('dietPlanId') dietPlanId: string,
  ) {
    this.logger.log(`Getting progress for diet plan: ${dietPlanId}`);

    try {
      const dietPlan = await this.dietPlanModel.findById(dietPlanId).exec();

      if (!dietPlan) {
        return {
          success: false,
          message: 'Diet plan not found',
        };
      }

      // Get all food logs for this diet plan
      const foodLogs = await this.foodLogModel
        .find({
          userId,
          dietPlanId,
          date: { $gte: dietPlan.startDate, $lte: dietPlan.endDate },
        })
        .sort({ date: 1 })
        .exec();

      // Calculate overall statistics
      const stats = this.calculateProgressStats(foodLogs, dietPlan);

      // Calculate rolling window statistics
      const windowDays = this.configService.rollingWindowDays;
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const windowStart = new Date(today);
      windowStart.setDate(windowStart.getDate() - (windowDays - 1));
      windowStart.setHours(0, 0, 0, 0);

      // Filter logs for rolling window (compare dates properly)
      const rollingWindowLogs = foodLogs.filter(log => {
        const logDate = new Date(log.date);
        logDate.setHours(0, 0, 0, 0);
        return logDate >= windowStart && logDate <= today;
      });
      const rollingWindowStats = this.calculateRollingWindowStats(rollingWindowLogs, dietPlan, windowDays);

      return {
        success: true,
        progress: {
          ...stats,
          rollingWindow: rollingWindowStats,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get progress:', error);
      return {
        success: false,
        message: 'Failed to get progress',
        error: error.message,
      };
    }
  }

  /**
   * Calculate daily summary from food items
   * @deprecated Use FoodLogService.calculateDailySummary instead
   */
  private calculateDailySummary(foods: FoodItem[]): DailySummary {
    return this.foodLogService.calculateDailySummary(foods);
  }

  /**
   * Calculate progress statistics
   */
  private calculateProgressStats(foodLogs: FoodLogDocument[], dietPlan: DietPlanDocument) {
    const totalDays = foodLogs.length;
    const targets = dietPlan.dailyMacroTargets;

    let avgCalories = 0;
    let avgProtein = 0;
    let avgCarbs = 0;
    let avgFat = 0;
    let avgFiber = 0;
    let daysOnTrack = 0;

    for (const log of foodLogs) {
      if (log.dailySummary) {
        avgCalories += log.dailySummary.totalCalories;
        avgProtein += log.dailySummary.totalProtein;
        avgCarbs += log.dailySummary.totalCarbs;
        avgFat += log.dailySummary.totalFat;
        avgFiber += log.dailySummary.totalFiber;

        // Check if on track (within 10% of target)
        const caloriesDiff = Math.abs(log.dailySummary.totalCalories - targets.calories);
        if (caloriesDiff <= targets.calories * 0.1) {
          daysOnTrack++;
        }
      }
    }

    if (totalDays > 0) {
      avgCalories /= totalDays;
      avgProtein /= totalDays;
      avgCarbs /= totalDays;
      avgFat /= totalDays;
      avgFiber /= totalDays;
    }

    const adherenceRate = totalDays > 0 ? Math.round((daysOnTrack / totalDays) * 100) : 0;

    return {
      totalDaysLogged: totalDays,
      daysOnTrack,
      adherenceRate,
      averages: {
        calories: Math.round(avgCalories),
        protein: Math.round(avgProtein),
        carbs: Math.round(avgCarbs),
        fat: Math.round(avgFat),
        fiber: Math.round(avgFiber),
      },
      targets: {
        calories: targets.calories,
        protein: targets.protein,
        carbs: targets.carbs,
        fat: targets.fat,
        fiber: targets.fiber,
      },
      variance: {
        calories: Math.round(avgCalories - targets.calories),
        protein: Math.round(avgProtein - targets.protein),
        carbs: Math.round(avgCarbs - targets.carbs),
        fat: Math.round(avgFat - targets.fat),
        fiber: Math.round(avgFiber - targets.fiber),
      },
    };
  }

  /**
   * Calculate rolling window statistics (last N days)
   */
  private calculateRollingWindowStats(
    foodLogs: FoodLogDocument[],
    dietPlan: DietPlanDocument | null,
    windowDays: number,
  ) {
    const targets = dietPlan?.dailyMacroTargets || {
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 65,
      fiber: 30,
    };

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalFiber = 0;
    let daysLogged = 0;
    let daysOnTrack = 0;

    for (const log of foodLogs) {
      if (log.dailySummary) {
        totalCalories += log.dailySummary.totalCalories;
        totalProtein += log.dailySummary.totalProtein;
        totalCarbs += log.dailySummary.totalCarbs;
        totalFat += log.dailySummary.totalFat;
        totalFiber += log.dailySummary.totalFiber;
        daysLogged++;

        // Check if on track (within 10% of target)
        const caloriesDiff = Math.abs(log.dailySummary.totalCalories - targets.calories);
        if (caloriesDiff <= targets.calories * 0.1) {
          daysOnTrack++;
        }
      }
    }

    const avgCalories = daysLogged > 0 ? totalCalories / daysLogged : 0;
    const avgProtein = daysLogged > 0 ? totalProtein / daysLogged : 0;
    const avgCarbs = daysLogged > 0 ? totalCarbs / daysLogged : 0;
    const avgFat = daysLogged > 0 ? totalFat / daysLogged : 0;
    const avgFiber = daysLogged > 0 ? totalFiber / daysLogged : 0;

    const adherenceRate = daysLogged > 0 ? Math.round((daysOnTrack / daysLogged) * 100) : 0;

    // Calculate trend (comparing first half vs second half of window)
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (foodLogs.length >= 4) {
      const midPoint = Math.floor(foodLogs.length / 2);
      const firstHalf = foodLogs.slice(0, midPoint);
      const secondHalf = foodLogs.slice(midPoint);

      let firstHalfAvg = 0;
      let secondHalfAvg = 0;

      firstHalf.forEach(log => {
        if (log.dailySummary) {
          firstHalfAvg += log.dailySummary.totalCalories;
        }
      });
      firstHalfAvg /= firstHalf.length;

      secondHalf.forEach(log => {
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
      daysOnTrack,
      adherenceRate,
      averages: {
        calories: Math.round(avgCalories),
        protein: Math.round(avgProtein),
        carbs: Math.round(avgCarbs),
        fat: Math.round(avgFat),
        fiber: Math.round(avgFiber),
      },
      totals: {
        calories: Math.round(totalCalories),
        protein: Math.round(totalProtein),
        carbs: Math.round(totalCarbs),
        fat: Math.round(totalFat),
        fiber: Math.round(totalFiber),
      },
      targets: {
        calories: targets.calories,
        protein: targets.protein,
        carbs: targets.carbs,
        fat: targets.fat,
        fiber: targets.fiber,
      },
      variance: {
        calories: Math.round(avgCalories - targets.calories),
        protein: Math.round(avgProtein - targets.protein),
        carbs: Math.round(avgCarbs - targets.carbs),
        fat: Math.round(avgFat - targets.fat),
        fiber: Math.round(avgFiber - targets.fiber),
      },
      trend,
    };
  }
}

