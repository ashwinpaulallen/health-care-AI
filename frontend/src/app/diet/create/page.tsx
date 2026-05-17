'use client';

import { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Paper,
  Grid,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Alert,
  Fade,
  Grow,
  Stepper,
  Step,
  StepLabel,
  Avatar,
  Divider,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Restaurant as RestaurantIcon,
  FitnessCenter as FitnessCenterIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { createDietPlan, MacroTarget } from '../../diet-api';

const COMMON_GOALS = [
  'Weight Loss',
  'Muscle Gain',
  'Diabetes Management',
  'Heart Health',
  'General Wellness',
  'Athletic Performance',
];

const DIETARY_RESTRICTIONS = [
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Dairy-Free',
  'Low-Carb',
  'Keto',
  'Paleo',
];

const COMMON_ALLERGIES = [
  'Peanuts',
  'Tree Nuts',
  'Dairy',
  'Eggs',
  'Soy',
  'Wheat',
  'Fish',
  'Shellfish',
];

export default function CreateDietPlanPage() {
  const router = useRouter();
  const userId = 'demo-user'; // In production, get from auth context

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    durationDays: 30,
    dailyMacroTargets: {
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 65,
      fiber: 30,
    },
    goals: [] as string[],
    dietaryRestrictions: [] as string[],
    allergies: [] as string[],
    notes: '',
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleMacroChange = (macro: keyof MacroTarget, value: number) => {
    setFormData((prev) => ({
      ...prev,
      dailyMacroTargets: {
        ...prev.dailyMacroTargets,
        [macro]: value,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await createDietPlan({
        userId,
        ...formData,
      });

      if (response.success) {
        // Navigate to diet page with a timestamp to force refresh
        router.push(`/diet?refresh=${Date.now()}`);
      } else {
        setError(response.message || 'Failed to create diet plan');
      }
    } catch (err) {
      setError('An error occurred while creating the diet plan');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Fade in timeout={600}>
        <Box>
          <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => router.back()}
              sx={{ minWidth: 'auto' }}
            >
              Back
            </Button>
            <Box sx={{ flex: 1 }}>
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
                Create Diet Plan
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Set up your personalized nutrition plan with daily targets and goals
              </Typography>
            </Box>
          </Box>

          {error && (
            <Fade in timeout={400}>
              <Alert
                severity="error"
                sx={{ mb: 3, borderRadius: 2 }}
                onClose={() => setError(null)}
              >
                {error}
              </Alert>
            </Fade>
          )}

          <Grow in timeout={800}>
            <Paper
              elevation={4}
              sx={{
                p: 4,
                borderRadius: 3,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,1) 100%)',
              }}
            >
              <form onSubmit={handleSubmit}>
                {/* Basic Information */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                  <Avatar sx={{ bgcolor: 'primary.main' }}>
                    <RestaurantIcon />
                  </Avatar>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Basic Information
                  </Typography>
                </Box>

                <TextField
                  fullWidth
                  label="Plan Name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                  sx={{ mb: 2 }}
                  placeholder="e.g., Summer Weight Loss Plan"
                  variant="outlined"
                />

                <TextField
                  fullWidth
                  label="Description"
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  multiline
                  rows={2}
                  sx={{ mb: 2 }}
                  placeholder="Describe your plan goals and approach"
                />

                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Start Date"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => handleChange('startDate', e.target.value)}
                      required
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Duration (days)"
                      type="number"
                      value={formData.durationDays}
                      onChange={(e) => handleChange('durationDays', parseInt(e.target.value))}
                      required
                      inputProps={{ min: 1, max: 365 }}
                    />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 4 }} />

                {/* Daily Macro Targets */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                  <Avatar sx={{ bgcolor: 'secondary.main' }}>
                    <FitnessCenterIcon />
                  </Avatar>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Daily Macro Targets
                  </Typography>
                </Box>

                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Calories (kcal)"
                      type="number"
                      value={formData.dailyMacroTargets.calories}
                      onChange={(e) => handleMacroChange('calories', parseInt(e.target.value))}
                      required
                      inputProps={{ min: 1000, max: 5000 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Protein (g)"
                      type="number"
                      value={formData.dailyMacroTargets.protein}
                      onChange={(e) => handleMacroChange('protein', parseInt(e.target.value))}
                      required
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Carbs (g)"
                      type="number"
                      value={formData.dailyMacroTargets.carbs}
                      onChange={(e) => handleMacroChange('carbs', parseInt(e.target.value))}
                      required
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Fat (g)"
                      type="number"
                      value={formData.dailyMacroTargets.fat}
                      onChange={(e) => handleMacroChange('fat', parseInt(e.target.value))}
                      required
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Fiber (g)"
                      type="number"
                      value={formData.dailyMacroTargets.fiber}
                      onChange={(e) => handleMacroChange('fiber', parseInt(e.target.value))}
                      required
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 4 }} />

                {/* Goals */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                  <Avatar sx={{ bgcolor: 'info.main' }}>
                    <CheckCircleIcon />
                  </Avatar>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Goals
                  </Typography>
                </Box>

                <FormControl fullWidth sx={{ mb: 3 }}>
                  <InputLabel>Select Goals</InputLabel>
                  <Select
                    multiple
                    value={formData.goals}
                    onChange={(e) => handleChange('goals', e.target.value)}
                    input={<OutlinedInput label="Select Goals" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(selected as string[]).map((value) => (
                          <Chip
                            key={value}
                            label={value}
                            size="small"
                            onDelete={() => {
                              handleChange(
                                'goals',
                                formData.goals.filter((item) => item !== value),
                              );
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                            }}
                          />
                        ))}
                      </Box>
                    )}
                  >
                    {COMMON_GOALS.map((goal) => (
                      <MenuItem key={goal} value={goal}>
                        {goal}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Divider sx={{ my: 4 }} />

                {/* Dietary Restrictions */}
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                  Dietary Restrictions
                </Typography>

                <FormControl fullWidth sx={{ mb: 3 }}>
                  <InputLabel>Select Restrictions</InputLabel>
                  <Select
                    multiple
                    value={formData.dietaryRestrictions}
                    onChange={(e) => handleChange('dietaryRestrictions', e.target.value)}
                    input={<OutlinedInput label="Select Restrictions" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(selected as string[]).map((value) => (
                          <Chip
                            key={value}
                            label={value}
                            size="small"
                            onDelete={() => {
                              handleChange(
                                'dietaryRestrictions',
                                formData.dietaryRestrictions.filter((item) => item !== value),
                              );
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                            }}
                          />
                        ))}
                      </Box>
                    )}
                  >
                    {DIETARY_RESTRICTIONS.map((restriction) => (
                      <MenuItem key={restriction} value={restriction}>
                        {restriction}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Divider sx={{ my: 4 }} />

                {/* Allergies */}
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                  Allergies
                </Typography>

                <FormControl fullWidth sx={{ mb: 3 }}>
                  <InputLabel>Select Allergies</InputLabel>
                  <Select
                    multiple
                    value={formData.allergies}
                    onChange={(e) => handleChange('allergies', e.target.value)}
                    input={<OutlinedInput label="Select Allergies" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(selected as string[]).map((value) => (
                          <Chip
                            key={value}
                            label={value}
                            size="small"
                            color="error"
                            onDelete={() => {
                              handleChange(
                                'allergies',
                                formData.allergies.filter((item) => item !== value),
                              );
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                            }}
                          />
                        ))}
                      </Box>
                    )}
                  >
                    {COMMON_ALLERGIES.map((allergy) => (
                      <MenuItem key={allergy} value={allergy}>
                        {allergy}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Divider sx={{ my: 4 }} />

                {/* Notes */}
                <TextField
                  fullWidth
                  label="Additional Notes"
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  multiline
                  rows={3}
                  sx={{ mb: 3 }}
                  placeholder="Any additional information or special considerations"
                />

                {/* Actions */}
                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 4 }}>
                  <Button
                    variant="outlined"
                    onClick={() => router.back()}
                    disabled={loading}
                    sx={{
                      borderRadius: 2,
                      px: 3,
                      textTransform: 'none',
                      fontWeight: 600,
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={loading}
                    size="large"
                    sx={{
                      borderRadius: 2,
                      px: 4,
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
                    {loading ? 'Creating...' : 'Create Diet Plan'}
                  </Button>
                </Box>
              </form>
            </Paper>
          </Grow>
        </Box>
      </Fade>
    </Container>
  );
}

