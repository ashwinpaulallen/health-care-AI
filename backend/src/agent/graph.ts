import { Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { LlmChatService } from './llm.chat.service';
import { RetrieverService, RetrievedChunk } from '../rag/retriever.service';
import { TavilyMcpService, TavilySearchResult } from './tavily-mcp.service';
import { KnowledgeSaverService } from '../rag/knowledge-saver.service';
import { EvaluationService, EvaluationMetrics } from './evaluation.service';
import { ReflectionService, ReflectionResult } from './reflection.service';
import { ContextBuilderService, AgentContext } from './context-builder.service';

const logger = new Logger('AgentGraph');

// Graph state
export interface GraphState {
  userQuery: string;
  intent?: 'symptom' | 'food' | 'food-logging' | 'unknown';
  primaryDocs?: RetrievedChunk[];
  spilloverDocs?: RetrievedChunk[];
  tavilyResults?: TavilySearchResult[];
  usedTavily?: boolean;
  safetyLevel?: 'self-care' | 'caution' | 'seek-care';
  response?: AgentResponse;
  evaluation?: EvaluationMetrics;
  reflection?: ReflectionResult;
  retryCount?: number; // Track number of retries for self-correction
  agentContext?: AgentContext; // Complete context: deterministic state + conversation
  needsContextRetry?: boolean; // Flag to indicate response ignored conversation context
  // Food logging state
  foodLogging?: {
    extractedFood?: {
      foodName: string;
      mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
      quantity?: string;
    };
    extractedFoods?: Array<{
      foodName: string;
      mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
      quantity?: string;
    }>;
    nutrition?: {
      name: string;
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
      fiber?: number;
    };
    nutritions?: Array<{
      name: string;
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
      fiber?: number;
    }>;
    logged?: boolean;
    loggedItems?: Array<{
      foodName: string;
      mealType: string;
      nutrition: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number;
      };
    }>;
    progress?: {
      caloriesProgress: number;
      proteinProgress: number;
      carbsProgress: number;
      fatProgress: number;
      fiberProgress: number;
      remaining: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number;
      };
    };
  };
}

export interface AgentResponse {
  intent: 'symptom' | 'food' | 'food-logging' | 'unknown';
  level?: 'self-care' | 'caution' | 'seek-care';
  summary: string;
  steps?: string[];
  cautions?: string[];
  citations: Array<{ title: string; section?: string }>;
  evaluation?: EvaluationMetrics; // Evaluation metrics for this response
  foodLogged?: {
    foodName: string;
    mealType: string;
    nutrition: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
    };
    progress?: {
      caloriesProgress: number;
      remaining: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number;
      };
    };
  };
}

export interface ChatTurnInput {
  userId: string;
  text: string;
  convId?: string;
  dietPlanModel?: Model<any>;
  foodLogModel?: Model<any>;
  messageModel?: Model<any>;
  contextBuilderService?: ContextBuilderService;
  configService?: any; // Changed from ConfigService to any to avoid import issues
  foodTrackingService?: any;
  summarizationService?: any; // Changed from SummarizationService to any
  knowledgeSaverService?: KnowledgeSaverService;
  foodLogService?: any; // Changed from FoodLogService to any
  dietPlanService?: any; // Changed from DietPlanService to any
  dietPlanGeneratorService?: any; // Changed from DietPlanGeneratorService to any
}
export interface ChatTurnOutput {
  convId: string;
  messageId: string;
  intent: 'symptom' | 'food' | 'food-logging' | 'unknown';
  level?: 'self-care' | 'caution' | 'seek-care';
  summary: string;
  steps?: string[];
  cautions?: string[];
  citations: Array<{ title: string; section?: string }>;
  evaluation?: EvaluationMetrics; // Evaluation metrics
  retryCount?: number; // Number of retries performed
  foodLogged?: {
    foodName: string;
    mealType: string;
    nutrition: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
    };
    progress?: {
      caloriesProgress: number;
      remaining: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number;
      };
    };
  };
}

/**
 * Node 1: Intent Classifier
 * Strict JSON output with clear classification rules
 * Now includes conversation context to better understand follow-up questions
 */
export async function intentClassifierNode (
  state: GraphState,
  llmService: LlmChatService,
): Promise<GraphState> {
  logger.log('Running Intent Classifier');

  // Build conversation context text if available
  let conversationContextText = '';
  if (state.agentContext?.conversationContext.recentMessages.length > 0) {
    conversationContextText = '\n\n**Recent Conversation Context:**\n';
    state.agentContext.conversationContext.recentMessages.forEach((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      conversationContextText += `${role}: ${msg.text}\n`;
    });
    conversationContextText += '\nUse this context to understand if the current query is a follow-up to previous messages.\n';
  }

  const systemPrompt = `You are an intent classifier for a health and nutrition assistant.

Classification rules:
- "symptom": Bodily feelings, physical issues, health concerns, medical symptoms, or how the body feels. **CRITICALLY: Also includes ANY follow-up questions about symptoms discussed in the conversation history** (e.g., "will this help?", "do you think...?", "what about...?" when referring to a previous symptom discussion).
- "food": Questions about nutrients, foods, meals, recipes, diet plans, eating habits, or nutritional information (asking "what is", "tell me about", etc.) **ONLY if NOT a follow-up to a symptom discussion**
- "food-logging": User is stating they are eating/having/consuming food (e.g., "I'm eating roti for lunch", "I had paneer for dinner", "Just ate some rice")
- "unknown": Unclear, unrelated, or general queries that don't fit the above categories

Key distinction:
- "food-logging": User is reporting what they ARE EATING or HAVE EATEN (action/statement)
- "food": User is ASKING about food/nutrition (question) **BUT NOT if it's a follow-up to a symptom discussion**
- "symptom": **If the conversation history shows a symptom discussion (e.g., bloating, pain, discomfort) and the current query is asking about remedies, treatments, or whether something will help, ALWAYS classify as "symptom"**

${conversationContextText}
**CRITICAL RULE:** If the conversation history contains symptom-related messages (bloating, pain, discomfort, etc.) and the current query is asking "will X help?", "do you think X...?", or similar follow-up questions, you MUST classify as "symptom", NOT "food".

Respond with ONLY valid JSON in this exact format: {"intent": "symptom"} or {"intent": "food"} or {"intent": "food-logging"} or {"intent": "unknown"}

No other text. Just the JSON object.`;

  // Include conversation context in the user query if available
  const queryWithContext = conversationContextText
    ? `${state.userQuery}${conversationContextText}`
    : state.userQuery;

  const result = await llmService.chatJSON<{ intent: string }>(
    systemPrompt,
    queryWithContext,
    '{"intent": "symptom|food|food-logging|unknown"}',
  );

  const intent = (result?.intent || 'unknown') as 'symptom' | 'food' | 'food-logging' | 'unknown';
  logger.log(`Intent classified as: ${intent}`);

  return { ...state, intent };
}

/**
 * Node 1.5: Food Extraction (for food-logging intent)
 * Extracts food name(s), meal type, and quantity from user message
 * Supports multiple food items in a single message
 */
export async function foodExtractionNode (
  state: GraphState,
  foodTrackingService: any,
): Promise<GraphState> {
  logger.log('Running Food Extraction');

  if (state.intent !== 'food-logging') {
    return state;
  }

  try {
    // Try to extract multiple food items
    const extractedItems = await foodTrackingService.extractMultipleFoodItems(state.userQuery);

    if (!extractedItems || extractedItems.items.length === 0) {
      logger.warn('Failed to extract food information');
      // Fallback: try to infer from query
      const queryLower = state.userQuery.toLowerCase();
      let mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 'snack';

      if (queryLower.includes('breakfast') || queryLower.includes('morning')) {
        mealType = 'breakfast';
      } else if (queryLower.includes('lunch') || queryLower.includes('noon')) {
        mealType = 'lunch';
      } else if (queryLower.includes('dinner') || queryLower.includes('evening') || queryLower.includes('night')) {
        mealType = 'dinner';
      }

      // Try to extract food name (simple heuristic)
      const words = state.userQuery.split(/\s+/).filter(w =>
        w.length > 2 &&
        !['i', 'am', 'having', 'eating', 'had', 'just', 'ate', 'for', 'some', 'a', 'an', 'the'].includes(w.toLowerCase())
      );
      const foodName = words.slice(0, 3).join(' ') || 'food item';

      return {
        ...state,
        foodLogging: {
          extractedFood: {
            foodName,
            mealType,
          },
          extractedFoods: [
            {
              foodName,
              mealType,
            },
          ],
        },
      };
    }

    // Store both single item (for backward compatibility) and multiple items
    const firstItem = extractedItems.items[0];
    return {
      ...state,
      foodLogging: {
        extractedFood: {
          foodName: firstItem.foodName,
          mealType: firstItem.mealType,
          quantity: firstItem.quantity,
        },
        extractedFoods: extractedItems.items.map(item => ({
          foodName: item.foodName,
          mealType: item.mealType,
          quantity: item.quantity,
        })),
      },
    };
  } catch (error) {
    logger.error('Food extraction failed:', error);
    return state;
  }
}

