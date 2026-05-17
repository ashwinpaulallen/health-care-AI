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
  Chip,
  Alert,
  Button,
  LinearProgress,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Edit as EditIcon } from '@mui/icons-material';
import { useParams, useRouter } from 'next/navigation';
import { getDietPlan, DietPlan } from '../../../diet-api';

export default function DietPlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.id as string;

  const [dietPlan, setDietPlan] = useState<DietPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDietPlan();
  }, [planId]);

  const loadDietPlan = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await getDietPlan(planId);
      if (response.success && response.dietPlan) {
        setDietPlan(response.dietPlan);
      } else {
        setError('Diet plan not found');
      }
    } catch (err) {
      console.error('Failed to load diet plan:', err);
      setError('Failed to load diet plan');
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

  if (error || !dietPlan) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">{error || 'Diet plan not found'}</Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/diet')}
          sx={{ mt: 2 }}
        >
          Back to Diet Plans
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => router.push('/diet')}
            sx={{ mb: 2 }}
          >
            Back
          </Button>
          <Typography variant="h4" component="h1" gutterBottom>
            {dietPlan.name}
          </Typography>
          {dietPlan.description && (
            <Typography variant="body1" color="text.secondary">
              {dietPlan.description}
            </Typography>
          )}
        </Box>
        <Chip
          label={dietPlan.status}
          color={
            dietPlan.status === 'active'
              ? 'success'
              : dietPlan.status === 'completed'
                ? 'info'
                : 'default'
          }
        />
      </Box>

      <Grid container spacing={3}>
        {/* Left Column: Plan Details */}
        <Grid item xs={12} md={8}>
          {/* Duration & Dates */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Plan Duration
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" display="block" color="text.secondary">
                  Start Date
                </Typography>
                <Typography variant="body1">
                  {new Date(dietPlan.startDate).toLocaleDateString()}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" display="block" color="text.secondary">
                  End Date
                </Typography>
                <Typography variant="body1">
                  {new Date(dietPlan.endDate).toLocaleDateString()}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" display="block" color="text.secondary">
                  Duration
                </Typography>
                <Typography variant="body1">{dietPlan.durationDays} days</Typography>
              </Grid>
            </Grid>

            {dietPlan.progress && (
              <Box sx={{ mt: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">
                    Day {dietPlan.progress.daysPassed + 1} of {dietPlan.durationDays}
                  </Typography>
                  <Typography variant="body2">
                    {dietPlan.progress.progressPercentage}% Complete
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={dietPlan.progress.progressPercentage}
                  sx={{ height: 8, borderRadius: 1 }}
                />
              </Box>
            )}
          </Paper>

          {/* Daily Macro Targets */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Daily Macro Targets
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Calories
                    </Typography>
                    <Typography variant="h5">{dietPlan.dailyMacroTargets.calories}</Typography>
                    <Typography variant="caption">kcal</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Protein
                    </Typography>
                    <Typography variant="h5">{dietPlan.dailyMacroTargets.protein}</Typography>
                    <Typography variant="caption">grams</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Carbs
                    </Typography>
                    <Typography variant="h5">{dietPlan.dailyMacroTargets.carbs}</Typography>
                    <Typography variant="caption">grams</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Fat
                    </Typography>
                    <Typography variant="h5">{dietPlan.dailyMacroTargets.fat}</Typography>
                    <Typography variant="caption">grams</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Fiber
                    </Typography>
                    <Typography variant="h5">{dietPlan.dailyMacroTargets.fiber}</Typography>
                    <Typography variant="caption">grams</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Paper>

          {/* Goals */}
          {dietPlan.goals && dietPlan.goals.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Goals
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {dietPlan.goals.map((goal, index) => (
                  <Chip key={index} label={goal} />
                ))}
              </Box>
            </Paper>
          )}

          {/* Dietary Restrictions */}
          {dietPlan.dietaryRestrictions && dietPlan.dietaryRestrictions.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Dietary Restrictions
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {dietPlan.dietaryRestrictions.map((restriction, index) => (
                  <Chip key={index} label={restriction} color="warning" />
                ))}
              </Box>
            </Paper>
          )}

          {/* Allergies */}
          {dietPlan.allergies && dietPlan.allergies.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Allergies
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {dietPlan.allergies.map((allergy, index) => (
                  <Chip key={index} label={allergy} color="error" />
                ))}
              </Box>
            </Paper>
          )}

          {/* Notes */}
          {dietPlan.notes && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Notes
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {dietPlan.notes}
              </Typography>
            </Paper>
          )}
        </Grid>

        {/* Right Column: Actions */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, position: 'sticky', top: 20 }}>
            <Typography variant="h6" gutterBottom>
              Actions
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dietPlan.status === 'active' && (
                <>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={() => router.push(`/diet/log?planId=${planId}`)}
                  >
                    Log Food
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => router.push(`/diet/progress/${planId}`)}
                  >
                    View Progress
                  </Button>
                </>
              )}
              <Button
                variant="outlined"
                fullWidth
                startIcon={<EditIcon />}
                onClick={() => {
                  // TODO: Navigate to edit page when implemented
                  alert('Edit functionality coming soon!');
                }}
              >
                Edit Plan
              </Button>
              {dietPlan.createdAt && (
                <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" display="block" color="text.secondary">
                    Created: {new Date(dietPlan.createdAt).toLocaleDateString()}
                  </Typography>
                  {dietPlan.updatedAt && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      Updated: {new Date(dietPlan.updatedAt).toLocaleDateString()}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}

