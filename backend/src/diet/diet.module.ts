import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DietPlan, DietPlanSchema } from './schemas/diet-plan.schema';
import { FoodLog, FoodLogSchema } from './schemas/food-log.schema';
import { DietPlanController } from './diet-plan.controller';
import { FoodLogController } from './food-log.controller';
import { FoodSearchController } from './food-search.controller';
import { DietRecommendationService } from './diet-recommendation.service';
import { FoodLogService } from './food-log.service';
import { AgentModule } from '../agent/agent.module';
import { RagModule } from '../rag/rag.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DietPlan.name, schema: DietPlanSchema },
      { name: FoodLog.name, schema: FoodLogSchema },
    ]),
    CommonModule,
    RagModule,
    forwardRef(() => AgentModule), // Use forwardRef to handle circular dependency
  ],
  controllers: [DietPlanController, FoodLogController, FoodSearchController],
  providers: [DietRecommendationService, FoodLogService],
  exports: [DietRecommendationService, FoodLogService],
})
export class DietModule {}

