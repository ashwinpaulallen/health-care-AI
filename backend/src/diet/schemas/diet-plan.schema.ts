import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument, Types } from 'mongoose';

export type DietPlanDocument = DietPlan & MongooseDocument;

export interface MacroTarget {
  calories: number;
  protein: number;  // grams
  carbs: number;    // grams
  fat: number;      // grams
  fiber: number;    // grams
}

export interface MealPlan {
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  time?: string;  // e.g., "8:00 AM"
  suggestions: string[];  // List of suggested foods/meals
  macros?: MacroTarget;  // Optional macro targets for this meal
}

@Schema({ collection: 'diet_plans', timestamps: true })
export class DietPlan {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true })
  durationDays: number;

  @Prop({ type: Object, required: true })
  dailyMacroTargets: MacroTarget;

  @Prop({ type: [Object], default: [] })
  mealPlans: MealPlan[];

  @Prop({ type: [String], default: [] })
  goals: string[];  // e.g., "weight loss", "muscle gain", "diabetes management"

  @Prop({ type: [String], default: [] })
  dietaryRestrictions: string[];  // e.g., "vegetarian", "gluten-free", "dairy-free"

  @Prop({ type: [String], default: [] })
  allergies: string[];

  @Prop({ default: 'active', enum: ['active', 'completed', 'paused', 'cancelled'] })
  status: string;

  @Prop()
  notes?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const DietPlanSchema = SchemaFactory.createForClass(DietPlan);

// Create indexes
DietPlanSchema.index({ userId: 1, status: 1 });
DietPlanSchema.index({ startDate: 1, endDate: 1 });

