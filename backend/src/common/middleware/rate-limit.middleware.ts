import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly requests = new Map<string, RateLimitEntry>();
  private readonly limit = 5; // requests
  private readonly windowMs = 10000; // 10 seconds

  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
    // Only apply in development
    if (process.env.NODE_ENV === 'production') {
      return next();
    }

    const ip = this.getClientIp(req);
    const now = Date.now();

    let entry = this.requests.get(ip);

    if (!entry || now > entry.resetTime) {
      // New window
      entry = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      this.requests.set(ip, entry);
      return next();
    }

    if (entry.count >= this.limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please wait and try again.',
          retryAfter: Math.ceil((entry.resetTime - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count++;
    next();
  }

  private getClientIp(req: any): string {
    return (
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }
}

