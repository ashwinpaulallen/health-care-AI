'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Alert,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  CheckCircle as CheckCircleIcon,
  Timeline as TimelineIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  Remove as RemoveIcon,
  Today as TodayIcon,
} from '@mui/icons-material';
import { useParams, useRouter } from 'next/navigation';
import { getDietPlan, getProgress, getFoodLogByDate, DietPlan, ProgressStats, FoodLog } from '../../../diet-api';

export default function ProgressPage() {
  const params = useParams();
  const router = useRouter();
  const userId = 'demo-user';
  const dietPlanId = params.id as string;

  const [dietPlan, setDietPlan] = useState<DietPlan | null>(null);
  const [progress, setProgress] = useState<ProgressStats | null>(null);
  const [todayFoodLog, setTodayFoodLog] = useState<FoodLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [dietPlanId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load diet plan
      const planResponse = await getDietPlan(dietPlanId);
      if (planResponse.success && planResponse.dietPlan) {
        setDietPlan(planResponse.dietPlan);
      } else {
        setError('Diet plan not found');
        return;
      }

      // Load progress
      const progressResponse = await getProgress(userId, dietPlanId);
      if (progressResponse.success) {
        setProgress(progressResponse.progress);
      } else {
        setError('Failed to load progress data');
      }

      // Load today's food log
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const todayLogResponse = await getFoodLogByDate(userId, today);
      if (todayLogResponse.success && todayLogResponse.foodLog) {
        setTodayFoodLog(todayLogResponse.foodLog);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('An error occurred while loading data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <LinearProgress />
      </Container>
    );
  }

  if (error || !dietPlan || !progress) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">{error || 'Failed to load progress'}</Alert>
      </Container>
    );
  }

  const getVarianceColor = (variance: number) => {
    if (Math.abs(variance) <= 50) return 'success';
    if (Math.abs(variance) <= 100) return 'warning';
    return 'error';
  };

  const getVarianceIcon = (variance: number) => {
    if (variance > 0) return <TrendingUpIcon fontSize="small" />;
    if (variance < 0) return <TrendingDownIcon fontSize="small" />;
    return <CheckCircleIcon fontSize="small" />;
  };

  const getTrendIcon = (trend: 'improving' | 'declining' | 'stable') => {
    switch (trend) {
      case 'improving':
        return <ArrowDownwardIcon fontSize="small" sx={{ color: 'success.main' }} />;
      case 'declining':
        return <ArrowUpwardIcon fontSize="small" sx={{ color: 'error.main' }} />;
      default:
        return <RemoveIcon fontSize="small" sx={{ color: 'text.secondary' }} />;
    }
  };

  const getTrendLabel = (trend: 'improving' | 'declining' | 'stable') => {
    switch (trend) {
      case 'improving':
        return 'Improving';
      case 'declining':
        return 'Needs Attention';
      default:
        return 'Stable';
    }
  };

  const getTrendColor = (trend: 'improving' | 'declining' | 'stable') => {
    switch (trend) {
      case 'improving':
        return 'success';
      case 'declining':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Progress Tracking
        </Typography>
        <Typography variant="h6" color="text.secondary">
          {dietPlan.name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          {dietPlan.goals?.map((goal, index) => (
            <Chip key={index} label={goal} size="small" />
          ))}
        </Box>
      </Box>

      {/* Overview Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Days Logged
              </Typography>
              <Typography variant="h4">{progress.totalDaysLogged}</Typography>
              <Typography variant="caption" color="text.secondary">
                out of {dietPlan.durationDays} days
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Days On Track
              </Typography>
              <Typography variant="h4">{progress.daysOnTrack}</Typography>
              <Typography variant="caption" color="text.secondary">
                within 10% of target
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Adherence Rate
              </Typography>
              <Typography variant="h4">{progress.adherenceRate}%</Typography>
              <LinearProgress
                variant="determinate"
                value={progress.adherenceRate}
                color={progress.adherenceRate >= 80 ? 'success' : 'warning'}
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Status
              </Typography>
              <Chip
                label={dietPlan.status}
                color={dietPlan.status === 'active' ? 'success' : 'default'}
                sx={{ mt: 1 }}
              />
              {dietPlan.progress && (
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  Day {dietPlan.progress.daysPassed + 1} of {dietPlan.durationDays}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Today's Progress */}
      <Paper
        sx={{
          p: 3,
          mb: 4,
          background: 'linear-gradient(135deg, rgba(33, 150, 243, 0.1) 0%, rgba(156, 39, 176, 0.1) 100%)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <TodayIcon color="primary" />
          <Typography variant="h6" gutterBottom={false}>
            Today's Progress
          </Typography>
        </Box>

        {todayFoodLog && todayFoodLog.dailySummary ? (
          <Grid container spacing={2}>
            {[
              { label: 'Calories', key: 'calories', unit: 'kcal' },
              { label: 'Protein', key: 'protein', unit: 'g' },
              { label: 'Carbs', key: 'carbs', unit: 'g' },
              { label: 'Fat', key: 'fat', unit: 'g' },
              { label: 'Fiber', key: 'fiber', unit: 'g' },
            ].map(({ label, key, unit }) => {
              const summary = todayFoodLog.dailySummary!;
              const consumed =
                key === 'calories' ? summary.totalCalories :
                key === 'protein' ? summary.totalProtein :
                key === 'carbs' ? summary.totalCarbs :
                key === 'fat' ? summary.totalFat :
                summary.totalFiber;
              const target = (dietPlan.dailyMacroTargets as any)[key] || 0;
              const remaining = Math.max(0, target - consumed);
              const percentage = target > 0 ? (consumed / target) * 100 : 0;
              const variance = consumed - target;

              return (
                <Grid item xs={12} sm={6} md={4} key={key}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        {label}
                      </Typography>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Typography variant="h6">{consumed}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          / {target} {unit}
                        </Typography>
                      </Box>

                      <LinearProgress
                        variant="determinate"
                        value={Math.min(percentage, 100)}
                        color={
                          percentage >= 90 && percentage <= 110
                            ? 'success'
                            : percentage >= 80 && percentage <= 120
                              ? 'warning'
                              : 'error'
                        }
                        sx={{ mb: 1 }}
                      />

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          icon={getVarianceIcon(variance)}
                          label={`${variance > 0 ? '+' : ''}${variance} ${unit}`}
                          size="small"
                          color={getVarianceColor(variance)}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {Math.round(percentage)}% • {remaining > 0 ? `${remaining} ${unit} remaining` : 'Target met!'}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        ) : (
          <Alert severity="info">
            No food logged for today yet. Start tracking your meals to see your daily progress!
          </Alert>
        )}

        {todayFoodLog && todayFoodLog.dailySummary && (
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Typography variant="body2" color="text.secondary">
                  Meals Logged
                </Typography>
                <Typography variant="h6">
                  {todayFoodLog.dailySummary.mealsLogged || todayFoodLog.foods.length}
                </Typography>
              </Grid>
              {todayFoodLog.waterIntake !== undefined && (
                <Grid item xs={12} sm={4}>
                  <Typography variant="body2" color="text.secondary">
                    Water Intake
                  </Typography>
                  <Typography variant="h6">{todayFoodLog.waterIntake} ml</Typography>
                </Grid>
              )}
              <Grid item xs={12} sm={4}>
                <Typography variant="body2" color="text.secondary">
                  Status
                </Typography>
                <Chip
                  label={
                    todayFoodLog.dailySummary.totalCalories >= dietPlan.dailyMacroTargets.calories * 0.9 &&
                    todayFoodLog.dailySummary.totalCalories <= dietPlan.dailyMacroTargets.calories * 1.1
                      ? 'On Track'
                      : todayFoodLog.dailySummary.totalCalories < dietPlan.dailyMacroTargets.calories * 0.9
                        ? 'Below Target'
                        : 'Above Target'
                  }
                  color={
                    todayFoodLog.dailySummary.totalCalories >= dietPlan.dailyMacroTargets.calories * 0.9 &&
                    todayFoodLog.dailySummary.totalCalories <= dietPlan.dailyMacroTargets.calories * 1.1
                      ? 'success'
                      : 'warning'
                  }
                  size="small"
                />
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>

      {/* Rolling Window Summary */}
      {progress.rollingWindow && (
        <Paper
          sx={{
            p: 3,
            mb: 4,
            background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(33, 150, 243, 0.1) 100%)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <TimelineIcon color="primary" />
            <Typography variant="h6" gutterBottom={false}>
              Last {progress.rollingWindow.windowDays} Days Summary
            </Typography>
            <Chip
              icon={getTrendIcon(progress.rollingWindow.trend)}
              label={getTrendLabel(progress.rollingWindow.trend)}
              color={getTrendColor(progress.rollingWindow.trend)}
              size="small"
              sx={{ ml: 'auto' }}
            />
          </Box>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="caption">
                    Days Logged
                  </Typography>
                  <Typography variant="h5">
                    {progress.rollingWindow.daysLogged} / {progress.rollingWindow.windowDays}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="caption">
                    Days On Track
                  </Typography>
                  <Typography variant="h5">{progress.rollingWindow.daysOnTrack}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="caption">
                    Adherence Rate
                  </Typography>
                  <Typography variant="h5">{progress.rollingWindow.adherenceRate}%</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={progress.rollingWindow.adherenceRate}
                    color={progress.rollingWindow.adherenceRate >= 80 ? 'success' : 'warning'}
                    sx={{ mt: 1 }}
                  />
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="caption">
                    Trend
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {getTrendIcon(progress.rollingWindow.trend)}
                    <Typography variant="h6">
                      {getTrendLabel(progress.rollingWindow.trend)}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2, mb: 1 }}>
            Average Daily Intake (Last {progress.rollingWindow.windowDays} Days)
          </Typography>
          <Grid container spacing={2}>
            {[
              { label: 'Calories', key: 'calories', unit: 'kcal' },
              { label: 'Protein', key: 'protein', unit: 'g' },
              { label: 'Carbs', key: 'carbs', unit: 'g' },
              { label: 'Fat', key: 'fat', unit: 'g' },
              { label: 'Fiber', key: 'fiber', unit: 'g' },
            ].map(({ label, key, unit }) => {
              const average = (progress.rollingWindow!.averages as any)[key];
              const target = (progress.rollingWindow!.targets as any)[key];
              const variance = (progress.rollingWindow!.variance as any)[key];
              const percentage = target > 0 ? (average / target) * 100 : 0;

              return (
                <Grid item xs={12} sm={6} md={4} key={key}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        {label}
                      </Typography>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Typography variant="h6">{average}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          / {target} {unit}
                        </Typography>
                      </Box>

                      <LinearProgress
                        variant="determinate"
                        value={Math.min(percentage, 100)}
                        color={
                          percentage >= 90 && percentage <= 110
                            ? 'success'
                            : percentage >= 80 && percentage <= 120
                              ? 'warning'
                              : 'error'
                        }
                        sx={{ mb: 1 }}
                      />

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Chip
                          icon={getVarianceIcon(variance)}
                          label={`${variance > 0 ? '+' : ''}${variance} ${unit}`}
                          size="small"
                          color={getVarianceColor(variance)}
                        />
                        <Typography variant="caption" color="text.secondary">
                          ({Math.round(percentage)}%)
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Paper>
      )}

      {/* Overall Macro Comparison */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Overall Average Daily Intake vs Targets
        </Typography>

        <Grid container spacing={3}>
          {[
            { label: 'Calories', key: 'calories', unit: 'kcal' },
            { label: 'Protein', key: 'protein', unit: 'g' },
            { label: 'Carbs', key: 'carbs', unit: 'g' },
            { label: 'Fat', key: 'fat', unit: 'g' },
            { label: 'Fiber', key: 'fiber', unit: 'g' },
          ].map(({ label, key, unit }) => {
            const average = (progress.averages as any)[key];
            const target = (progress.targets as any)[key];
            const variance = (progress.variance as any)[key];
            const percentage = (average / target) * 100;

            return (
              <Grid item xs={12} sm={6} md={4} key={key}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      {label}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Typography variant="h5">{average}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        / {target} {unit}
                      </Typography>
                    </Box>

                    <LinearProgress
                      variant="determinate"
                      value={Math.min(percentage, 100)}
                      color={
                        percentage >= 90 && percentage <= 110
                          ? 'success'
                          : percentage >= 80 && percentage <= 120
                            ? 'warning'
                            : 'error'
                      }
                      sx={{ mb: 1 }}
                    />

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Chip
                        icon={getVarianceIcon(variance)}
                        label={`${variance > 0 ? '+' : ''}${variance} ${unit}`}
                        size="small"
                        color={getVarianceColor(variance)}
                      />
                      <Typography variant="caption" color="text.secondary">
                        ({Math.round(percentage)}%)
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Paper>

      {/* Insights */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Insights & Recommendations
        </Typography>

        {progress.adherenceRate >= 80 && (
          <Alert severity="success" sx={{ mb: 2 }}>
            <strong>Great job!</strong> You're maintaining excellent adherence to your diet plan.
            Keep up the consistency!
          </Alert>
        )}

        {progress.adherenceRate < 80 && progress.adherenceRate >= 50 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>Good effort!</strong> You're on the right track, but there's room for
            improvement. Try to stay closer to your daily targets.
          </Alert>
        )}

        {progress.adherenceRate < 50 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <strong>Needs attention:</strong> Your adherence rate is below 50%. Consider reviewing
            your plan or adjusting your targets to make them more achievable.
          </Alert>
        )}

        <Grid container spacing={2}>
          {progress.variance.protein < -20 && (
            <Grid item xs={12}>
              <Alert severity="info">
                Your protein intake is lower than target. Consider adding more protein-rich foods
                like dal, paneer, eggs, or chicken to your meals.
              </Alert>
            </Grid>
          )}

          {progress.variance.fiber < -10 && (
            <Grid item xs={12}>
              <Alert severity="info">
                You're not meeting your fiber goals. Include more vegetables, fruits, and whole
                grains in your diet.
              </Alert>
            </Grid>
          )}

          {progress.variance.calories > 200 && (
            <Grid item xs={12}>
              <Alert severity="warning">
                You're consistently exceeding your calorie target. Consider reducing portion sizes
                or choosing lower-calorie alternatives.
              </Alert>
            </Grid>
          )}

          {progress.totalDaysLogged < dietPlan.durationDays * 0.5 && (
            <Grid item xs={12}>
              <Alert severity="info">
                You haven't logged food for many days. Consistent tracking helps you stay on track
                and get better insights!
              </Alert>
            </Grid>
          )}
        </Grid>
      </Paper>
    </Container>
  );
}