/**
 * Node 1.6: Nutrition Lookup (for food-logging intent)
 * Looks up nutrition information for the extracted food(s)
 * Supports multiple food items
 */
export async function nutritionLookupNode (
  state: GraphState,
  foodTrackingService: any,
): Promise<GraphState> {
  logger.log('Running Nutrition Lookup');

  if (state.intent !== 'food-logging' || !state.foodLogging?.extractedFoods) {
    // Fallback to single item extraction
    if (state.intent !== 'food-logging' || !state.foodLogging?.extractedFood) {
      return state;
    }

    // Single item lookup (backward compatibility)
    try {
      const extractedFood = state.foodLogging.extractedFood;
      const nutrition = await foodTrackingService.lookupNutrition(
        extractedFood.foodName,
        extractedFood.quantity,
      );

      if (!nutrition) {
        logger.warn(`Nutrition lookup failed for: ${extractedFood.foodName}`);
        return {
          ...state,
          foodLogging: {
            ...state.foodLogging,
            nutrition: {
              name: extractedFood.foodName,
              calories: 0,
              protein: 0,
              carbs: 0,
              fat: 0,
              fiber: 0,
            },
          },
        };
      }

      return {
        ...state,
        foodLogging: {
          ...state.foodLogging,
          nutrition: {
            name: nutrition.name,
            calories: nutrition.calories || 0,
            protein: nutrition.protein || 0,
            carbs: nutrition.carbs || 0,
            fat: nutrition.fat || 0,
            fiber: nutrition.fiber || 0,
          },
        },
      };
    } catch (error) {
      logger.error('Nutrition lookup failed:', error);
      return state;
    }
  }

  // Multiple items lookup
  try {
    const extractedFoods = state.foodLogging.extractedFoods;
    const nutritions: Array<{
      name: string;
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
      fiber?: number;
    }> = [];

    // Lookup nutrition for each food item
    for (const food of extractedFoods) {
      const nutrition = await foodTrackingService.lookupNutrition(
        food.foodName,
        food.quantity,
      );

      if (!nutrition) {
        logger.warn(`Nutrition lookup failed for: ${food.foodName}, using defaults`);
        nutritions.push({
          name: food.foodName,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          fiber: 0,
        });
      } else {
        nutritions.push({
          name: nutrition.name,
          calories: nutrition.calories || 0,
          protein: nutrition.protein || 0,
          carbs: nutrition.carbs || 0,
          fat: nutrition.fat || 0,
          fiber: nutrition.fiber || 0,
        });
      }
    }

    // Also set first item for backward compatibility
    const firstNutrition = nutritions[0];

    return {
      ...state,
      foodLogging: {
        ...state.foodLogging,
        nutrition: firstNutrition,
        nutritions,
      },
    };
  } catch (error) {
    logger.error('Nutrition lookup failed:', error);
    return state;
  }
}

/**
 * Node 1.7: Food Logging (for food-logging intent)
 * Logs food(s) to food log and calculates progress
 * Supports multiple food items
 */
export async function foodLoggingNode (
  state: GraphState,
  foodTrackingService: any,
  userId: string,
  dietPlanModel?: Model<any>,
  foodLogModel?: Model<any>,
): Promise<GraphState> {
  logger.log('Running Food Logging');

  // Check for multiple items first
  if (
    state.intent === 'food-logging' &&
    state.foodLogging?.extractedFoods &&
    state.foodLogging?.nutritions &&
    state.foodLogging.extractedFoods.length > 0 &&
    state.foodLogging.nutritions.length > 0
  ) {
    // Multiple items logging
    try {
      const items = state.foodLogging.extractedFoods.map((food, index) => ({
        foodInfo: {
          foodName: food.foodName,
          mealType: food.mealType,
          quantity: food.quantity,
          confidence: 1.0,
        },
        nutrition: state.foodLogging!.nutritions![index],
      }));

      const result = await foodTrackingService.logMultipleFoods(
        userId,
        items,
        dietPlanModel,
        foodLogModel,
      );

      if (result.success) {
        const loggedItems = items.map((i) => ({
          foodName: i.foodInfo.foodName,
          mealType: i.foodInfo.mealType,
          nutrition: {
            calories: i.nutrition.calories || 0,
            protein: i.nutrition.protein || 0,
            carbs: i.nutrition.carbs || 0,
            fat: i.nutrition.fat || 0,
            fiber: i.nutrition.fiber || 0,
          },
        }));

        logger.log(`Food items logged successfully: ${loggedItems.map((i) => i.foodName).join(', ')}`);
        return {
          ...state,
          foodLogging: {
            ...state.foodLogging,
            logged: true,
            loggedItems,
            progress: result.progress,
          },
        };
      } else {
        logger.error(`Food logging failed: ${result.error}`);
        return state;
      }
    } catch (error) {
      logger.error('Food logging node failed:', error);
      return state;
    }
  }

  // Fallback to single item logging (backward compatibility)
  if (state.intent !== 'food-logging' || !state.foodLogging?.extractedFood || !state.foodLogging?.nutrition) {
    return state;
  }

  try {
    const extractedFood = state.foodLogging.extractedFood;
    const nutrition = state.foodLogging.nutrition;

    const result = await foodTrackingService.logFood(
      userId,
      {
        foodName: extractedFood.foodName,
        mealType: extractedFood.mealType,
        quantity: extractedFood.quantity,
        confidence: 1.0,
      },
      {
        name: nutrition.name,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        fiber: nutrition.fiber,
      },
      dietPlanModel,
      foodLogModel,
    );

    if (result.success) {
      logger.log(`Food logged successfully: ${extractedFood.foodName}`);
      return {
        ...state,
        foodLogging: {
          ...state.foodLogging,
          logged: true,
          loggedItems: [
            {
              foodName: extractedFood.foodName,
              mealType: extractedFood.mealType,
              nutrition: {
                calories: nutrition.calories || 0,
                protein: nutrition.protein || 0,
                carbs: nutrition.carbs || 0,
                fat: nutrition.fat || 0,
                fiber: nutrition.fiber || 0,
              },
            },
          ],
          progress: result.progress,
        },
      };
    } else {
      logger.error(`Food logging failed: ${result.error}`);
      return state;
    }
  } catch (error) {
    logger.error('Food logging node failed:', error);
    return state;
  }
}

/**
 * Node 2: Retriever
 * Fetches relevant documents based on intent
 * If insufficient results, calls Tavily search
 */
