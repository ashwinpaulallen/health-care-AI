import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '../config/config.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.client = new Redis(this.configService.redisUrl, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis connection error:', err);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Redis connection closed');
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async setJSON(key: string, value: unknown, ttl?: number): Promise<void> {
    const json = JSON.stringify(value);
    await this.set(key, json, ttl);
  }

  async getJSON<T>(key: string): Promise<T | null> {
    const json = await this.get(key);
    if (!json) return null;
    try {
      return JSON.parse(json) as T;
    } catch {
      return null;
    }
  }
}

