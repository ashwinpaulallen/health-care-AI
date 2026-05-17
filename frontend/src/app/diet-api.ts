/**
 * API client for diet plan and food tracking
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

// Types
export interface MacroTarget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface MealPlan {
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  time?: string;
  suggestions: string[];
  macros?: MacroTarget;
}

export interface DietPlan {
  id: string;
  userId: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  dailyMacroTargets: MacroTarget;
  mealPlans?: MealPlan[];
  goals?: string[];
  dietaryRestrictions?: string[];
  allergies?: string[];
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  progress?: {
    daysPassed: number;
    daysRemaining: number;
    progressPercentage: number;
  };
}

export interface FoodItem {
  name: string;
  quantity: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  time?: string;
  macros?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fiber?: number;
  };
  notes?: string;
}

export interface DailySummary {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  mealsLogged: number;
  waterIntake?: number;
}

export interface FoodLog {
  id: string;
  userId: string;
  dietPlanId?: string;
  date: string;
  foods: FoodItem[];
  dailySummary?: DailySummary;
  waterIntake: number;
  notes?: string;
  symptoms?: string[];
  energyLevel?: number;
  hungerLevel?: number;
}

export interface DietRecommendation {
  summary: string;
  remainingMacros: MacroTarget;
  suggestions: {
    breakfast?: string[];
    lunch?: string[];
    dinner?: string[];
    snacks?: string[];
  };
  warnings?: string[];
  tips?: string[];
  motivationalMessage?: string;
}

export interface RollingWindowStats {
  windowDays: number;
  daysLogged: number;
  daysOnTrack: number;
  adherenceRate: number;
  averages: MacroTarget;
  totals: MacroTarget;
  targets: MacroTarget;
  variance: MacroTarget;
  trend: 'improving' | 'declining' | 'stable';
}

export interface ProgressStats {
  totalDaysLogged: number;
  daysOnTrack: number;
  adherenceRate: number;
  averages: MacroTarget;
  targets: MacroTarget;
  variance: MacroTarget;
  rollingWindow?: RollingWindowStats;
}

// Diet Plan APIs
export async function createDietPlan(payload: {
  userId: string;
  name: string;
  description?: string;
  startDate: string;
  durationDays: number;
  dailyMacroTargets: MacroTarget;
  mealPlans?: MealPlan[];
  goals?: string[];
  dietaryRestrictions?: string[];
  allergies?: string[];
  notes?: string;
}): Promise<{ success: boolean; message: string; dietPlan?: any }> {
  const response = await fetch(`${API_BASE}/diet/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function getUserDietPlans(
  userId: string,
  status?: string,
): Promise<{ success: boolean; dietPlans: DietPlan[]; total: number }> {
  let url = `${API_BASE}/diet/plans/user/${userId}`;
  if (status) {
    url += `?status=${encodeURIComponent(status)}`;
  }
  
  const response = await fetch(url);
  return response.json();
}

export async function getDietPlan(id: string): Promise<{ success: boolean; dietPlan: DietPlan }> {
  const response = await fetch(`${API_BASE}/diet/plans/${id}`);
  return response.json();
}

export async function getActiveDietPlan(
  userId: string,
): Promise<{ success: boolean; dietPlan: DietPlan | null }> {
  const response = await fetch(`${API_BASE}/diet/plans/user/${userId}/active`);
  return response.json();
}

export async function updateDietPlan(
  id: string,
  payload: {
    name?: string;
    description?: string;
    dailyMacroTargets?: MacroTarget;
    mealPlans?: MealPlan[];
    goals?: string[];
    dietaryRestrictions?: string[];
    allergies?: string[];
    status?: 'active' | 'completed' | 'paused' | 'cancelled';
    notes?: string;
  },
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/diet/plans/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function deleteDietPlan(id: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/diet/plans/${id}`, {
    method: 'DELETE',
  });
  return response.json();
}

// Food Log APIs
export async function logFood(payload: {
  userId: string;
  dietPlanId?: string;
  date: string;
  food: FoodItem;
}): Promise<{ success: boolean; message: string; foodLog?: FoodLog }> {
  const response = await fetch(`${API_BASE}/diet/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function getFoodLogByDate(
  userId: string,
  date: string,
): Promise<{ success: boolean; foodLog: FoodLog | null }> {
  const response = await fetch(`${API_BASE}/diet/logs/user/${userId}/date/${date}`);
  return response.json();
}

export async function getFoodLogsByRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<{ success: boolean; foodLogs: FoodLog[]; total: number }> {
  const url = `${API_BASE}/diet/logs/user/${userId}/range?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
  
  const response = await fetch(url);
  return response.json();
}

export async function updateFoodLog(
  id: string,
  payload: {
    foods?: FoodItem[];
    waterIntake?: number;
    notes?: string;
    symptoms?: string[];
    energyLevel?: number;
    hungerLevel?: number;
  },
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/diet/logs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

// Recommendations API
export async function getRecommendations(
  userId: string,
  date?: string,
): Promise<{ success: boolean; recommendations: DietRecommendation }> {
  let url = `${API_BASE}/diet/logs/user/${userId}/recommendations`;
  if (date) {
    url += `?date=${encodeURIComponent(date)}`;
  }
  
  const response = await fetch(url);
  return response.json();
}

// Progress API
export async function getProgress(
  userId: string,
  dietPlanId: string,
): Promise<{ success: boolean; progress: ProgressStats }> {
  const response = await fetch(`${API_BASE}/diet/logs/user/${userId}/progress/${dietPlanId}`);
  return response.json();
}

// Rolling Window API
export async function getRollingWindowSummary(
  userId: string,
  date?: string,
  days?: number,
): Promise<{ success: boolean; rollingWindow: RollingWindowStats }> {
  let url = `${API_BASE}/diet/logs/user/${userId}/rolling-window`;
  const params = new URLSearchParams();
  if (date) {
    params.append('date', date);
  }
  if (days) {
    params.append('days', days.toString());
  }
  if (params.toString()) {
    url += `?${params.toString()}`;
  }
  
  const response = await fetch(url);
  return response.json();
}

// Food Search API
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

export async function searchFood(
  query: string,
): Promise<{ success: boolean; foods: FoodNutritionInfo[] }> {
  const url = `${API_BASE}/diet/food-search/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  return response.json();
}

export async function getFoodNutrition(
  foodName: string,
  quantity?: string,
): Promise<{
  success: boolean;
  nutrition?: FoodNutritionInfo;
  message?: string;
  suggestions?: string[];
}> {
  let url = `${API_BASE}/diet/food-search/nutrition?food=${encodeURIComponent(foodName)}`;
  if (quantity) {
    url += `&quantity=${encodeURIComponent(quantity)}`;
  }
  const response = await fetch(url);
  return response.json();
}