export async function retrieverNode (
  state: GraphState,
  retrieverService: RetrieverService,
  tavilyService?: TavilyMcpService,
  knowledgeSaverService?: KnowledgeSaverService,
): Promise<GraphState> {
  logger.log('Running Retriever');

  if (state.intent === 'unknown' || state.intent === 'food-logging') {
    // Skip retrieval for unknown or food-logging (nutrition already looked up)
    logger.log(`Intent is ${state.intent}, skipping retrieval`);
    return state;
  }

  // Retrieve with spillover from other domain
  const { primary, spillover } = await retrieverService.retrieveWithSpillover(
    state.userQuery,
    state.intent as 'symptom' | 'food', // Cast to valid intent type (food-logging already filtered out above)
    4,
    1,
  );

  logger.log(`Retrieved ${primary.length} primary docs, ${spillover.length} spillover docs`);

  // Check if we have sufficient results (at least one good match)
  // Also check if the query terms actually appear in the retrieved chunks
  const hasGoodResults = primary.length > 0 && primary.some((doc) => doc.score >= 0.5);
  const allDocs = [...primary, ...spillover];
  const hasAnyResults = allDocs.length > 0;

  // Check if query terms actually appear in retrieved chunks (not just semantic similarity)
  // Extract key terms from query (simple approach - split by space and filter common words)
  const queryLower = state.userQuery.toLowerCase();
  const queryTerms = queryLower
    .replace(/[?!.,;:()]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 3) // Only meaningful terms
    .filter((term) => !['what', 'are', 'the', 'benefits', 'health', 'good', 'for', 'how', 'much', 'is', 'in', 'about', 'with', 'from'].includes(term));

  const hasExactMatch = primary.some((doc) => {
    const docTextLower = doc.text.toLowerCase();
    return queryTerms.some((term) => docTextLower.includes(term));
  });

  // Log score details for debugging
  if (primary.length > 0) {
    const scores = primary.map((doc) => doc.score).join(', ');
    const maxScore = Math.max(...primary.map((doc) => doc.score));
    logger.log(`Primary doc scores: [${scores}], max: ${maxScore.toFixed(3)}, hasGoodResults: ${hasGoodResults}, hasExactMatch: ${hasExactMatch}`);
    logger.log(`Query terms: [${queryTerms.join(', ')}]`);
  } else {
    logger.log('No primary docs found, hasGoodResults: false');
  }

  // If no good results and Tavily is available, search the internet
  let tavilyResults: TavilySearchResult[] = [];
  let usedTavily = false;

  // Check Tavily availability
  // Use Tavily if: no good results OR good results but no exact match (semantic similarity found related content but not the specific food)
  const tavilyAvailable = !!tavilyService;
  const hasRelevantContent = hasGoodResults && hasExactMatch;
  logger.log(`Tavily service available: ${tavilyAvailable}, intent: ${state.intent}, hasGoodResults: ${hasGoodResults}, hasExactMatch: ${hasExactMatch}`);
  const isValidIntent = state.intent === 'symptom' || state.intent === 'food';
  const shouldUseTavily = (!hasGoodResults || !hasExactMatch) && tavilyAvailable && isValidIntent;

  if (!shouldUseTavily) {
    if (hasRelevantContent) {
      logger.log(`Skipping Tavily search: Knowledge base has relevant content with exact matches`);
    } else if (hasGoodResults && !hasExactMatch) {
      logger.log(`Skipping Tavily search: Found semantically similar content but no exact match - will use Tavily`);
    } else if (!tavilyAvailable) {
      logger.log(`Skipping Tavily search: Tavily service not available`);
    } else if (!isValidIntent) {
      logger.log(`Skipping Tavily search: Intent is 'unknown' or undefined`);
    }
  }

  if (shouldUseTavily) {
    logger.log(`Insufficient knowledge base results (hasGoodResults: ${hasGoodResults}), searching internet via Tavily for: "${state.userQuery}"...`);

    try {
      tavilyResults = await tavilyService.search(state.userQuery, 5);

      if (tavilyResults.length > 0) {
        usedTavily = true;
        logger.log(`Tavily search returned ${tavilyResults.length} results`);

        // Save search results to knowledge base for future use
        if (knowledgeSaverService) {
          try {
            await knowledgeSaverService.saveSearchResultsToKnowledgeBase(
              state.userQuery,
              tavilyResults,
              state.intent || 'food', // Default to 'food' if intent is undefined
            );
            logger.log('Saved Tavily search results to knowledge base');
          } catch (saveError) {
            logger.error('Failed to save search results to knowledge base:', saveError);
            // Continue even if save fails
          }
        }
      } else {
        logger.log('Tavily search returned no results');
      }
    } catch (tavilyError) {
      logger.error('Tavily search failed:', tavilyError);
      // Continue with existing results even if Tavily fails
    }
  }

  return {
    ...state,
    primaryDocs: primary,
    spilloverDocs: spillover,
    tavilyResults,
    usedTavily,
  };
}

/**
 * Node 3: Safety Guard
 * Checks for red flags and sets safety level
 */
export function safetyGuardNode (state: GraphState): GraphState {
  logger.log('Running Safety Guard');

  if (state.intent !== 'symptom') {
    return { ...state, safetyLevel: 'self-care' };
  }

  // Red flag list - serious symptoms requiring immediate medical attention
  const redFlags = [
    'chest pain',
    'fainting',
    'blood in stool',
    'uncontrolled vomiting',
    'severe dehydration',
  ];

  const userTextLower = state.userQuery.toLowerCase();
  const allDocs = [...(state.primaryDocs || []), ...(state.spilloverDocs || [])];

  // Check if user text contains any red flag
  const hasRedFlagInQuery = redFlags.some((flag) => userTextLower.includes(flag));

  // Check if any chunk contains a red flag
  const hasRedFlagInDocs = allDocs.some((doc) => {
    const chunkTextLower = doc.text.toLowerCase();
    return redFlags.some((flag) => chunkTextLower.includes(flag));
  });

  let safetyLevel: 'self-care' | 'caution' | 'seek-care' = 'self-care';

  // Red flag detected → seek-care
  if (hasRedFlagInQuery || hasRedFlagInDocs) {
    safetyLevel = 'seek-care';
    logger.log('Red flag detected → seek-care');
  }
  // Check for moderate/prolonged symptoms → caution
  else if (
    userTextLower.includes('moderate') ||
    userTextLower.includes('>48h') ||
    userTextLower.includes('more than 48 hours') ||
    userTextLower.includes('several days')
  ) {
    safetyLevel = 'caution';
    logger.log('Moderate or prolonged symptoms → caution');
  }

  logger.log(`Safety level set to: ${safetyLevel}`);

  return { ...state, safetyLevel };
}

/**
 * Node 4: Answer Synthesizer
 * Generates structured response using LLM (symptom vs food mode)
 */
