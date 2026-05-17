import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { MongoModule } from './mongo/mongo.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [ConfigModule, MongoModule, RedisModule],
  exports: [ConfigModule, MongoModule, RedisModule],
})
export class CommonModule {}

