'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Paper,
  Grid,
  Card,
  CardContent,
  IconButton,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  LinearProgress,
  Divider,
  Autocomplete,
  CircularProgress,
  Fade,
  Grow,
  Zoom,
  Stack,
  Badge,
  Avatar,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  Lightbulb as LightbulbIcon,
  Search as SearchIcon,
  Today as TodayIcon,
  CheckCircle as CheckIcon,
  TrendingUp as TrendingUpIcon,
  Restaurant as RestaurantIcon,
  LocalFireDepartment as FireIcon,
  FitnessCenter as ProteinIcon,
  Grain as CarbsIcon,
  Opacity as FatIcon,
  FiberManualRecord as FiberIcon,
} from '@mui/icons-material';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  logFood,
  getFoodLogByDate,
  getRecommendations,
  getActiveDietPlan,
  searchFood,
  getFoodNutrition,
  FoodItem,
  FoodLog,
  DietRecommendation,
  DietPlan,
  FoodNutritionInfo,
} from '../../diet-api';

export default function FoodLogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = 'demo-user';

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [foodLog, setFoodLog] = useState<FoodLog | null>(null);
  const [activePlan, setActivePlan] = useState<DietPlan | null>(null);
  const [recommendations, setRecommendations] = useState<DietRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [searchingFood, setSearchingFood] = useState(false);
  const [loadingNutrition, setLoadingNutrition] = useState(false);
  const [foodSuggestions, setFoodSuggestions] = useState<FoodNutritionInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [newFood, setNewFood] = useState<FoodItem>({
    name: '',
    quantity: '',
    mealType: 'breakfast',
    macros: {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    },
  });

  useEffect(() => {
    loadData();
  }, [date]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load active plan
      const planResponse = await getActiveDietPlan(userId);
      if (planResponse.success && planResponse.dietPlan) {
        setActivePlan(planResponse.dietPlan);
      }

      // Load food log for date
      const logResponse = await getFoodLogByDate(userId, date);
      if (logResponse.success && logResponse.foodLog) {
        setFoodLog(logResponse.foodLog);
      } else {
        setFoodLog(null);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load food log');
    } finally {
      setLoading(false);
    }
  };

  const handleAddFood = async () => {
    if (!newFood.name || !newFood.quantity) {
      setError('Please enter food name and quantity');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await logFood({
        userId,
        dietPlanId: activePlan?.id,
        date,
        food: newFood,
      });

      if (response.success) {
        setFoodLog(response.foodLog || null);
        // Reset form
        setNewFood({
          name: '',
          quantity: '',
          mealType: 'breakfast',
          macros: {
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            fiber: 0,
          },
        });
      } else {
        setError(response.message || 'Failed to log food');
      }
    } catch (err) {
      console.error('Failed to log food:', err);
      setError('An error occurred while logging food');
    } finally {
      setLoading(false);
    }
  };

  const handleGetRecommendations = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if active plan exists first
      if (!activePlan) {
        setError('No active diet plan found. Please create a diet plan first.');
        return;
      }

      const response = await getRecommendations(userId, date);
      console.log('Recommendations response:', response);
      
      if (response.success && response.recommendations) {
        setRecommendations(response.recommendations);
        setShowRecommendations(true);
      } else {
        setError('Failed to get recommendations. Make sure you have an active diet plan.');
      }
    } catch (err) {
      console.error('Failed to get recommendations:', err);
      setError('An error occurred while getting recommendations');
    } finally {
      setLoading(false);
    }
  };

  const calculateProgress = (consumed: number, target: number) => {
    return Math.min((consumed / target) * 100, 100);
  };

  const getProgressColor = (consumed: number, target: number) => {
    const percentage = (consumed / target) * 100;
    if (percentage < 80) return 'warning';
    if (percentage > 110) return 'error';
    return 'success';
  };

  // Search for food and get suggestions
  const handleFoodSearch = async (query: string) => {
    if (!query || query.length < 2) {
      setFoodSuggestions([]);
      return;
    }

    try {
      setSearchingFood(true);
      const response = await searchFood(query);
      if (response.success) {
        setFoodSuggestions(response.foods);
      }
    } catch (err) {
      console.error('Failed to search food:', err);
    } finally {
      setSearchingFood(false);
    }
  };

  // Get nutrition info for selected food
  const handleFoodSelect = async (foodName: string) => {
    if (!foodName) return;

    try {
      setSearchingFood(true);
      setLoadingNutrition(true);
      setError(null); // Clear previous errors
      
      const response = await getFoodNutrition(foodName, newFood.quantity);
      
      if (response.success && response.nutrition) {
        const nutrition = response.nutrition;
        
        // Update state with nutrition data
        setNewFood({
          ...newFood,
          name: nutrition.name || foodName,
          macros: {
            calories: nutrition.calories || 0,
            protein: nutrition.protein || 0,
            carbs: nutrition.carbs || 0,
            fat: nutrition.fat || 0,
            fiber: nutrition.fiber || 0,
          },
        });
        
        setFoodSuggestions([]);
        setSearchQuery('');
        
        // Small delay to ensure state update is rendered before hiding loader
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        // Food not found - show helpful message
        let message = response.message || `Nutrition information for "${foodName}" not found. You can manually enter the values below.`;
        
        // If there are suggestions, add them to the message
        if (response.suggestions && response.suggestions.length > 0) {
          message += `\n\nSimilar foods available: ${response.suggestions.join(', ')}`;
        }
        
        setError(message);
      }
    } catch (err) {
      console.error('Failed to get nutrition:', err);
      setError('Failed to look up nutrition information. Please enter the values manually.');
    } finally {
      setSearchingFood(false);
      // Delay hiding nutrition loader slightly to ensure UI updates
      setTimeout(() => {
        setLoadingNutrition(false);
      }, 150);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        handleFoodSearch(searchQuery);
      } else {
        setFoodSuggestions([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Fade in timeout={600}>
        <Box>
          <Box
            sx={{
              mb: 4,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 2,
            }}
          >
            <Box>
              <Typography
                variant="h4"
                component="h1"
                sx={{
                  fontWeight: 700,
                  background: 'linear-gradient(45deg, #2196f3 30%, #4caf50 90%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  mb: 0.5,
                }}
              >
                Food Log
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Track your daily nutrition intake
              </Typography>
            </Box>
            <Paper
              elevation={2}
              sx={{
                p: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                borderRadius: 2,
              }}
            >
              <TodayIcon color="primary" />
              <TextField
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                size="small"
                variant="standard"
                InputProps={{
                  disableUnderline: true,
                }}
                sx={{
                  '& input': {
                    fontWeight: 600,
                  },
                }}
              />
            </Paper>
          </Box>

          {error && (
            <Zoom in={!!error}>
              <Alert
                severity={error.includes('not found') ? 'warning' : 'error'}
                sx={{ mb: 3, borderRadius: 2, whiteSpace: 'pre-line' }}
                onClose={() => setError(null)}
              >
                {error}
              </Alert>
            </Zoom>
          )}

          <Grid container spacing={3}>
            {/* Left Column: Food Entry */}
            <Grid item xs={12} md={7}>
              <Grow in timeout={600}>
                <Paper
                  elevation={3}
                  sx={{
                    p: 3,
                    mb: 3,
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,1) 100%)',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                    <Avatar sx={{ bgcolor: 'primary.main' }}>
                      <RestaurantIcon />
                    </Avatar>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Log Food
                    </Typography>
                  </Box>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Autocomplete
                  freeSolo
                  options={foodSuggestions}
                  getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
                  loading={searchingFood}
                  onInputChange={(event, newValue) => {
                    setSearchQuery(newValue);
                    setNewFood({ ...newFood, name: newValue });
                  }}
                  onChange={(event, newValue) => {
                    if (newValue && typeof newValue !== 'string') {
                      handleFoodSelect(newValue.name);
                    } else if (typeof newValue === 'string' && newValue) {
                      handleFoodSelect(newValue);
                    }
                  }}
                  value={newFood.name}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Food Name"
                      placeholder="Type to search (e.g., Roti, Dal, Rice)"
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {searchingFood ? <CircularProgress color="inherit" size={20} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                  renderOption={(props, option) => (
                    <Box component="li" {...props}>
                      <Box>
                        <Typography variant="body1">
                          {typeof option === 'string' ? option : option.name}
                        </Typography>
                        {typeof option !== 'string' && option.description && (
                          <Typography variant="caption" color="text.secondary">
                            {option.description}
                          </Typography>
                        )}
                        {typeof option !== 'string' && option.calories && (
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                            • {option.calories} cal
                            {option.protein ? ` • ${option.protein}g protein` : ''}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth
                    label="Quantity"
                    value={newFood.quantity}
                    onChange={(e) => setNewFood({ ...newFood, quantity: e.target.value })}
                    placeholder="e.g., 2 pieces, 1 cup"
                  />
                  <Button
                    variant="outlined"
                    startIcon={<SearchIcon />}
                    onClick={() => {
                      if (newFood.name) {
                        handleFoodSelect(newFood.name);
                      }
                    }}
                    disabled={!newFood.name || searchingFood}
                    sx={{ minWidth: 120 }}
                  >
                    Lookup
                  </Button>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Meal Type</InputLabel>
                  <Select
                    value={newFood.mealType}
                    label="Meal Type"
                    onChange={(e) =>
                      setNewFood({
                        ...newFood,
                        mealType: e.target.value as 'breakfast' | 'lunch' | 'dinner' | 'snack',
                      })
                    }
                  >
                    <MenuItem value="breakfast">Breakfast</MenuItem>
                    <MenuItem value="lunch">Lunch</MenuItem>
                    <MenuItem value="dinner">Dinner</MenuItem>
                    <MenuItem value="snack">Snack</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Time (optional)"
                  type="time"
                  value={newFood.time || ''}
                  onChange={(e) => setNewFood({ ...newFood, time: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item xs={12}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Macros (optional)
                  </Typography>
                  {loadingNutrition && (
                    <CircularProgress size={16} sx={{ ml: 1 }} />
                  )}
                </Box>
              </Grid>

              <Grid item xs={6} sm={4}>
                <TextField
                  fullWidth
                  label="Calories"
                  type="number"
                  size="small"
                  value={newFood.macros?.calories || 0}
                  onChange={(e) =>
                    setNewFood({
                      ...newFood,
                      macros: { ...newFood.macros!, calories: parseInt(e.target.value) || 0 },
                    })
                  }
                  disabled={loadingNutrition}
                />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField
                  fullWidth
                  label="Protein (g)"
                  type="number"
                  size="small"
                  value={newFood.macros?.protein || 0}
                  onChange={(e) =>
                    setNewFood({
                      ...newFood,
                      macros: { ...newFood.macros!, protein: parseInt(e.target.value) || 0 },
                    })
                  }
                  disabled={loadingNutrition}
                />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField
                  fullWidth
                  label="Carbs (g)"
                  type="number"
                  size="small"
                  value={newFood.macros?.carbs || 0}
                  onChange={(e) =>
                    setNewFood({
                      ...newFood,
                      macros: { ...newFood.macros!, carbs: parseInt(e.target.value) || 0 },
                    })
                  }
                  disabled={loadingNutrition}
                />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField
                  fullWidth
                  label="Fat (g)"
                  type="number"
                  size="small"
                  value={newFood.macros?.fat || 0}
                  onChange={(e) =>
                    setNewFood({
                      ...newFood,
                      macros: { ...newFood.macros!, fat: parseInt(e.target.value) || 0 },
                    })
                  }
                  disabled={loadingNutrition}
                />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField
                  fullWidth
                  label="Fiber (g)"
                  type="number"
                  size="small"
                  value={newFood.macros?.fiber || 0}
                  onChange={(e) =>
                    setNewFood({
                      ...newFood,
                      macros: { ...newFood.macros!, fiber: parseInt(e.target.value) || 0 },
                    })
                  }
                  disabled={loadingNutrition}
                />
              </Grid>

                  <Grid item xs={12}>
                    <Button
                      fullWidth
                      variant="contained"
                      size="large"
                      startIcon={<AddIcon />}
                      onClick={handleAddFood}
                      disabled={loading}
                      sx={{
                        borderRadius: 2,
                        py: 1.5,
                        textTransform: 'none',
                        fontWeight: 600,
                        boxShadow: 3,
                        '&:hover': {
                          boxShadow: 6,
                          transform: 'translateY(-2px)',
                        },
                        transition: 'all 0.3s ease',
                      }}
                    >
                      Add Food
                    </Button>
                  </Grid>
                </Grid>
              </Paper>
            </Grow>

              {/* Today's Foods */}
              <Grow in timeout={800}>
                <Paper
                  elevation={3}
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,1) 100%)',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                    <Badge
                      badgeContent={foodLog?.foods.length || 0}
                      color="primary"
                      sx={{
                        '& .MuiBadge-badge': {
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        },
                      }}
                    >
                      <Avatar sx={{ bgcolor: 'secondary.main' }}>
                        <CheckIcon />
                      </Avatar>
                    </Badge>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Today's Foods
                    </Typography>
                  </Box>

                  {!foodLog || foodLog.foods.length === 0 ? (
                    <Fade in timeout={400}>
                      <Alert
                        severity="info"
                        icon={<RestaurantIcon />}
                        sx={{ borderRadius: 2 }}
                      >
                        No foods logged for this date yet. Start logging your meals!
                      </Alert>
                    </Fade>
                  ) : (
                    <Stack spacing={2}>
                      {['breakfast', 'lunch', 'dinner', 'snack'].map((mealType) => {
                        const mealFoods = foodLog.foods.filter((f) => f.mealType === mealType);
                        if (mealFoods.length === 0) return null;

                        return (
                          <Fade in key={mealType} timeout={600}>
                            <Box>
                              <Typography
                                variant="subtitle1"
                                sx={{
                                  fontWeight: 700,
                                  mb: 1.5,
                                  textTransform: 'capitalize',
                                  color: 'primary.main',
                                }}
                              >
                                {mealType}
                              </Typography>
                              <Stack spacing={1}>
                                {mealFoods.map((food, index) => (
                                  <Card
                                    key={index}
                                    variant="outlined"
                                    sx={{
                                      borderRadius: 2,
                                      transition: 'all 0.3s',
                                      '&:hover': {
                                        boxShadow: 4,
                                        transform: 'translateX(4px)',
                                      },
                                    }}
                                  >
                                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <Box sx={{ flex: 1 }}>
                                          <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
                                            {food.name}
                                          </Typography>
                                          <Typography variant="caption" color="text.secondary" display="block">
                                            {food.quantity}
                                            {food.time && ` • ${food.time}`}
                                          </Typography>
                                          {food.macros && food.macros.calories > 0 && (
                                            <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                              <Chip
                                                label={`${food.macros.calories} cal`}
                                                size="small"
                                                color="primary"
                                                variant="outlined"
                                              />
                                              {food.macros.protein > 0 && (
                                                <Chip
                                                  label={`P: ${food.macros.protein}g`}
                                                  size="small"
                                                  variant="outlined"
                                                />
                                              )}
                                              {food.macros.carbs > 0 && (
                                                <Chip
                                                  label={`C: ${food.macros.carbs}g`}
                                                  size="small"
                                                  variant="outlined"
                                                />
                                              )}
                                              {food.macros.fat > 0 && (
                                                <Chip
                                                  label={`F: ${food.macros.fat}g`}
                                                  size="small"
                                                  variant="outlined"
                                                />
                                              )}
                                            </Box>
                                          )}
                                        </Box>
                                      </Box>
                                    </CardContent>
                                  </Card>
                                ))}
                              </Stack>
                            </Box>
                          </Fade>
                        );
                      })}
                    </Stack>
                  )}
                </Paper>
              </Grow>
        </Grid>

            {/* Right Column: Summary & Recommendations */}
            <Grid item xs={12} md={5}>
              {/* Daily Summary */}
              {activePlan && foodLog?.dailySummary && (
                <Grow in timeout={1000}>
                  <Paper
                    elevation={3}
                    sx={{
                      p: 3,
                      mb: 3,
                      borderRadius: 3,
                      background: 'linear-gradient(135deg, rgba(33, 150, 243, 0.1) 0%, rgba(76, 175, 80, 0.1) 100%)',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                      <Avatar sx={{ bgcolor: 'primary.main' }}>
                        <TrendingUpIcon />
                      </Avatar>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Daily Progress
                      </Typography>
                    </Box>

                    <Stack spacing={2.5}>
                      {[
                        { label: 'Calories', key: 'calories', unit: 'kcal', icon: <FireIcon /> },
                        { label: 'Protein', key: 'protein', unit: 'g', icon: <ProteinIcon /> },
                        { label: 'Carbs', key: 'carbs', unit: 'g', icon: <CarbsIcon /> },
                        { label: 'Fat', key: 'fat', unit: 'g', icon: <FatIcon /> },
                        { label: 'Fiber', key: 'fiber', unit: 'g', icon: <FiberIcon /> },
                      ].map(({ label, key, unit, icon }) => {
                        const consumed = (foodLog.dailySummary as any)[`total${key.charAt(0).toUpperCase() + key.slice(1)}`];
                        const target = (activePlan.dailyMacroTargets as any)[key];
                        const progress = calculateProgress(consumed, target);
                        const color = getProgressColor(consumed, target);

                        return (
                          <Box key={key}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {icon}
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {label}
                                </Typography>
                              </Box>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {consumed} / {target} {unit}
                              </Typography>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={progress}
                              color={color}
                              sx={{
                                height: 10,
                                borderRadius: 5,
                                '& .MuiLinearProgress-bar': {
                                  borderRadius: 5,
                                },
                              }}
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                              {Math.round(progress)}% of target
                            </Typography>
                          </Box>
                        );
                      })}
                    </Stack>
                  </Paper>
                </Grow>
              )}

                {/* Get Recommendations Button */}
                {activePlan && (
                  <Zoom in timeout={800}>
                    <Button
                      fullWidth
                      variant="contained"
                      size="large"
                      startIcon={<LightbulbIcon />}
                      onClick={handleGetRecommendations}
                      disabled={loading}
                      sx={{
                        mb: 3,
                        borderRadius: 2,
                        py: 1.5,
                        textTransform: 'none',
                        fontWeight: 600,
                        background: 'linear-gradient(45deg, #ff6b6b 30%, #feca57 90%)',
                        boxShadow: 3,
                        '&:hover': {
                          boxShadow: 6,
                          transform: 'translateY(-2px)',
                          background: 'linear-gradient(45deg, #ff5252 30%, #ffc107 90%)',
                        },
                        transition: 'all 0.3s ease',
                      }}
                    >
                      Get AI Recommendations
                    </Button>
                  </Zoom>
                )}

                {/* Recommendations */}
                {showRecommendations && recommendations && (
                  <Fade in timeout={600}>
                    <Paper
                      elevation={4}
                      sx={{
                        p: 3,
                        borderRadius: 3,
                        background: 'linear-gradient(135deg, rgba(255, 235, 59, 0.1) 0%, rgba(255, 193, 7, 0.1) 100%)',
                        border: '2px solid',
                        borderColor: 'warning.light',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                        <Avatar sx={{ bgcolor: 'warning.main' }}>
                          <LightbulbIcon />
                        </Avatar>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          AI Recommendations
                        </Typography>
                      </Box>

              <Typography variant="body2" paragraph>
                {recommendations.summary}
              </Typography>

              {recommendations.motivationalMessage && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  {recommendations.motivationalMessage}
                </Alert>
              )}

              {recommendations.warnings && recommendations.warnings.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    ⚠️ Warnings
                  </Typography>
                  {recommendations.warnings.map((warning, index) => (
                    <Alert key={index} severity="warning" sx={{ mb: 1 }}>
                      {warning}
                    </Alert>
                  ))}
                </Box>
              )}

              {Object.entries(recommendations.suggestions).map(([mealType, suggestions]) => {
                if (!suggestions || suggestions.length === 0) return null;
                return (
                  <Box key={mealType} sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                    </Typography>
                    {suggestions.map((suggestion, index) => (
                      <Chip
                        key={index}
                        label={suggestion}
                        size="small"
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </Box>
                );
              })}

                      {recommendations.tips && recommendations.tips.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                          <Typography variant="subtitle2" gutterBottom>
                            💡 Tips
                          </Typography>
                          {recommendations.tips.map((tip, index) => (
                            <Typography key={index} variant="body2" sx={{ mb: 0.5 }}>
                              • {tip}
                            </Typography>
                          ))}
                        </Box>
                      )}
                    </Paper>
                  </Fade>
                )}
              </Grid>
            </Grid>
          </Box>
        </Fade>
      </Container>
    );
  }