export async function answerSynthesizerNode (
  state: GraphState,
  llmService: LlmChatService,
  foodTrackingService?: any,
  userId?: string,
  dietPlanModel?: Model<any>,
): Promise<GraphState> {
  logger.log('Running Answer Synthesizer');

  // Handle food-logging intent separately
  if (state.intent === 'food-logging') {
    if (state.foodLogging?.logged && state.foodLogging?.loggedItems && state.foodLogging.loggedItems.length > 0) {
      const loggedItems = state.foodLogging.loggedItems;
      const progress = state.foodLogging.progress;
      const mealType = loggedItems[0]?.mealType || 'snack';

      // Calculate total nutrition for all items
      const totalNutrition = loggedItems.reduce(
        (acc, item) => ({
          calories: acc.calories + (item.nutrition.calories || 0),
          protein: acc.protein + (item.nutrition.protein || 0),
          carbs: acc.carbs + (item.nutrition.carbs || 0),
          fat: acc.fat + (item.nutrition.fat || 0),
          fiber: acc.fiber + (item.nutrition.fiber || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      );

      // Generate feedback message
      const itemNames = loggedItems.map((item) => item.foodName).join(', ');
      let summary = `✅ I've logged ${loggedItems.length} item${loggedItems.length > 1 ? 's' : ''} for your ${mealType}!\n\n`;
      summary += `**Items logged:** ${itemNames}\n\n`;
      summary += `**Total Nutrition logged:**\n`;
      summary += `- Calories: ${totalNutrition.calories}\n`;
      summary += `- Protein: ${totalNutrition.protein}g\n`;
      summary += `- Carbs: ${totalNutrition.carbs}g\n`;
      summary += `- Fat: ${totalNutrition.fat}g\n`;
      summary += `- Fiber: ${totalNutrition.fiber}g\n\n`;

      // Show individual items if multiple
      if (loggedItems.length > 1) {
        summary += `**Individual items:**\n`;
        loggedItems.forEach((item, index) => {
          summary += `${index + 1}. ${item.foodName}: ${item.nutrition.calories} cal, ${item.nutrition.protein}g protein, ${item.nutrition.carbs}g carbs, ${item.nutrition.fat}g fat, ${item.nutrition.fiber}g fiber\n`;
        });
        summary += `\n`;
      }

      if (progress) {
        summary += `**Today's Progress:**\n`;
        summary += `- Calories: ${progress.caloriesProgress}% of target (${progress.remaining.calories} remaining)\n`;
        summary += `- Protein: ${progress.proteinProgress}% of target (${progress.remaining.protein}g remaining)\n`;
        summary += `- Carbs: ${progress.carbsProgress}% of target (${progress.remaining.carbs}g remaining)\n`;
        summary += `- Fat: ${progress.fatProgress}% of target (${progress.remaining.fat}g remaining)\n`;
        summary += `- Fiber: ${progress.fiberProgress}% of target (${progress.remaining.fiber}g remaining)\n\n`;

        // Add tips
        const tips: string[] = [];
        if (progress.caloriesProgress > 100) {
          tips.push('You\'ve exceeded your daily calorie target. Consider lighter meals for the rest of the day.');
        } else if (progress.caloriesProgress >= 80) {
          tips.push('Great progress! You\'re close to your daily targets.');
        }

        if (progress.proteinProgress < 50) {
          tips.push('Consider adding more protein-rich foods to meet your target.');
        }

        if (tips.length > 0) {
          summary += `**Tips:**\n${tips.map((t) => `- ${t}`).join('\n')}\n`;
        }
      } else {
        summary += `💡 Create a diet plan to track your progress and get personalized recommendations!`;
      }

      // Use first item for backward compatibility in foodLogged field
      const firstItem = loggedItems[0];
      const foodLoggingResponse: AgentResponse = {
        intent: 'food-logging',
        summary,
        citations: [],
        foodLogged: {
          foodName: loggedItems.length > 1 ? itemNames : firstItem.foodName,
          mealType,
          nutrition: {
            calories: totalNutrition.calories,
            protein: totalNutrition.protein,
            carbs: totalNutrition.carbs,
            fat: totalNutrition.fat,
            fiber: totalNutrition.fiber,
          },
          progress,
        },
      };

      return { ...state, response: foodLoggingResponse };
    } else if (state.foodLogging?.logged && state.foodLogging?.nutrition) {
      // Fallback to single item (backward compatibility)
      const nutrition = state.foodLogging.nutrition;
      const extractedFood = state.foodLogging.extractedFood!;
      const progress = state.foodLogging.progress;

      // Generate feedback message
      let summary = `✅ I've logged ${nutrition.name} for your ${extractedFood.mealType}!\n\n`;
      summary += `**Nutrition logged:**\n`;
      summary += `- Calories: ${nutrition.calories}\n`;
      summary += `- Protein: ${nutrition.protein}g\n`;
      summary += `- Carbs: ${nutrition.carbs}g\n`;
      summary += `- Fat: ${nutrition.fat}g\n`;
      summary += `- Fiber: ${nutrition.fiber}g\n\n`;

      if (progress) {
        summary += `**Today's Progress:**\n`;
        summary += `- Calories: ${progress.caloriesProgress}% of target (${progress.remaining.calories} remaining)\n`;
        summary += `- Protein: ${progress.proteinProgress}% of target (${progress.remaining.protein}g remaining)\n`;
        summary += `- Carbs: ${progress.carbsProgress}% of target (${progress.remaining.carbs}g remaining)\n`;
        summary += `- Fat: ${progress.fatProgress}% of target (${progress.remaining.fat}g remaining)\n`;
        summary += `- Fiber: ${progress.fiberProgress}% of target (${progress.remaining.fiber}g remaining)\n\n`;

        // Add tips
        const tips: string[] = [];
        if (progress.caloriesProgress > 100) {
          tips.push('You\'ve exceeded your daily calorie target. Consider lighter meals for the rest of the day.');
        } else if (progress.caloriesProgress >= 80) {
          tips.push('Great progress! You\'re close to your daily targets.');
        }

        if (progress.proteinProgress < 50) {
          tips.push('Consider adding more protein-rich foods to meet your target.');
        }

        if (tips.length > 0) {
          summary += `**Tips:**\n${tips.map((t) => `- ${t}`).join('\n')}\n`;
        }
      } else {
        summary += `💡 Create a diet plan to track your progress and get personalized recommendations!`;
      }

      const foodLoggingResponse: AgentResponse = {
        intent: 'food-logging',
        summary,
        citations: [],
        foodLogged: {
          foodName: nutrition.name,
          mealType: extractedFood.mealType,
          nutrition: {
            calories: nutrition.calories || 0,
            protein: nutrition.protein || 0,
            carbs: nutrition.carbs || 0,
            fat: nutrition.fat || 0,
            fiber: nutrition.fiber || 0,
          },
          progress,
        },
      };

      return { ...state, response: foodLoggingResponse };
    } else {
      // Food logging failed
      const errorResponse: AgentResponse = {
        intent: 'food-logging',
        summary:
          'I had trouble logging your food. Could you please specify the food name and meal type more clearly? For example: "I\'m eating roti for lunch" or "I had paneer for dinner".',
        citations: [],
      };
      return { ...state, response: errorResponse };
    }
  }

  if (state.intent === 'unknown') {
    const unknownResponse: AgentResponse = {
      intent: 'unknown',
      summary:
        'I\'m not sure how to help with that. I can answer questions about health symptoms or nutrition and food. You can also log food by saying "I\'m eating [food] for [meal]".',
      citations: [],
    };
    return { ...state, response: unknownResponse };
  }

  // Prepare context from retrieved documents (limit to ~1500 tokens total)
  const allDocs = [...(state.primaryDocs || []), ...(state.spilloverDocs || [])];

  // Check if we have good results or Tavily results
  const hasGoodDocs = allDocs.length > 0 && allDocs.some((doc) => doc.score >= 0.6);
  const hasTavilyResults = state.tavilyResults && state.tavilyResults.length > 0;

  // Check if this is a permission question with user context
  const isPermissionQuestion = state.intent === 'food' && (
    /can i (have|eat|consume|take)/i.test(state.userQuery) ||
    /should i (have|eat|consume|take)/i.test(state.userQuery) ||
    /is it (ok|okay|fine|good|safe)/i.test(state.userQuery)
  );
  const hasUserContext = state.agentContext?.deterministicState.dietPlan !== undefined;

  // If no good docs and no Tavily results, check if we can still provide personalized advice
  if (!hasGoodDocs && !hasTavilyResults) {
    // For permission questions with user context, we can still provide personalized advice
    // using general nutrition knowledge + user's diet plan context
    if (isPermissionQuestion && hasUserContext) {
      logger.log('No knowledge base docs found, but proceeding with personalized advice using user context');
      // Continue to answer synthesis - the LLM can use general knowledge + user context
    } else {
      // For other queries without docs, return fallback
      const fallbackResponse: AgentResponse = {
        intent: state.intent || 'unknown',
        level: state.safetyLevel,
        summary:
          "I don't have enough information to answer that confidently. Try rephrasing your question or ask about a specific dish or symptom.",
        steps: [
          'Be more specific about the symptom or food item',
          'Check spelling and try different wording',
          'Ask about common topics like bloating, protein sources, or specific Indian dishes',
        ],
        citations: [],
      };

      // Add medical disclaimer for symptom queries
      if (state.intent === 'symptom') {
        fallbackResponse.cautions = [
          'This is not medical advice. Seek professional care for severe or persistent symptoms.',
        ];
      }

      return { ...state, response: fallbackResponse };
    }
  }

  // Include Tavily results in context if available
  let tavilyContext = '';
  if (hasTavilyResults && state.tavilyResults) {
    tavilyContext = '\n\n**Internet Search Results:**\n';
    state.tavilyResults.slice(0, 3).forEach((result, idx) => {
      tavilyContext += `\n[Source ${idx + 1}: ${result.title}]\n${result.content.substring(0, 500)}\n`;
    });
    tavilyContext += '\n*Note: This information was retrieved from internet search.*\n';
  }

  // Truncate excerpts to stay under ~1500 tokens (~6000 chars)
  const maxTotalChars = 6000;
  const excerpts: string[] = [];
  let currentChars = 0;

  for (let idx = 0; idx < Math.min(allDocs.length, 5); idx++) {
    const doc = allDocs[idx];
    const title = `Document ${idx + 1}`;
    const section = doc.meta?.section || 'General';

    // Calculate how many chars we can still add
    const remainingChars = maxTotalChars - currentChars;
    if (remainingChars < 100) break; // Not enough space for meaningful content

    // Truncate text to fit remaining space, but at least 200 chars per doc
    const maxDocChars = Math.min(remainingChars - 50, 800);
    const truncatedText = doc.text.substring(0, maxDocChars);

    const excerpt = `[${title}/${section}]\n${truncatedText}`;
    excerpts.push(excerpt);
    currentChars += excerpt.length + 10; // +10 for separators
  }

  const excerptText = excerpts.join('\n\n---\n\n');

  // Build citations from docs and Tavily results
  const citations: Array<{ title: string; section?: string; url?: string }> = [];

  // Add knowledge base citations
  allDocs.slice(0, 3).forEach((doc, idx) => {
    citations.push({
      title: `${doc.domain} Knowledge Base Document ${idx + 1}`,
      section: doc.meta?.section || undefined,
    });
  });

  // Add Tavily citations
  if (state.tavilyResults) {
    state.tavilyResults.slice(0, 2).forEach((result) => {
      citations.push({
        title: result.title,
        url: result.url,
      });
    });
  }

  let systemPrompt: string;
  let expectedFormat: string;

  // Build context from agentContext (deterministic state + conversation)
  let deterministicContext = '';
  let conversationContextText = '';

  if (state.agentContext) {
    // Format deterministic state (always accurate)
    deterministicContext = state.agentContext.deterministicState
      ? `\n\n${state.agentContext.deterministicState.dietPlan ? '**User Profile & Diet Plan:**\n' : ''}${state.agentContext.deterministicState.profile?.allergies?.length ? `**Allergies:** ${state.agentContext.deterministicState.profile.allergies.join(', ')}\n` : ''}${state.agentContext.deterministicState.profile?.dietaryRestrictions?.length ? `**Dietary Restrictions:** ${state.agentContext.deterministicState.profile.dietaryRestrictions.join(', ')}\n` : ''}${state.agentContext.deterministicState.dietPlan ? `**Active Diet Plan:** ${state.agentContext.deterministicState.dietPlan.name}\n**Daily Targets:** ${state.agentContext.deterministicState.dietPlan.dailyMacroTargets.calories} cal, ${state.agentContext.deterministicState.dietPlan.dailyMacroTargets.protein}g protein, ${state.agentContext.deterministicState.dietPlan.dailyMacroTargets.carbs}g carbs, ${state.agentContext.deterministicState.dietPlan.dailyMacroTargets.fat}g fat, ${state.agentContext.deterministicState.dietPlan.dailyMacroTargets.fiber}g fiber\n` : ''}${state.agentContext.deterministicState.dietPlan?.goals?.length ? `**Goals:** ${state.agentContext.deterministicState.dietPlan.goals.join(', ')}\n` : ''}${state.agentContext.deterministicState.todayConsumption ? `\n**Today's Consumption:** ${state.agentContext.deterministicState.todayConsumption.calories} cal, ${state.agentContext.deterministicState.todayConsumption.protein}g protein, ${state.agentContext.deterministicState.todayConsumption.carbs}g carbs, ${state.agentContext.deterministicState.todayConsumption.fat}g fat, ${state.agentContext.deterministicState.todayConsumption.fiber}g fiber (${state.agentContext.deterministicState.todayConsumption.mealsLogged} meals)\n` : ''}${state.agentContext.deterministicState.todayConsumption && state.agentContext.deterministicState.dietPlan ? (() => {
        // Note: This is formatting for display, remaining macros are already calculated in ContextBuilderService
        const targets = state.agentContext!.deterministicState.dietPlan!.dailyMacroTargets;
        const consumed = state.agentContext!.deterministicState.todayConsumption!;
        // Calculate remaining inline (this is just for formatting, actual calculation is in FoodLogService)
        const remaining = {
          calories: Math.max(0, targets.calories - consumed.calories),
          protein: Math.max(0, targets.protein - consumed.protein),
          carbs: Math.max(0, targets.carbs - consumed.carbs),
          fat: Math.max(0, targets.fat - consumed.fat),
          fiber: Math.max(0, targets.fiber - consumed.fiber),
        };
        return `**Remaining Today:** ${remaining.calories} cal, ${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat, ${remaining.fiber}g fiber\n`;
      })() : ''}${state.agentContext.deterministicState.rollingWindowStats ? `\n**Last ${state.agentContext.deterministicState.rollingWindowStats.windowDays} Days Average:** ${state.agentContext.deterministicState.rollingWindowStats.averages.calories} cal, ${state.agentContext.deterministicState.rollingWindowStats.averages.protein}g protein, ${state.agentContext.deterministicState.rollingWindowStats.averages.carbs}g carbs, ${state.agentContext.deterministicState.rollingWindowStats.averages.fat}g fat, ${state.agentContext.deterministicState.rollingWindowStats.averages.fiber}g fiber\n**Trend:** ${state.agentContext.deterministicState.rollingWindowStats.trend}\n` : ''}`
      : '';

    // Format conversation context (simple fixed window)
    if (state.agentContext?.conversationContext?.recentMessages?.length > 0) {
      logger.log(`Building conversation context with ${state.agentContext.conversationContext.recentMessages.length} messages`);
      conversationContextText = '\n\n**CRITICAL: Recent Conversation Context - USE THIS TO UNDERSTAND FOLLOW-UP QUESTIONS:**\n';
      state.agentContext.conversationContext.recentMessages.forEach((msg, idx) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        conversationContextText += `${idx + 1}. ${role}: ${msg.text}\n`;
        logger.debug(`Context message ${idx + 1}: ${role} - ${msg.text.substring(0, 50)}...`);
      });
      conversationContextText += '\n**IMPORTANT:** If the current query is a follow-up question (e.g., "will this help?", "what about...?", "do you think...?") and the conversation history shows a symptom discussion, you MUST answer in the context of that symptom discussion, NOT as a general nutrition question.\n';
    } else {
      logger.warn('No conversation context available - agentContext or recentMessages is empty');
    }
  }

  if (state.intent === 'symptom') {
    // Symptom mode
    systemPrompt = `You are a careful health bot. Use ONLY the provided excerpts to answer. Do not diagnose. Include safety note. Be concise and actionable.

Safety Level: ${state.safetyLevel}${deterministicContext}${conversationContextText}
User Query: ${state.userQuery}

Excerpts from knowledge base:
${hasGoodDocs ? excerptText : 'No relevant documents found in knowledge base.'}${tavilyContext}

Instructions:
- Provide a summary in 2 sentences or less
- Include up to 4 actionable steps
- Include up to 2 cautions (MUST include medical disclaimer)
- Reference the source documents${hasTavilyResults ? ' (including internet search sources)' : ''}
${state.agentContext?.conversationContext.recentMessages.length ? '- Consider the conversation history when answering. If the user is following up on a previous question, reference the context appropriately.' : ''}
${state.agentContext?.deterministicState.dietPlan ? '- If relevant, consider how symptoms might relate to the user\'s diet plan' : ''}
${hasTavilyResults ? '- Note that some information came from internet search and should be verified' : ''}

Respond with ONLY valid JSON:`;

    expectedFormat = JSON.stringify({
      intent: 'symptom',
      level: state.safetyLevel,
      summary: '<=2 sentences',
      steps: ['<=4 actionable steps'],
      cautions: ['Medical disclaimer', 'Other caution if needed'],
      citations: citations,
    });
  } else {
    // Food mode
    // isPermissionQuestion is already defined above, reuse it

    const personalizedGuidance = state.agentContext?.deterministicState.dietPlan
      ? `\n\n**CRITICAL: The user is asking for personalized dietary advice. You MUST:**
1. Extract the specific food item and quantity from their query (e.g., "100g of chocolate ice cream")
2. Calculate the macros for that specific food and quantity:
   ${!hasGoodDocs && !hasTavilyResults ? '   - If nutrition data is in the knowledge base excerpts, use that. Otherwise, use your general nutrition knowledge to estimate typical values (e.g., chocolate ice cream: ~200-250 cal per 100g, ~3-4g protein, ~20-25g carbs, ~10-15g fat)' : '   - Use the nutrition information from the knowledge base excerpts'}
3. Compare against their CURRENT STATUS:
   - Today's remaining macros: ${state.agentContext.deterministicState.todayConsumption && state.agentContext.deterministicState.dietPlan ? (() => {
        const targets = state.agentContext!.deterministicState.dietPlan!.dailyMacroTargets;
        const consumed = state.agentContext!.deterministicState.todayConsumption!;
        const remaining = {
          calories: Math.max(0, targets.calories - consumed.calories),
          protein: Math.max(0, targets.protein - consumed.protein),
          carbs: Math.max(0, targets.carbs - consumed.carbs),
          fat: Math.max(0, targets.fat - consumed.fat),
          fiber: Math.max(0, targets.fiber - consumed.fiber),
        };
        return `${remaining.calories} cal, ${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat, ${remaining.fiber}g fiber`;
      })() : 'N/A'}
   - Rolling window trend: ${state.agentContext.deterministicState.rollingWindowStats?.trend || 'N/A'}
   - Their goals: ${state.agentContext.deterministicState.dietPlan.goals?.join(', ') || 'general wellness'}
