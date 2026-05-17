import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { CommonModule } from './common/common.module';
import { RagModule } from './rag/rag.module';
import { AgentModule } from './agent/agent.module';
import { ChatModule } from './chat/chat.module';
import { DietModule } from './diet/diet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
      },
    }),
    CommonModule,
    RagModule,
    AgentModule,
    ChatModule,
    DietModule,
  ],
})
export class AppModule {}

