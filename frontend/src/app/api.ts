/**
 * Simple fetch wrapper for backend API calls
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

export interface ChatMessageRequest {
  userId: string;
  convId?: string;
  text: string;
}

export interface Citation {
  title: string;
  section?: string;
}

export interface FoodLoggedData {
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
    proteinProgress?: number;
    carbsProgress?: number;
    fatProgress?: number;
    fiberProgress?: number;
    remaining: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
    };
  };
}

export interface EvaluationMetrics {
  relevance: number;
  clarity: number;
  completeness: number;
  citationQuality: number;
  overallScore: number;
  needsImprovement: boolean;
  feedback?: string;
}

export interface ChatMessageResponse {
  success: boolean;
  convId: string;
  messageId: string;
  intent: 'symptom' | 'food' | 'food-logging' | 'unknown';
  level?: 'self-care' | 'caution' | 'seek-care';
  summary: string;
  steps?: string[];
  cautions?: string[];
  citations: Citation[];
  foodLogged?: FoodLoggedData;
  evaluation?: EvaluationMetrics;
  retryCount?: number;
}

export async function sendChatMessage (
  request: ChatMessageRequest,
): Promise<ChatMessageResponse> {
  const response = await fetch(`${API_BASE}/chat/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  json?: ChatMessageResponse;
  intent?: string;
  createdAt: string;
}

export interface ConversationResponse {
  success: boolean;
  conversation: {
    id: string;
    userId: string;
    startedAt: string;
    lastAt: string;
  };
  messages: ConversationMessage[];
}

export async function getConversation (convId: string): Promise<ConversationResponse> {
  const response = await fetch(`${API_BASE}/chat/conversation/${convId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch conversation: ${response.statusText}`);
  }
  return response.json();
}

export interface ConversationSummary {
  id: string;
  userId: string;
  startedAt: string;
  lastAt: string;
  title?: string;
  messageCount?: number;
}

export interface UserConversationsResponse {
  success: boolean;
  conversations: ConversationSummary[];
}

export async function getUserConversations (userId: string): Promise<UserConversationsResponse> {
  const response = await fetch(`${API_BASE}/chat/user/${userId}/conversations`);
  if (!response.ok) {
    throw new Error(`Failed to fetch conversations: ${response.statusText}`);
  }
  return response.json();
}

export async function deleteConversation (convId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/chat/conversation/${convId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to delete conversation: ${response.statusText}`);
  }
  return response.json();
}

export async function checkHealth (): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/chat/health`);
  if (!response.ok) {
    throw new Error('Health check failed');
  }
  return response.json();
}