4. Provide a clear YES/NO recommendation with reasoning:
   - If it fits within remaining macros and aligns with goals → YES, with portion guidance
   - If it exceeds remaining macros → NO, suggest alternatives or smaller portions
   - If it conflicts with dietary restrictions/allergies → NO, explain why
5. Give specific, actionable advice based on their current diet status`
      : '';

    // For permission questions without knowledge base docs, allow using general nutrition knowledge
    const knowledgeBaseNote = !hasGoodDocs && !hasTavilyResults && isPermissionQuestion && hasUserContext
      ? '\n\n**Note:** No specific nutrition data found in knowledge base for this food item. Use your general nutrition knowledge to estimate typical values for the food item mentioned, then provide personalized advice based on the user\'s context below.'
      : '';

    // Check if conversation history contains symptom discussions
    const hasSymptomDiscussion = state.agentContext?.conversationContext.recentMessages.some(
      (msg) => {
        const text = msg.text.toLowerCase();
        return (
          text.includes('bloat') ||
          text.includes('pain') ||
          text.includes('discomfort') ||
          text.includes('ache') ||
          text.includes('symptom') ||
          text.includes('feel') ||
          text.includes('hurting') ||
          text.includes('uncomfortable')
        );
      },
    );

    const isFollowUpQuestion = /(will|would|do you think|can|should).*(help|work|good|better)/i.test(
      state.userQuery,
    );

    // If this is a follow-up about a symptom, prioritize symptom context over diet plan
    const symptomContextNote =
      hasSymptomDiscussion && isFollowUpQuestion
        ? `\n\n**⚠️ CRITICAL OVERRIDE: This is a FOLLOW-UP question about a SYMPTOM discussed in the conversation history.**
