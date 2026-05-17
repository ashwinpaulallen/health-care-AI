import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '../common/config/config.service';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class LlmChatService {
  private readonly logger = new Logger(LlmChatService.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      baseURL: this.configService.llmBaseUrl,
      apiKey: 'not-needed-for-local',
    });
  }

  /**
   * Chat completion with JSON response parsing
   */
  async chatJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    schemaHint?: string,
  ): Promise<T | null> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    if (schemaHint) {
      messages[0].content += `\n\nExpected JSON schema:\n${schemaHint}`;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: this.configService.llmChatModel,
        messages: messages as any,
        temperature: 0.3,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content || '';

      // Try to extract JSON from markdown code blocks or raw text
      const jsonMatch =
        content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        this.logger.warn('No JSON found in LLM response');
        return null;
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr) as T;
    } catch (error) {
      this.logger.error('LLM chat failed:', error);
      return null;
    }
  }

  /**
   * Simple chat completion (non-JSON)
   */
  async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await this.openai.chat.completions.create({
        model: this.configService.llmChatModel,
        messages: messages as any,
        temperature: 0.7,
        max_tokens: 1500,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      this.logger.error('LLM chat failed:', error);
      throw new Error('Failed to generate response');
    }
  }
}

