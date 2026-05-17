import { Controller, Get, Query, Logger } from '@nestjs/common';
import { RetrieverService } from '../rag/retriever.service';
import { LlmChatService } from '../agent/llm.chat.service';

export interface FoodNutritionInfo {
  name: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  servingSize?: string;
  description?: string;
}

@Controller('diet/food-search')
export class FoodSearchController {
  private readonly logger = new Logger(FoodSearchController.name);

  constructor(
    private readonly retrieverService: RetrieverService,
    private readonly llmService: LlmChatService,
  ) {}

  /**
   * Search for food and extract nutritional information
   */
  @Get('search')
  async searchFood(@Query('q') query: string): Promise<{
    success: boolean;
    foods: FoodNutritionInfo[];
  }> {
    this.logger.log(`Searching for food: ${query}`);

    if (!query || query.trim().length === 0) {
      return {
        success: false,
        foods: [],
      };
    }

    try {
      // Search food knowledge base
      const chunks = await this.retrieverService.retrieve(query, 'food', 3);

      if (chunks.length === 0) {
        return {
          success: true,
          foods: [],
        };
      }

      // Use LLM to extract structured nutritional information
      const foodContext = chunks.map((c) => c.text).join('\n\n');

      const systemPrompt = `You are a nutrition data extractor. Extract nutritional information for the food item "${query}" from the provided context.

Context:
${foodContext}

Extract and return nutritional information in JSON format. If specific values aren't available, estimate based on similar foods or leave as null.

Return format:
{
  "name": "food name",
  "calories": number (per 100g or per serving),
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams),
  "fiber": number (grams),
  "servingSize": "typical serving size description",
  "description": "brief description"
}

If multiple foods match, return an array. If no match, return empty array.`;

      const response = await this.llmService.chatJSON<FoodNutritionInfo | FoodNutritionInfo[]>(
        systemPrompt,
        `Extract nutritional information for "${query}"`,
        `{
          "name": "string",
          "calories": number,
          "protein": number,
          "carbs": number,
          "fat": number,
          "fiber": number,
          "servingSize": "string",
          "description": "string"
        } or [{
          "name": "string",
          "calories": number,
          "protein": number,
          "carbs": number,
          "fat": number,
          "fiber": number,
          "servingSize": "string",
          "description": "string"
        }]`,
      );

      let foods: FoodNutritionInfo[] = [];

      if (Array.isArray(response)) {
        foods = response;
      } else if (response && typeof response === 'object' && 'name' in response) {
        foods = [response];
      }

      // Ensure all foods have the query name if name is missing
      foods = foods.map((food) => ({
        ...food,
        name: food.name || query,
      }));

      this.logger.log(`Found ${foods.length} food(s) for query: ${query}`);

      return {
        success: true,
        foods,
      };
    } catch (error) {
      this.logger.error('Failed to search food:', error);
      return {
        success: false,
        foods: [],
      };
    }
  }

  /**
   * Get nutritional info for a specific food with quantity
   */
  @Get('nutrition')
  async getNutrition(
    @Query('food') foodName: string,
    @Query('quantity') quantity?: string,
  ): Promise<{
    success: boolean;
    nutrition?: FoodNutritionInfo;
    message?: string;
    suggestions?: string[];
  }> {
    this.logger.log(`Getting nutrition for: ${foodName}, quantity: ${quantity || 'default'}`);

    try {
      const searchResult = await this.searchFood(foodName);

      if (!searchResult.success || searchResult.foods.length === 0) {
        // Try to find similar foods for suggestions
        const chunks = await this.retrieverService.retrieve(foodName, 'food', 5);
        const suggestions: string[] = [];
        
        if (chunks.length > 0) {
          // Extract food names from chunks
          chunks.forEach((chunk) => {
            const lines = chunk.text.split('\n');
            lines.forEach((line) => {
              // Look for food names (usually first line or lines with food names)
              const match = line.match(/^#+\s*(.+?)(?:\s*$|:)/);
              if (match && match[1]) {
                const suggestedName = match[1].trim();
                if (suggestedName && !suggestions.includes(suggestedName)) {
                  suggestions.push(suggestedName);
                }
              }
            });
          });
        }

        return {
          success: false,
          message: `Nutrition information for "${foodName}" not found in the knowledge base. You can manually enter the nutrition values below.`,
          suggestions: suggestions.slice(0, 5), // Limit to 5 suggestions
        };
      }

      // Use first result
      const food = searchResult.foods[0];

      // If quantity is provided, try to adjust macros
      if (quantity && food.calories) {
        // Simple estimation - in production, use a proper nutrition calculator
        // For now, return base values and let frontend handle scaling
        return {
          success: true,
          nutrition: food,
        };
      }

      return {
        success: true,
        nutrition: food,
      };
    } catch (error) {
      this.logger.error('Failed to get nutrition:', error);
      return {
        success: false,
        message: 'An error occurred while looking up nutrition information. Please try again or enter values manually.',
      };
    }
  }
}