**You MUST:**
1. Answer specifically about how the suggested remedy (hot water) relates to the SYMPTOM from the conversation (e.g., bloating)
2. DO NOT provide generic weight loss or diet plan advice
3. Focus on symptom relief and management
4. Reference the specific symptom mentioned in the conversation history
5. Explain how hot water specifically helps with that symptom (e.g., "Hot water can help with bloating by...")
`
        : '';

    // Build the base role description
    const roleDescription = hasSymptomDiscussion && isFollowUpQuestion
      ? 'You are a health advisor helping with a symptom follow-up question. The user is asking about a remedy for a symptom discussed earlier in the conversation.'
      : `You are a knowledgeable nutrition coach.${!hasGoodDocs && !hasTavilyResults && isPermissionQuestion && hasUserContext ? ' Use your general nutrition knowledge combined with the user\'s context to provide personalized advice.' : ' Use ONLY the provided excerpts to answer.'} Focus on food facts, portions, and swaps. Be concise and practical.`;

    // Restructure prompt to prioritize conversation context
    // Put conversation context FIRST and make it mandatory
    let contextPrioritySection = '';
    if (hasSymptomDiscussion && isFollowUpQuestion && state.agentContext?.conversationContext.recentMessages.length > 0) {
      const symptomMessages = state.agentContext.conversationContext.recentMessages.filter(m => {
        const text = m.text.toLowerCase();
        return text.includes('bloat') || text.includes('pain') || text.includes('discomfort') || text.includes('ache') || text.includes('symptom');
      });
      const symptomText = symptomMessages[0]?.text || state.agentContext.conversationContext.recentMessages[0]?.text || 'symptom';

      contextPrioritySection = `\n\n${'='.repeat(80)}\n🚨🚨🚨 MANDATORY: CONVERSATION CONTEXT - READ THIS FIRST 🚨🚨🚨\n${'='.repeat(80)}\n\n**CRITICAL: The user is asking a FOLLOW-UP question about a SYMPTOM discussed earlier in this conversation.**\n\n**Previous Conversation About Symptom:**\n${state.agentContext.conversationContext.recentMessages.map((msg, idx) => {
        const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
        const isSymptomMsg = msg.text.toLowerCase().includes('bloat') || msg.text.toLowerCase().includes('pain') || msg.text.toLowerCase().includes('discomfort');
        return `${idx + 1}. ${role}: ${msg.text}${isSymptomMsg ? ' ⚠️ SYMPTOM MENTIONED' : ''}`;
      }).join('\n')}\n\n**Current Question:** "${state.userQuery}"\n\n**⚠️⚠️⚠️ MANDATORY INSTRUCTIONS - YOU MUST FOLLOW THESE: ⚠️⚠️⚠️**\n\n1. **You MUST answer about how the suggested remedy (hot water) specifically helps with THE SYMPTOM from the conversation above.**\n2. **You MUST mention the symptom word explicitly** (e.g., "bloating", "pain", "discomfort") from the conversation.\n3. **You MUST start your answer by referencing the symptom** (e.g., "Hot water can help with bloating by...")\n4. **DO NOT provide generic weight loss, metabolism, or diet plan advice**\n5. **DO NOT ignore the conversation context**\n\n**Example of CORRECT answer:**\n"Hot water can help with bloating by promoting digestion and reducing gas buildup. Since you mentioned feeling bloated after coffee and food, drinking warm water can..."\n\n**Example of WRONG answer (DO NOT DO THIS):**\n"Drinking hot water has no proven weight-loss benefits; it mainly helps keep you hydrated..."\n\n**If you provide generic advice instead of symptom-specific advice, your response will be REJECTED.**\n\n${'='.repeat(80)}\n\n`;
    } else if (conversationContextText) {
      contextPrioritySection = `\n\n${'='.repeat(80)}\n📋 CONVERSATION CONTEXT - READ THIS FIRST\n${'='.repeat(80)}\n\n${conversationContextText}\n${'='.repeat(80)}\n\n`;
    }

    systemPrompt = `${roleDescription}${contextPrioritySection}${deterministicContext}${symptomContextNote}

User Query: ${state.userQuery}

Excerpts from knowledge base:
${hasGoodDocs ? excerptText : 'No relevant documents found in knowledge base.'}${tavilyContext}${knowledgeBaseNote}

Instructions:
${hasSymptomDiscussion && isFollowUpQuestion ? `- **FIRST PRIORITY: Answer about the SYMPTOM from conversation history (${state.agentContext?.conversationContext.recentMessages.find(m => m.text.toLowerCase().includes('bloat') || m.text.toLowerCase().includes('pain') || m.text.toLowerCase().includes('discomfort'))?.text.substring(0, 50) || 'symptom discussed earlier'})**
- Explain how the current suggestion (hot water) specifically helps with that symptom
- DO NOT provide generic diet plan or weight loss advice
- Focus on symptom relief and management` : `- Provide a summary in 2 sentences or less${isPermissionQuestion ? ' that directly answers their question (YES/NO) with clear reasoning' : ''}
- Include up to 4 concrete tips or swaps${isPermissionQuestion ? ' that are personalized to their current diet status' : ''}`}
- Reference the source documents${hasTavilyResults ? ' (including internet search sources)' : ''}
${state.agentContext?.conversationContext.recentMessages.length ? `- **CRITICAL: The conversation history shows: ${state.agentContext.conversationContext.recentMessages.map(m => m.text).join('; ')}**
  * If the current query is a follow-up question (e.g., "will this help?", "do you think...?") and the conversation history discusses a SYMPTOM (bloating, pain, discomfort, etc.), you MUST answer in the context of that symptom, NOT as a general nutrition question.
  * Reference the specific symptom from the conversation history and explain how your answer relates to it.
  * Do NOT provide generic diet plan advice if the question is clearly about a symptom discussed earlier.` : ''}
${state.agentContext?.deterministicState.dietPlan ? `- IMPORTANT: Consider the user's diet plan when answering:
  * Recommend foods that align with their daily targets (${state.agentContext.deterministicState.dietPlan.dailyMacroTargets.calories} cal, ${state.agentContext.deterministicState.dietPlan.dailyMacroTargets.protein}g protein, etc.)
  * Respect their dietary restrictions: ${state.agentContext.deterministicState.dietPlan.dietaryRestrictions?.join(', ') || 'none'}
  * Avoid their allergies: ${state.agentContext.deterministicState.dietPlan.allergies?.join(', ') || 'none'}
  * Support their goals: ${state.agentContext.deterministicState.dietPlan.goals?.join(', ') || 'general wellness'}
  * Use their current consumption status and remaining macros to make personalized recommendations` : ''}
${isPermissionQuestion && personalizedGuidance ? personalizedGuidance : ''}
${hasTavilyResults ? '- Note that some information came from internet search and should be verified' : ''}

