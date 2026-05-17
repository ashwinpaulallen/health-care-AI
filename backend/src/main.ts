import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true },
  );

  // Use Pino logger
  app.useLogger(app.get(Logger));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});

