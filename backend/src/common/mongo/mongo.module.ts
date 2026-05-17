import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '../config/config.service';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.mongoUri,
        retryAttempts: 3,
        retryDelay: 1000,
      }),
    }),
  ],
})
export class MongoModule {}