Respond with ONLY valid JSON:`;

    expectedFormat = JSON.stringify({
      intent: 'food',
      summary: '<=2 sentences',
      steps: ['<=4 concrete tips or swaps'],
      citations: citations,
    });
  }

  // If this is a symptom follow-up but intent was classified as food, add explicit override at the VERY TOP
  if (state.intent === 'food' && hasSymptomDiscussion && isFollowUpQuestion) {
    const overrideSection = `\n\n${'='.repeat(80)}\n🚨 CRITICAL OVERRIDE - READ THIS FIRST 🚨\n${'='.repeat(80)}\n\n**INTENT MISCLASSIFICATION DETECTED:**\nEven though this was classified as a "food" query, the conversation history clearly shows the user is asking a FOLLOW-UP question about a SYMPTOM.\n\n**Previous Conversation About Symptom:**\n${state.agentContext?.conversationContext.recentMessages.filter(m => {
      const text = m.text.toLowerCase();
      return text.includes('bloat') || text.includes('pain') || text.includes('discomfort') || text.includes('ache') || text.includes('symptom');
    }).map((msg, idx) => `${idx + 1}. ${msg.role === 'user' ? '👤 User' : '🤖 Assistant'}: ${msg.text}`).join('\n') || 'Symptom discussion from conversation'}\n\n**Current Question:** ${state.userQuery}\n\n**⚠️ MANDATORY INSTRUCTIONS:**\n1. Answer SPECIFICALLY about how the suggested remedy (hot water) helps with THE SYMPTOM from the conversation (e.g., bloating)\n2. DO NOT provide generic weight loss, metabolism, or diet plan advice\n3. Reference the symptom EXPLICITLY in your answer (e.g., "Hot water can help with bloating by...")\n4. Focus on symptom relief, NOT general nutrition\n5. Your answer MUST mention the symptom word (bloating, pain, discomfort, etc.) from the conversation\n\n**If you provide generic diet advice instead of symptom-specific advice, your response will be REJECTED and REGENERATED.**\n\n${'='.repeat(80)}\n\n`;
    // Insert override at the very beginning of the prompt
    systemPrompt = overrideSection + systemPrompt;
  }

  // Log the prompt structure for debugging (first 500 chars)
  if (hasSymptomDiscussion && isFollowUpQuestion) {
    logger.log(`Prompt structure for symptom follow-up (first 500 chars): ${systemPrompt.substring(0, 500)}...`);
    logger.log(`Conversation context included: ${conversationContextText ? 'YES' : 'NO'}, Messages: ${state.agentContext?.conversationContext.recentMessages.length || 0}`);
  }

  const response = await llmService.chatJSON<AgentResponse>(
    systemPrompt,
    expectedFormat,
    expectedFormat,
  );

  if (!response) {
    // Fallback response
    const fallbackResponse: AgentResponse = {
      intent: state.intent || 'unknown',
      level: state.safetyLevel,
      summary: 'I encountered an issue generating a response. Please try rephrasing your question.',
      citations: [],
    };
    return { ...state, response: fallbackResponse };
  }

  // Ensure proper structure
  response.intent = state.intent || 'unknown';
  if (state.intent === 'symptom') {
    response.level = state.safetyLevel;

    // Always add standard medical disclaimer for symptom queries
    if (!response.cautions) {
      response.cautions = [];
    }

    // Always append the standard disclaimer at the end
    response.cautions.push(
      'This is not medical advice. Seek professional care for severe or persistent symptoms.',
    );

    // Limit cautions to 2 (including the disclaimer)
    if (response.cautions.length > 2) {
      // Keep first caution + standard disclaimer
      response.cautions = [response.cautions[0], response.cautions[response.cautions.length - 1]];
    }
  }

  // Limit steps to 4
  if (response.steps && response.steps.length > 4) {
    response.steps = response.steps.slice(0, 4);
  }

  // Ensure citations
  if (!response.citations || response.citations.length === 0) {
    response.citations = citations;
  }

  logger.log('Answer synthesized successfully');

  // Post-processing: Validate that response considers conversation context for follow-up questions
  if (state.agentContext?.conversationContext.recentMessages.length > 0 && response) {
    const isFollowUp = /(will|would|do you think|can|should).*(help|work|good|better)/i.test(state.userQuery);
    const hasSymptomDiscussion = state.agentContext.conversationContext.recentMessages.some((msg) => {
      const text = msg.text.toLowerCase();
      return text.includes('bloat') || text.includes('pain') || text.includes('discomfort') || text.includes('ache') || text.includes('symptom');
    });

    if (isFollowUp && hasSymptomDiscussion) {
      // Check if response mentions the symptom from conversation
      const responseText = (response.summary + ' ' + (response.steps?.join(' ') || '')).toLowerCase();
      const mentionsSymptom = state.agentContext.conversationContext.recentMessages.some((msg) => {
        const symptomWords = ['bloat', 'pain', 'discomfort', 'ache', 'symptom', 'feel'];
        return symptomWords.some(word => msg.text.toLowerCase().includes(word) && responseText.includes(word));
      });

      if (!mentionsSymptom) {
        logger.warn('Response does not reference conversation context for follow-up question. Marking for retry.');
        // Store this in state to trigger retry in reflection node
        state.needsContextRetry = true;
      }
    }
  }

  return { ...state, response };
}

/**
 * Node 5: Reflection & Evaluation
 * Evaluates response quality and determines if retry is needed
 */
export async function reflectionNode (
  state: GraphState,
  evaluationService: EvaluationService,
  reflectionService: ReflectionService,
): Promise<GraphState> {
  logger.log('Running Reflection & Evaluation');

  if (!state.response) {
    logger.warn('No response to evaluate');
    return state;
  }

  const allDocs = [...(state.primaryDocs || []), ...(state.spilloverDocs || [])];

  // Step 1: Calculate evaluation metrics (with conversation context)
  const evaluation = await evaluationService.evaluateResponse(
    state.userQuery,
    state.response,
    allDocs,
    state.agentContext?.conversationContext, // Pass conversation context
  );

  logger.log(
    `Evaluation scores - Relevance: ${evaluation.relevance.toFixed(2)}, Clarity: ${evaluation.clarity.toFixed(2)}, Completeness: ${evaluation.completeness.toFixed(2)}, Overall: ${evaluation.overallScore.toFixed(2)}`,
  );

  // Step 2: Reflect on response quality using LLM (with conversation context)
  const reflection = await reflectionService.reflectOnResponse(
    state.userQuery,
    state.response,
    allDocs,
    evaluation,
    state.agentContext?.conversationContext, // Pass conversation context
  );

  // Add evaluation to response
  const responseWithEvaluation: AgentResponse = {
    ...state.response,
    evaluation,
  };

  logger.log(
    `Reflection complete - Should retry: ${reflection.shouldRetry}, Overall score: ${evaluation.overallScore.toFixed(2)}`,
  );

  return {
    ...state,
    response: responseWithEvaluation,
    evaluation,
    reflection,
  };
}

/**
 * Self-Correction: Re-retrieve and re-synthesize if quality is low
 */
export async function selfCorrectionNode (
  state: GraphState,
  retrieverService: RetrieverService,
  llmService: LlmChatService,
  tavilyService?: TavilyMcpService,
  knowledgeSaverService?: KnowledgeSaverService,
): Promise<GraphState> {
  const maxRetries = 2; // Maximum number of retries
  const retryCount = (state.retryCount || 0) + 1;

  // Check if we should retry
  // Also retry if response ignored conversation context
  const shouldRetry =
    (state.reflection?.shouldRetry || state.needsContextRetry) &&
    retryCount <= maxRetries &&
    state.evaluation &&
    (state.evaluation.overallScore < 0.7 || state.needsContextRetry);

  if (!shouldRetry) {
    if (retryCount > maxRetries) {
      logger.log(`Max retries (${maxRetries}) reached, using current response`);
    } else if (!state.reflection?.shouldRetry) {
      logger.log('Reflection indicates no retry needed');
    }
    return state;
  }

  logger.log(
    `Self-correction triggered (attempt ${retryCount}/${maxRetries}) - Overall score: ${state.evaluation?.overallScore.toFixed(2)}`,
  );

  // Strategy 1: If low relevance, try broader retrieval
  if (state.evaluation && state.evaluation.relevance < 0.6) {
    logger.log('Low relevance detected, attempting broader retrieval');

    // Re-retrieve with more candidates
    // Ensure intent is valid for retrieval (skip food-logging and unknown)
    const retrievalIntent = state.intent && state.intent !== 'unknown' && state.intent !== 'food-logging'
      ? state.intent
      : 'food';
    const { primary, spillover } = await retrieverService.retrieveWithSpillover(
      state.userQuery,
      retrievalIntent as 'symptom' | 'food',
      6, // More primary docs
      2, // More spillover
    );

    // If we got better results, update state
    if (primary.length > 0) {
      const betterDocs = primary.some((doc) => doc.score > 0.5);
      if (betterDocs) {
        logger.log('Found better documents, re-synthesizing');
        state.primaryDocs = primary;
        state.spilloverDocs = spillover;

        // Re-synthesize with better context
        state = await answerSynthesizerNode(state, llmService);
      }
    }

    // If still no good results and Tavily available, try it
    if (
      !state.primaryDocs?.some((doc) => doc.score >= 0.5) &&
      tavilyService &&
      !state.usedTavily
    ) {
      logger.log('Still low relevance, trying Tavily search');
      state = await retrieverNode(state, retrieverService, tavilyService, knowledgeSaverService);
      if (state.tavilyResults && state.tavilyResults.length > 0) {
        state = await answerSynthesizerNode(state, llmService);
      }
    }
  }

  // Strategy 2: If low completeness, enhance the prompt
  if (state.evaluation && state.evaluation.completeness < 0.6 && state.response) {
    logger.log('Low completeness detected, enhancing response');
    // The answer synthesizer already uses comprehensive prompts
    // But we can re-run it with the same context to get a more complete answer
    state = await answerSynthesizerNode(state, llmService);
  }

  // Strategy 3: If response ignored conversation context, force regeneration with stronger context emphasis
  if (state.needsContextRetry && state.response) {
    logger.log('Response ignored conversation context, forcing regeneration with stronger context emphasis');
    // Clear the flag
    state.needsContextRetry = false;
    // Re-synthesize with the same context (the prompt already has strong context emphasis)
    state = await answerSynthesizerNode(state, llmService);
  }

  // Update retry count
  state.retryCount = retryCount;

  return state;
}

/**
 * Execute the full agent graph
 */
export async function runAgentGraph (
  userQuery: string,
  llmService: LlmChatService,
  retrieverService: RetrieverService,
  evaluationService: EvaluationService,
  reflectionService: ReflectionService,
  agentContext?: AgentContext,
  tavilyService?: TavilyMcpService,
  knowledgeSaverService?: KnowledgeSaverService,
  foodTrackingService?: any,
  userId?: string,
  dietPlanModel?: Model<any>,
  foodLogModel?: Model<any>,
): Promise<{ response: AgentResponse; topDocs: RetrievedChunk[]; usedTavily?: boolean; evaluation?: EvaluationMetrics; retryCount?: number }> {
  let state: GraphState = { userQuery, agentContext, retryCount: 0 };

  // Node 0: Context Builder (if context provided, it's already built)
  // Context is built in runChatTurn before calling runAgentGraph

  // Node 1: Intent Classification
  state = await intentClassifierNode(state, llmService);

  // Node 1.5: Food Extraction (if food-logging intent)
  if (state.intent === 'food-logging' && foodTrackingService) {
    state = await foodExtractionNode(state, foodTrackingService);
  }

  // Node 1.6: Nutrition Lookup (if food-logging intent)
  if (
    state.intent === 'food-logging' &&
    foodTrackingService &&
    (state.foodLogging?.extractedFood || state.foodLogging?.extractedFoods)
  ) {
    state = await nutritionLookupNode(state, foodTrackingService);
  }

  // Node 1.7: Food Logging (if food-logging intent)
  if (
    state.intent === 'food-logging' &&
    foodTrackingService &&
    userId &&
    (state.foodLogging?.nutrition || state.foodLogging?.nutritions)
  ) {
    state = await foodLoggingNode(state, foodTrackingService, userId, dietPlanModel, foodLogModel);
  }

  // Node 2: Retrieval (with Tavily fallback) - skip for food-logging
  state = await retrieverNode(state, retrieverService, tavilyService, knowledgeSaverService);

  // Node 3: Safety Guard
  state = safetyGuardNode(state);

  // Node 4: Answer Synthesis
  state = await answerSynthesizerNode(state, llmService, foodTrackingService, userId, dietPlanModel);

  // Node 5: Reflection & Evaluation (skip for food-logging if already logged)
  if (state.intent !== 'food-logging' || !state.foodLogging?.logged) {
    state = await reflectionNode(state, evaluationService, reflectionService);
  } else {
    // For food-logging, create a simple evaluation
    state.evaluation = {
      relevance: 1.0,
      clarity: 1.0,
      completeness: 1.0,
      citationQuality: 0.0, // No citations for food logging
      overallScore: 0.95,
      needsImprovement: false,
    };
  }

  // Node 6: Self-Correction Loop (if needed) - skip for food-logging
  if (state.intent !== 'food-logging') {
    state = await selfCorrectionNode(
      state,
      retrieverService,
      llmService,
      tavilyService,
      knowledgeSaverService,
    );

    // If correction was performed, re-evaluate
    if (state.retryCount && state.retryCount > 0 && state.response) {
      logger.log('Re-evaluating after self-correction');
      state = await reflectionNode(state, evaluationService, reflectionService);
    }
  }

  const allDocs = [...(state.primaryDocs || []), ...(state.spilloverDocs || [])];

  return {
    response: state.response!,
    topDocs: allDocs,
    usedTavily: state.usedTavily,
    evaluation: state.evaluation,
    retryCount: state.retryCount,
  };
}

/**
 * Main function: Run a complete chat turn with persistence
 */
export async function runChatTurn (
  input: ChatTurnInput,
  conversationModel: Model<any>,
  messageModel: Model<any>,
  llmService: LlmChatService,
  retrieverService: RetrieverService,
  evaluationService: EvaluationService,
  reflectionService: ReflectionService,
  tavilyService?: TavilyMcpService,
  knowledgeSaverService?: KnowledgeSaverService,
): Promise<ChatTurnOutput> {
  logger.log(`Running chat turn for user: ${input.userId}`);

  // Step 1: Get or create conversation
  let conversation;
  if (input.convId) {
    conversation = await conversationModel.findById(input.convId).exec();
    if (conversation) {
      conversation.lastAt = new Date();
      await conversation.save();
    }
  }

  if (!conversation) {
    conversation = await conversationModel.create({
      userId: input.userId,
      startedAt: new Date(),
      lastAt: new Date(),
    });
    logger.log(`Created new conversation: ${conversation._id}`);
  }

  // Step 2: Persist user message
  const userMessage = await messageModel.create({
    convId: conversation._id,
    role: 'user',
    text: input.text,
    createdAt: new Date(),
  });
  logger.log(`Saved user message: ${userMessage._id}`);

  // Step 3: Build context using ContextBuilder (deterministic state + conversation)
  let agentContext: AgentContext | undefined;
  if (input.contextBuilderService) {
    try {
      agentContext = await input.contextBuilderService.buildContext(
        input.userId,
        conversation._id.toString(),
        input.dietPlanModel,
        input.foodLogModel,
        input.messageModel,
        conversationModel, // Pass conversation model for summary fetching
      );
      logger.log(
        `Context built: ${agentContext.conversationContext.recentMessages.length} recent messages${agentContext.conversationContext.summary ? ', with summary' : ''}, diet plan: ${agentContext.deterministicState.dietPlan ? 'yes' : 'no'}, rolling stats: ${agentContext.deterministicState.rollingWindowStats ? 'yes' : 'no'}`,
      );
      // Log conversation context for debugging
      if (agentContext.conversationContext.recentMessages.length > 0) {
        logger.log(`Conversation context messages: ${agentContext.conversationContext.recentMessages.map(m => `${m.role}: ${m.text.substring(0, 50)}...`).join(' | ')}`);
      }
    } catch (error) {
      logger.debug('Could not build context, continuing without it', error);
    }
  }

  // Step 4: Run agent graph
  const { response, topDocs, usedTavily, evaluation, retryCount } = await runAgentGraph(
    input.text,
    llmService,
    retrieverService,
    evaluationService,
    reflectionService,
    agentContext,
    tavilyService,
    knowledgeSaverService,
    input.foodTrackingService,
    input.userId,
    input.dietPlanModel,
    input.foodLogModel,
  );

  // Step 5: Persist assistant message with structured data
  const assistantMessage = await messageModel.create({
    convId: conversation._id,
    role: 'assistant',
    text: response.summary,
    json: response,
    intent: response.intent,
    topDocs: topDocs.slice(0, 3).map((doc) => ({
      docId: doc.docId,
      title: `${doc.domain} reference`,
      score: doc.score,
    })),
    createdAt: new Date(),
  });
  logger.log(`Saved assistant message: ${assistantMessage._id}`);
  if (evaluation) {
    logger.log(`Evaluation saved - Overall score: ${evaluation.overallScore.toFixed(2)}, Retries: ${retryCount || 0}`);
  }

  // Step 5.5: Update conversation message count and trigger summarization if needed
  try {
    // Update message count (user + assistant = 2 new messages)
    conversation.messageCount = (conversation.messageCount || 0) + 2;
    conversation.lastAt = new Date();
    await conversation.save();

    // Check if we need to generate/update summaries
    const summarizeAfter = input.configService?.conversationSummarizeAfter || 20;
    if (input.contextBuilderService && conversation.messageCount > summarizeAfter) {
      logger.log(`Conversation has ${conversation.messageCount} messages, triggering summarization (threshold: ${summarizeAfter})`);

      // Trigger summarization asynchronously (don't wait for it)
      input.contextBuilderService.updateConversationSummaries(
        conversation._id.toString(),
        conversation.messageCount,
        messageModel,
        conversationModel,
      ).catch((error) => {
        logger.debug('Failed to update conversation summaries', error);
        // Continue even if summarization fails
      });
    }
  } catch (error) {
    logger.debug('Failed to update conversation metadata', error);
    // Continue even if metadata update fails
  }

  // Step 6: Return structured output
  return {
    convId: conversation._id.toString(),
    messageId: assistantMessage._id.toString(),
    intent: response.intent,
    level: response.level,
    summary: response.summary,
    steps: response.steps,
    cautions: response.cautions,
    citations: response.citations,
    evaluation: evaluation,
    retryCount: retryCount,
    foodLogged: response.foodLogged,
  };
}

// Export as default
export default runChatTurn;

