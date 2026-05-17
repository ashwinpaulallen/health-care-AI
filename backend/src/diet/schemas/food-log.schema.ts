import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument, Types } from 'mongoose';

export type FoodLogDocument = FoodLog & MongooseDocument;

export interface FoodItem {
  name: string;
  quantity: string;  // e.g., "1 cup", "2 rotis", "100g"
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  time?: string;
  macros?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fiber?: number;
  };
  notes?: string;
}

export interface DailySummary {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  mealsLogged: number;
  waterIntake?: number;  // in ml
}

@Schema({ collection: 'food_logs', timestamps: true })
export class FoodLog {
  @Prop({ required: true })
  userId: string;

  @Prop({ type: Types.ObjectId, ref: 'DietPlan' })
  dietPlanId?: Types.ObjectId;

  @Prop({ required: true })
  date: Date;  // Date for this log (without time)

  @Prop({ type: [Object], default: [] })
  foods: FoodItem[];

  @Prop({ type: Object })
  dailySummary?: DailySummary;

  @Prop({ type: Number, default: 0 })
  waterIntake: number;  // in ml

  @Prop()
  notes?: string;

  @Prop({ type: [String], default: [] })
  symptoms: string[];  // Track any symptoms (bloating, fatigue, etc.)

  @Prop({ type: Number, min: 1, max: 5 })
  energyLevel?: number;  // 1-5 scale

  @Prop({ type: Number, min: 1, max: 5 })
  hungerLevel?: number;  // 1-5 scale

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const FoodLogSchema = SchemaFactory.createForClass(FoodLog);

// Create indexes
FoodLogSchema.index({ userId: 1, date: -1 });
FoodLogSchema.index({ dietPlanId: 1, date: -1 });
FoodLogSchema.index({ userId: 1, dietPlanId: 1, date: -1 });

