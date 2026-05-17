import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { DietPlan, DietPlanSchema } from '../diet/schemas/diet-plan.schema';
import { FoodLog, FoodLogSchema } from '../diet/schemas/food-log.schema';
import { ChatController } from './chat.controller';
import { AgentModule } from '../agent/agent.module';
import { RagModule } from '../rag/rag.module';
import { RateLimitMiddleware } from '../common/middleware/rate-limit.middleware';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: DietPlan.name, schema: DietPlanSchema },
      { name: FoodLog.name, schema: FoodLogSchema },
    ]),
    AgentModule,
    RagModule,
  ],
  controllers: [ChatController],
  providers: [RateLimitMiddleware],
})
export class ChatModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitMiddleware).forRoutes('chat/message');
  }
}

