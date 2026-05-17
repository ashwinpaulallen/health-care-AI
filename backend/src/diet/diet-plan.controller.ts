import { Controller, Get, Post, Put, Delete, Body, Param, Query, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DietPlan, DietPlanDocument, MacroTarget, MealPlan } from './schemas/diet-plan.schema';

export interface CreateDietPlanDto {
  userId: string;
  name: string;
  description?: string;
  startDate: string;  // ISO date string
  durationDays: number;
  dailyMacroTargets: MacroTarget;
  mealPlans?: MealPlan[];
  goals?: string[];
  dietaryRestrictions?: string[];
  allergies?: string[];
  notes?: string;
}

export interface UpdateDietPlanDto {
  name?: string;
  description?: string;
  dailyMacroTargets?: MacroTarget;
  mealPlans?: MealPlan[];
  goals?: string[];
  dietaryRestrictions?: string[];
  allergies?: string[];
  status?: 'active' | 'completed' | 'paused' | 'cancelled';
  notes?: string;
}

@Controller('diet/plans')
export class DietPlanController {
  private readonly logger = new Logger(DietPlanController.name);

  constructor(
    @InjectModel(DietPlan.name) private dietPlanModel: Model<DietPlanDocument>,
  ) {}

  /**
   * Create a new diet plan
   */
  @Post()
  async createDietPlan(@Body() dto: CreateDietPlanDto) {
    this.logger.log(`Creating diet plan for user: ${dto.userId}`);

    try {
      // Normalize startDate to midnight local time to match query logic
      const startDate = new Date(dto.startDate);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + dto.durationDays);
      
      this.logger.debug(`Creating diet plan: startDate=${startDate.toISOString()}, endDate=${endDate.toISOString()}, durationDays=${dto.durationDays}`);

      const dietPlan = await this.dietPlanModel.create({
        ...dto,
        startDate,
        endDate,
        status: 'active',
      });

      this.logger.log(`Diet plan created: ${dietPlan._id}`);

      return {
        success: true,
        message: 'Diet plan created successfully',
        dietPlan: {
          id: dietPlan._id,
          userId: dietPlan.userId,
          name: dietPlan.name,
          startDate: dietPlan.startDate,
          endDate: dietPlan.endDate,
          durationDays: dietPlan.durationDays,
          status: dietPlan.status,
        },
      };
    } catch (error) {
      this.logger.error('Failed to create diet plan:', error);
      return {
        success: false,
        message: 'Failed to create diet plan',
        error: error.message,
      };
    }
  }

  /**
   * Get all diet plans for a user
   */
  @Get('user/:userId')
  async getUserDietPlans(
    @Param('userId') userId: string,
    @Query('status') status?: string,
  ) {
    this.logger.log(`Fetching diet plans for user: ${userId}`);

    try {
      const query: any = { userId };
      if (status) {
        query.status = status;
      }

      const dietPlans = await this.dietPlanModel
        .find(query)
        .sort({ startDate: -1 })
        .exec();

      return {
        success: true,
        dietPlans: dietPlans.map(plan => ({
          id: plan._id,
          name: plan.name,
          description: plan.description,
          startDate: plan.startDate,
          endDate: plan.endDate,
          durationDays: plan.durationDays,
          status: plan.status,
          goals: plan.goals,
          createdAt: plan.createdAt,
        })),
        total: dietPlans.length,
      };
    } catch (error) {
      this.logger.error('Failed to fetch diet plans:', error);
      return {
        success: false,
        message: 'Failed to fetch diet plans',
        error: error.message,
      };
    }
  }

  /**
   * Get a specific diet plan by ID
   */
  @Get(':id')
  async getDietPlan(@Param('id') id: string) {
    this.logger.log(`Fetching diet plan: ${id}`);

    try {
      const dietPlan = await this.dietPlanModel.findById(id).exec();

      if (!dietPlan) {
        return {
          success: false,
          message: 'Diet plan not found',
        };
      }

      return {
        success: true,
        dietPlan: {
          id: dietPlan._id,
          userId: dietPlan.userId,
          name: dietPlan.name,
          description: dietPlan.description,
          startDate: dietPlan.startDate,
          endDate: dietPlan.endDate,
          durationDays: dietPlan.durationDays,
          dailyMacroTargets: dietPlan.dailyMacroTargets,
          mealPlans: dietPlan.mealPlans,
          goals: dietPlan.goals,
          dietaryRestrictions: dietPlan.dietaryRestrictions,
          allergies: dietPlan.allergies,
          status: dietPlan.status,
          notes: dietPlan.notes,
          createdAt: dietPlan.createdAt,
          updatedAt: dietPlan.updatedAt,
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch diet plan:', error);
      return {
        success: false,
        message: 'Failed to fetch diet plan',
        error: error.message,
      };
    }
  }

  /**
   * Update a diet plan
   */
  @Put(':id')
  async updateDietPlan(@Param('id') id: string, @Body() dto: UpdateDietPlanDto) {
    this.logger.log(`Updating diet plan: ${id}`);

    try {
      const dietPlan = await this.dietPlanModel.findByIdAndUpdate(
        id,
        { $set: dto },
        { new: true },
      ).exec();

      if (!dietPlan) {
        return {
          success: false,
          message: 'Diet plan not found',
        };
      }

      this.logger.log(`Diet plan updated: ${id}`);

      return {
        success: true,
        message: 'Diet plan updated successfully',
        dietPlan: {
          id: dietPlan._id,
          name: dietPlan.name,
          status: dietPlan.status,
          updatedAt: dietPlan.updatedAt,
        },
      };
    } catch (error) {
      this.logger.error('Failed to update diet plan:', error);
      return {
        success: false,
        message: 'Failed to update diet plan',
        error: error.message,
      };
    }
  }

  /**
   * Delete a diet plan
   */
  @Delete(':id')
  async deleteDietPlan(@Param('id') id: string) {
    this.logger.log(`Deleting diet plan: ${id}`);

    try {
      const result = await this.dietPlanModel.findByIdAndDelete(id).exec();

      if (!result) {
        return {
          success: false,
          message: 'Diet plan not found',
        };
      }

      this.logger.log(`Diet plan deleted: ${id}`);

      return {
        success: true,
        message: 'Diet plan deleted successfully',
      };
    } catch (error) {
      this.logger.error('Failed to delete diet plan:', error);
      return {
        success: false,
        message: 'Failed to delete diet plan',
        error: error.message,
      };
    }
  }

  /**
   * Get active diet plan for a user
   */
  @Get('user/:userId/active')
  async getActiveDietPlan(@Param('userId') userId: string) {
    this.logger.log(`Fetching active diet plan for user: ${userId}`);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Also check tomorrow to catch plans starting today (timezone issues)
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      this.logger.debug(`Looking for active plan: userId=${userId}, today=${today.toISOString()}, tomorrow=${tomorrow.toISOString()}`);

      // Find active plans that haven't ended yet
      // Be lenient with startDate - include plans starting today or in the past
      // This handles timezone issues and plans created for today
      const dietPlan = await this.dietPlanModel
        .findOne({
          userId,
          status: 'active',
          endDate: { $gte: today }, // Must not have ended
          // Start date can be today or in the past (or up to 7 days in the future for flexibility)
          startDate: { $lte: tomorrow },
        })
        .sort({ startDate: -1 })
        .exec();

      if (!dietPlan) {
        // Fallback: check if there's any active plan (regardless of dates)
        // This helps catch plans that might have date/timezone issues
        const anyActivePlan = await this.dietPlanModel
          .findOne({
            userId,
            status: 'active',
          })
          .sort({ startDate: -1 })
          .exec();

        if (anyActivePlan) {
          this.logger.warn(
            `Found active plan but date filter excluded it. Plan: ${anyActivePlan._id}, startDate: ${anyActivePlan.startDate.toISOString()}, endDate: ${anyActivePlan.endDate.toISOString()}, today: ${today.toISOString()}`,
          );
          // Use the plan anyway - it's marked as active
          const totalDays = anyActivePlan.durationDays;
          const daysPassed = Math.max(
            0,
            Math.floor((today.getTime() - anyActivePlan.startDate.getTime()) / (1000 * 60 * 60 * 24)),
          );
          const daysRemaining = Math.max(0, totalDays - daysPassed);
          const progressPercentage = Math.min(100, Math.max(0, Math.round((daysPassed / totalDays) * 100)));

          return {
            success: true,
            dietPlan: {
              id: anyActivePlan._id,
              userId: anyActivePlan.userId,
              name: anyActivePlan.name,
              description: anyActivePlan.description,
              startDate: anyActivePlan.startDate,
              endDate: anyActivePlan.endDate,
              durationDays: anyActivePlan.durationDays,
              dailyMacroTargets: anyActivePlan.dailyMacroTargets,
              mealPlans: anyActivePlan.mealPlans,
              goals: anyActivePlan.goals,
              dietaryRestrictions: anyActivePlan.dietaryRestrictions,
              allergies: anyActivePlan.allergies,
              status: anyActivePlan.status,
              notes: anyActivePlan.notes,
              progress: {
                daysPassed,
                daysRemaining,
                progressPercentage,
              },
            },
          };
        }

        this.logger.debug(`No active diet plan found for user: ${userId}`);
        return {
          success: true,
          message: 'No active diet plan found',
          dietPlan: null,
        };
      }

      this.logger.debug(`Found active diet plan: ${dietPlan._id}, startDate=${dietPlan.startDate.toISOString()}, endDate=${dietPlan.endDate.toISOString()}`);

      // Calculate progress
      const totalDays = dietPlan.durationDays;
      const daysPassed = Math.max(
        0,
        Math.floor((today.getTime() - dietPlan.startDate.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const daysRemaining = Math.max(0, totalDays - daysPassed);
      const progressPercentage = Math.min(100, Math.max(0, Math.round((daysPassed / totalDays) * 100)));

      return {
        success: true,
        dietPlan: {
          id: dietPlan._id,
          userId: dietPlan.userId,
          name: dietPlan.name,
          description: dietPlan.description,
          startDate: dietPlan.startDate,
          endDate: dietPlan.endDate,
          durationDays: dietPlan.durationDays,
          dailyMacroTargets: dietPlan.dailyMacroTargets,
          mealPlans: dietPlan.mealPlans,
          goals: dietPlan.goals,
          dietaryRestrictions: dietPlan.dietaryRestrictions,
          allergies: dietPlan.allergies,
          status: dietPlan.status,
          notes: dietPlan.notes,
          progress: {
            daysPassed,
            daysRemaining,
            progressPercentage,
          },
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch active diet plan:', error);
      return {
        success: false,
        message: 'Failed to fetch active diet plan',
        error: error.message,
      };
    }
  }
}

