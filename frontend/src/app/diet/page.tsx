'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Chip,
  Alert,
  Fade,
  Grow,
  Skeleton,
  Avatar,
  IconButton,
  Tooltip,
  Paper,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  TrendingUp as TrendingUpIcon,
  Restaurant as RestaurantIcon,
  LocalFireDepartment as FireIcon,
  FitnessCenter as ProteinIcon,
  Grain as CarbsIcon,
  Opacity as FatIcon,
  FiberManualRecord as FiberIcon,
  CalendarToday as CalendarIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { getActiveDietPlan, getUserDietPlans, DietPlan } from '../diet-api';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export default function DietPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activePlan, setActivePlan] = useState<DietPlan | null>(null);
  const [allPlans, setAllPlans] = useState<DietPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const userId = 'demo-user'; // In production, get from auth context

  const loadDietPlans = useCallback(async () => {
    try {
      setLoading(true);
      
      // Reset state first to ensure fresh data
      setActivePlan(null);
      setAllPlans([]);
      
      // Load active plan
      const activeResponse = await getActiveDietPlan(userId);
      console.log('Active plan response:', activeResponse);
      if (activeResponse.success && activeResponse.dietPlan) {
        console.log('Setting active plan:', activeResponse.dietPlan);
        setActivePlan(activeResponse.dietPlan);
      } else {
        console.log('No active plan found:', activeResponse.message);
        setActivePlan(null);
      }

      // Load all plans
      const allResponse = await getUserDietPlans(userId);
      if (allResponse.success) {
        setAllPlans(allResponse.dietPlans);
      }
    } catch (error) {
      console.error('Failed to load diet plans:', error);
      setActivePlan(null);
      setAllPlans([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadDietPlans();
  }, [pathname, searchParams, loadDietPlans]); // Reload when pathname or search params change

  // Also reload when page becomes visible (user returns to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadDietPlans();
      }
    };

    const handleFocus = () => {
      loadDietPlans();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadDietPlans]);

  const handleCreatePlan = () => {
    router.push('/diet/create');
  };

  const handleViewPlan = (planId: string) => {
    router.push(`/diet/plan/${planId}`);
  };

  const handleLogFood = () => {
    if (activePlan) {
      router.push(`/diet/log?planId=${activePlan.id}`);
    } else {
      router.push('/diet/log');
    }
  };

  const handleViewProgress = () => {
    if (activePlan) {
      router.push(`/diet/progress/${activePlan.id}`);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Skeleton variant="text" width={300} height={40} />
          <Skeleton variant="rectangular" width="100%" height={200} sx={{ mt: 2, borderRadius: 2 }} />
        </Box>
        <Grid container spacing={3}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
      </Container>
    );
  }

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
                My Diet Plans
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Track your nutrition journey and achieve your health goals
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              onClick={handleCreatePlan}
              sx={{
                borderRadius: 3,
                px: 3,
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
              Create New Plan
            </Button>
          </Box>

          {/* Active Plan Section */}
          {activePlan ? (
            <Grow in timeout={800}>
              <Card
                sx={{
                  mb: 4,
                  background: 'linear-gradient(135deg, #2196f3 0%, #4caf50 100%)',
                  color: 'white',
                  borderRadius: 4,
                  boxShadow: 6,
                  overflow: 'hidden',
                  position: 'relative',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
                    pointerEvents: 'none',
                  },
                }}
              >
                <CardContent sx={{ position: 'relative', zIndex: 1 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      mb: 3,
                    }}
                  >
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Avatar
                          sx={{
                            bgcolor: 'rgba(255,255,255,0.2)',
                            width: 48,
                            height: 48,
                          }}
                        >
                          <RestaurantIcon />
                        </Avatar>
                        <Box>
                          <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                            {activePlan.name}
                          </Typography>
                          <Typography variant="body2" sx={{ opacity: 0.9 }}>
                            {activePlan.description}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                    <Chip
                      icon={<CheckIcon />}
                      label="Active"
                      sx={{
                        bgcolor: 'rgba(76, 175, 80, 0.9)',
                        color: 'white',
                        fontWeight: 600,
                      }}
                    />
                  </Box>

                  {activePlan.progress && (
                    <Paper
                      sx={{
                        bgcolor: 'rgba(255,255,255,0.15)',
                        backdropFilter: 'blur(10px)',
                        p: 2,
                        mb: 3,
                        borderRadius: 2,
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CalendarIcon sx={{ fontSize: 20 }} />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Day {activePlan.progress.daysPassed + 1} of {activePlan.durationDays}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {activePlan.progress.progressPercentage}% Complete
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={activePlan.progress.progressPercentage}
                        sx={{
                          height: 10,
                          borderRadius: 5,
                          bgcolor: 'rgba(255,255,255,0.2)',
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 5,
                            bgcolor: 'rgba(255,255,255,0.9)',
                          },
                        }}
                      />
                    </Paper>
                  )}

                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Paper
                        sx={{
                          p: 2,
                          textAlign: 'center',
                          bgcolor: 'rgba(255,255,255,0.15)',
                          backdropFilter: 'blur(10px)',
                          borderRadius: 2,
                          transition: 'all 0.3s',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            bgcolor: 'rgba(255,255,255,0.25)',
                          },
                        }}
                      >
                        <FireIcon sx={{ fontSize: 32, mb: 1, opacity: 0.9 }} />
                        <Typography variant="caption" display="block" sx={{ opacity: 0.8, mb: 0.5 }}>
                          Calories
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          {activePlan.dailyMacroTargets.calories}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Paper
                        sx={{
                          p: 2,
                          textAlign: 'center',
                          bgcolor: 'rgba(255,255,255,0.15)',
                          backdropFilter: 'blur(10px)',
                          borderRadius: 2,
                          transition: 'all 0.3s',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            bgcolor: 'rgba(255,255,255,0.25)',
                          },
                        }}
                      >
                        <ProteinIcon sx={{ fontSize: 32, mb: 1, opacity: 0.9 }} />
                        <Typography variant="caption" display="block" sx={{ opacity: 0.8, mb: 0.5 }}>
                          Protein
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          {activePlan.dailyMacroTargets.protein}g
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Paper
                        sx={{
                          p: 2,
                          textAlign: 'center',
                          bgcolor: 'rgba(255,255,255,0.15)',
                          backdropFilter: 'blur(10px)',
                          borderRadius: 2,
                          transition: 'all 0.3s',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            bgcolor: 'rgba(255,255,255,0.25)',
                          },
                        }}
                      >
                        <CarbsIcon sx={{ fontSize: 32, mb: 1, opacity: 0.9 }} />
                        <Typography variant="caption" display="block" sx={{ opacity: 0.8, mb: 0.5 }}>
                          Carbs
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          {activePlan.dailyMacroTargets.carbs}g
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Paper
                        sx={{
                          p: 2,
                          textAlign: 'center',
                          bgcolor: 'rgba(255,255,255,0.15)',
                          backdropFilter: 'blur(10px)',
                          borderRadius: 2,
                          transition: 'all 0.3s',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            bgcolor: 'rgba(255,255,255,0.25)',
                          },
                        }}
                      >
                        <FatIcon sx={{ fontSize: 32, mb: 1, opacity: 0.9 }} />
                        <Typography variant="caption" display="block" sx={{ opacity: 0.8, mb: 0.5 }}>
                          Fat
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          {activePlan.dailyMacroTargets.fat}g
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Paper
                        sx={{
                          p: 2,
                          textAlign: 'center',
                          bgcolor: 'rgba(255,255,255,0.15)',
                          backdropFilter: 'blur(10px)',
                          borderRadius: 2,
                          transition: 'all 0.3s',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            bgcolor: 'rgba(255,255,255,0.25)',
                          },
                        }}
                      >
                        <FiberIcon sx={{ fontSize: 32, mb: 1, opacity: 0.9 }} />
                        <Typography variant="caption" display="block" sx={{ opacity: 0.8, mb: 0.5 }}>
                          Fiber
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          {activePlan.dailyMacroTargets.fiber}g
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  {activePlan.goals && activePlan.goals.length > 0 && (
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="caption" display="block" gutterBottom sx={{ opacity: 0.8, mb: 1 }}>
                        Goals:
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {activePlan.goals.map((goal, index) => (
                          <Chip
                            key={index}
                            label={goal}
                            size="small"
                            sx={{
                              bgcolor: 'rgba(255,255,255,0.25)',
                              color: 'white',
                              fontWeight: 500,
                              '&:hover': {
                                bgcolor: 'rgba(255,255,255,0.35)',
                              },
                            }}
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <Button
                      variant="contained"
                      size="large"
                      onClick={handleLogFood}
                      sx={{
                        bgcolor: 'rgba(255,255,255,0.9)',
                        color: 'primary.main',
                        fontWeight: 600,
                        borderRadius: 2,
                        px: 3,
                        textTransform: 'none',
                        boxShadow: 2,
                        '&:hover': {
                          bgcolor: 'white',
                          boxShadow: 4,
                          transform: 'translateY(-2px)',
                        },
                        transition: 'all 0.3s ease',
                      }}
                    >
                      Log Food
                    </Button>
                    <Button
                      variant="outlined"
                      size="large"
                      startIcon={<TrendingUpIcon />}
                      onClick={handleViewProgress}
                      sx={{
                        color: 'white',
                        borderColor: 'rgba(255,255,255,0.5)',
                        borderRadius: 2,
                        px: 3,
                        textTransform: 'none',
                        fontWeight: 600,
                        '&:hover': {
                          borderColor: 'white',
                          bgcolor: 'rgba(255,255,255,0.1)',
                          transform: 'translateY(-2px)',
                        },
                        transition: 'all 0.3s ease',
                      }}
                    >
                      View Progress
                    </Button>
                    <Button
                      variant="outlined"
                      size="large"
                      onClick={() => handleViewPlan(activePlan.id)}
                      sx={{
                        color: 'white',
                        borderColor: 'rgba(255,255,255,0.5)',
                        borderRadius: 2,
                        px: 3,
                        textTransform: 'none',
                        fontWeight: 600,
                        '&:hover': {
                          borderColor: 'white',
                          bgcolor: 'rgba(255,255,255,0.1)',
                          transform: 'translateY(-2px)',
                        },
                        transition: 'all 0.3s ease',
                      }}
                    >
                      View Details
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grow>
          ) : (
            <Fade in timeout={600}>
              <Alert
                severity="info"
                sx={{
                  mb: 4,
                  borderRadius: 3,
                  '& .MuiAlert-icon': {
                    fontSize: 32,
                  },
                }}
              >
                <Typography variant="h6" gutterBottom>
                  No Active Diet Plan
                </Typography>
                <Typography variant="body2">
                  Create a personalized diet plan to start tracking your nutrition and achieve your health goals!
                </Typography>
              </Alert>
            </Fade>
          )}

          {/* All Plans Section */}
          {allPlans.length > 0 && (
            <Box sx={{ mt: 6 }}>
              <Typography
                variant="h5"
                gutterBottom
                sx={{
                  mb: 3,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                All Plans
              </Typography>
              <Grid container spacing={3}>
                {allPlans.map((plan, index) => (
                  <Grid item xs={12} sm={6} md={4} key={plan.id}>
                    <Grow in timeout={600 + index * 100}>
                      <Card
                        sx={{
                          height: '100%',
                          cursor: 'pointer',
                          borderRadius: 3,
                          overflow: 'hidden',
                          position: 'relative',
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          '&:hover': {
                            boxShadow: 8,
                            transform: 'translateY(-8px)',
                            '& .plan-gradient': {
                              opacity: 1,
                            },
                          },
                        }}
                        onClick={() => handleViewPlan(plan.id)}
                      >
                        <Box
                          className="plan-gradient"
                          sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: 4,
                            background:
                              plan.status === 'active'
                                ? 'linear-gradient(90deg, #4caf50, #8bc34a)'
                                : plan.status === 'completed'
                                  ? 'linear-gradient(90deg, #2196f3, #03a9f4)'
                                  : 'linear-gradient(90deg, #9e9e9e, #bdbdbd)',
                            opacity: 0.8,
                            transition: 'opacity 0.3s',
                          }}
                        />
                        <CardContent sx={{ pt: 3 }}>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              mb: 2,
                            }}
                          >
                            <Typography
                              variant="h6"
                              component="div"
                              sx={{ fontWeight: 600, pr: 2 }}
                            >
                              {plan.name}
                            </Typography>
                            <Chip
                              label={plan.status}
                              size="small"
                              color={
                                plan.status === 'active'
                                  ? 'success'
                                  : plan.status === 'completed'
                                    ? 'info'
                                    : 'default'
                              }
                              sx={{ fontWeight: 600 }}
                            />
                          </Box>

                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mb: 2, minHeight: 40 }}
                          >
                            {plan.description || 'No description provided'}
                          </Typography>

                          <Divider sx={{ my: 2 }} />

                          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                            <Box>
                              <Typography variant="caption" display="block" color="text.secondary">
                                Duration
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {plan.durationDays} days
                              </Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" display="block" color="text.secondary">
                                Started
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {new Date(plan.startDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </Typography>
                            </Box>
                          </Box>

                          {plan.goals && plan.goals.length > 0 && (
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                              {plan.goals.slice(0, 2).map((goal, idx) => (
                                <Chip
                                  key={idx}
                                  label={goal}
                                  size="small"
                                  sx={{ fontWeight: 500 }}
                                />
                              ))}
                              {plan.goals.length > 2 && (
                                <Chip
                                  label={`+${plan.goals.length - 2}`}
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </Grow>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </Box>
      </Fade>
    </Container>
  );
}

