'use client';

import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Alert,
  Stack,
  Divider,
  Grid,
  LinearProgress,
  IconButton,
  Tooltip,
  Fade,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import RefreshIcon from '@mui/icons-material/Refresh';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import { ChatMessageResponse } from '@/app/api';
import Citations from './Citations';

interface AnswerCardProps {
  response: ChatMessageResponse;
  onCopy?: () => void;
  onRegenerate?: () => void;
  onFeedback?: (feedback: 'positive' | 'negative') => void;
  copied?: boolean;
  feedback?: 'positive' | 'negative';
}

export default function AnswerCard({
  response,
  onCopy,
  onRegenerate,
  onFeedback,
  copied,
  feedback,
}: AnswerCardProps) {
  const { intent, level, summary, steps: rawSteps, cautions, citations, foodLogged } = response;

  // Parse steps - handle case where steps might be a single string with numbered items
  const parseSteps = (steps?: string[]): string[] => {
    if (!steps || steps.length === 0) return [];
    
    const parsed: string[] = [];
    steps.forEach((step) => {
      // Remove leading/trailing whitespace and normalize newlines
      const trimmed = step.trim().replace(/\n+/g, ' ').replace(/\s+/g, ' ');
      if (!trimmed) return;
      
      // Check if step contains multiple numbered items (e.g., "1. ... 2. ... 3. ...")
      // Look for pattern: "number. text number. text" (at least 2 numbered items)
      const hasMultipleNumbers = (/\d+\.\s+[^0-9]+\s+\d+\.\s+/).test(trimmed);
      
      if (hasMultipleNumbers) {
        // Split by pattern that matches "number. " at start of new items
        // This regex splits on "number. " but keeps the delimiter using lookahead
        const items = trimmed.split(/(?=\d+\.\s+)/).filter(Boolean);
        items.forEach((item) => {
          // Remove the number prefix (e.g., "1. " or "2. ")
          const cleaned = item.replace(/^\d+\.\s+/, '').trim();
          if (cleaned) parsed.push(cleaned);
        });
      } else if (/^\d+\.\s+/.test(trimmed)) {
        // Single item with number prefix, just remove the number
        const cleaned = trimmed.replace(/^\d+\.\s+/, '').trim();
        if (cleaned) parsed.push(cleaned);
      } else {
        // No number prefix, use as is
        parsed.push(trimmed);
      }
    });
    
    return parsed;
  };

  const steps = parseSteps(rawSteps);

  // Safety level badge for symptom queries
  const getLevelColor = (level?: string) => {
    switch (level) {
      case 'self-care':
        return 'success';
      case 'caution':
        return 'warning';
      case 'seek-care':
        return 'error';
      default:
        return 'default';
    }
  };

  const getLevelIcon = (level?: string) => {
    switch (level) {
      case 'self-care':
        return <CheckCircleOutlineIcon fontSize="small" />;
      case 'caution':
        return <WarningAmberIcon fontSize="small" />;
      case 'seek-care':
        return <LocalHospitalIcon fontSize="small" />;
      default:
        return null;
    }
  };

  // Handle food-logging intent with structured display
  if (intent === 'food-logging' && foodLogged) {
    const { foodName, mealType, nutrition, progress } = foodLogged;
    const mealTypeLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);

    return (
      <Card
        variant="outlined"
        sx={{
          bgcolor: 'background.paper',
          position: 'relative',
          transition: 'all 0.3s ease',
          '&:hover': {
            boxShadow: 4,
            transform: 'translateY(-2px)',
          },
          '&:hover .card-actions': {
            opacity: 1,
          },
        }}
      >
        <CardContent>
          <Stack spacing={2}>
            {/* Header */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip
                icon={<RestaurantIcon />}
                label="🍽️ Food Logged"
                size="small"
                color="success"
                variant="outlined"
              />
              <Chip
                label={mealTypeLabel}
                size="small"
                color="primary"
                variant="outlined"
              />
            </Box>

            {/* Success Message */}
            <Alert severity="success" icon={<CheckCircleOutlineIcon />}>
              <Typography variant="body1" fontWeight="medium">
                ✅ I&apos;ve logged <strong>{foodName}</strong> for your {mealType}!
              </Typography>
            </Alert>

            {/* Nutrition Logged */}
            <Box>
              <Typography variant="subtitle2" gutterBottom fontWeight="bold" sx={{ mb: 1.5 }}>
                📊 Nutrition Logged:
              </Typography>
              <Grid container spacing={1.5}>
                {[
                  { label: 'Calories', value: nutrition.calories, unit: 'kcal' },
                  { label: 'Protein', value: nutrition.protein, unit: 'g' },
                  { label: 'Carbs', value: nutrition.carbs, unit: 'g' },
                  { label: 'Fat', value: nutrition.fat, unit: 'g' },
                  { label: 'Fiber', value: nutrition.fiber, unit: 'g' },
                ].map(({ label, value, unit }) => (
                  <Grid item xs={6} sm={4} key={label}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 1,
                        bgcolor: 'action.hover',
                        textAlign: 'center',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" display="block">
                        {label}
                      </Typography>
                      <Typography variant="h6" fontWeight="bold">
                        {value} {unit}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>

            {/* Today's Progress */}
            {progress && (
              <>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" gutterBottom fontWeight="bold" sx={{ mb: 1.5 }}>
                    📈 Today&apos;s Progress:
                  </Typography>
                  <Stack spacing={2}>
                    {[
                      {
                        label: 'Calories',
                        progress: progress.caloriesProgress,
                        remaining: progress.remaining.calories,
                        unit: 'kcal',
                      },
                      {
                        label: 'Protein',
                        progress: progress.proteinProgress || 0,
                        remaining: progress.remaining.protein,
                        unit: 'g',
                      },
                      {
                        label: 'Carbs',
                        progress: progress.carbsProgress || 0,
                        remaining: progress.remaining.carbs,
                        unit: 'g',
                      },
                      {
                        label: 'Fat',
                        progress: progress.fatProgress || 0,
                        remaining: progress.remaining.fat,
                        unit: 'g',
                      },
                      {
                        label: 'Fiber',
                        progress: progress.fiberProgress || 0,
                        remaining: progress.remaining.fiber,
                        unit: 'g',
                      },
                    ].map(({ label, progress: progressValue, remaining, unit }) => (
                      <Box key={label}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2" fontWeight="medium">
                            {label}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {Math.round(progressValue)}% • {remaining} {unit} remaining
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(progressValue, 100)}
                          color={
                            progressValue >= 90 && progressValue <= 110
                              ? 'success'
                              : progressValue >= 80 && progressValue <= 120
                                ? 'warning'
                                : 'error'
                          }
                          sx={{ height: 8, borderRadius: 1 }}
                        />
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </>
            )}

            {/* Tips */}
            {steps && steps.length > 0 && (
              <>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                    💡 Tips:
                  </Typography>
                  <List dense disablePadding>
                    {steps.map((step, index) => (
                      <ListItem key={index} disablePadding sx={{ py: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Typography variant="body2" color="primary">
                            {index + 1}.
                          </Typography>
                        </ListItemIcon>
                        <ListItemText
                          primary={step}
                          primaryTypographyProps={{ variant: 'body2' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              </>
            )}
          </Stack>
        </CardContent>
        {/* Action buttons */}
        {(onCopy || onRegenerate || onFeedback) && (
          <Box
            className="card-actions"
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              opacity: 0,
              transition: 'opacity 0.2s',
              display: 'flex',
              gap: 0.5,
              bgcolor: 'background.paper',
              borderRadius: 2,
              boxShadow: 2,
              p: 0.5,
            }}
          >
            {onCopy && (
              <Tooltip title={copied ? 'Copied!' : 'Copy response'} arrow>
                <IconButton size="small" onClick={onCopy} sx={{ width: 28, height: 28 }}>
                  {copied ? (
                    <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />
                  ) : (
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              </Tooltip>
            )}
            {onRegenerate && (
              <Tooltip title="Regenerate response" arrow>
                <IconButton size="small" onClick={onRegenerate} sx={{ width: 28, height: 28 }}>
                  <RefreshIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            {onFeedback && (
              <>
                <Tooltip title="Helpful" arrow>
                  <IconButton
                    size="small"
                    onClick={() => onFeedback('positive')}
                    sx={{
                      width: 28,
                      height: 28,
                      color: feedback === 'positive' ? 'success.main' : 'inherit',
                    }}
                  >
                    <ThumbUpIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Not helpful" arrow>
                  <IconButton
                    size="small"
                    onClick={() => onFeedback('negative')}
                    sx={{
                      width: 28,
                      height: 28,
                      color: feedback === 'negative' ? 'error.main' : 'inherit',
                    }}
                  >
                    <ThumbDownIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        )}
      </Card>
    );
  }

  return (
    <Card
      variant="outlined"
      sx={{
        bgcolor: 'background.paper',
        position: 'relative',
        transition: 'all 0.3s ease',
        '&:hover': {
          boxShadow: 4,
          transform: 'translateY(-2px)',
        },
        '&:hover .card-actions': {
          opacity: 1,
        },
      }}
    >
      <CardContent>
        <Stack spacing={2}>
          {/* Header with intent and level */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={intent === 'symptom' ? '🩺 Symptom' : intent === 'food-logging' ? '🍽️ Food Logging' : '🍎 Nutrition'}
              size="small"
              color={intent === 'symptom' ? 'info' : 'success'}
              variant="outlined"
            />
            {level && intent === 'symptom' && (
              <Chip
                icon={getLevelIcon(level)}
                label={level.replace('-', ' ').toUpperCase()}
                size="small"
                color={getLevelColor(level)}
              />
            )}
          </Box>

          {/* Summary */}
          <Typography variant="body1" color="text.primary">
            {summary}
          </Typography>

          {/* Steps */}
          {steps && steps.length > 0 && (
            <>
              <Divider />
              <Box>
                <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                  {intent === 'symptom' ? '📋 Recommendations:' : '💡 Tips:'}
                </Typography>
                <List dense disablePadding>
                  {steps.map((step, index) => (
                    <ListItem key={index} disablePadding sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Typography variant="body2" color="primary">
                          {index + 1}.
                        </Typography>
                      </ListItemIcon>
                      <ListItemText
                        primary={step}
                        primaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            </>
          )}

          {/* Cautions (for symptom queries) */}
          {cautions && cautions.length > 0 && (
            <>
              <Divider />
              <Stack spacing={1}>
                {cautions.map((caution, index) => (
                  <Alert key={index} severity="warning" variant="outlined" sx={{ py: 0 }}>
                    <Typography variant="body2">{caution}</Typography>
                  </Alert>
                ))}
              </Stack>
            </>
          )}

          {/* Citations */}
          {citations && citations.length > 0 && (
            <>
              <Divider />
              <Citations citations={citations} />
            </>
          )}

          {/* Evaluation Score (if available) */}
          {response.evaluation && (
            <>
              <Divider />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Response Quality Score: {Math.round(response.evaluation.overallScore * 100)}%
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    label={`Relevance: ${Math.round(response.evaluation.relevance * 100)}%`}
                    size="small"
                    color={response.evaluation.relevance >= 0.7 ? 'success' : 'default'}
                    variant="outlined"
                    sx={{ fontSize: '0.7rem' }}
                  />
                  <Chip
                    label={`Clarity: ${Math.round(response.evaluation.clarity * 100)}%`}
                    size="small"
                    color={response.evaluation.clarity >= 0.7 ? 'success' : 'default'}
                    variant="outlined"
                    sx={{ fontSize: '0.7rem' }}
                  />
                  <Chip
                    label={`Completeness: ${Math.round(response.evaluation.completeness * 100)}%`}
                    size="small"
                    color={response.evaluation.completeness >= 0.7 ? 'success' : 'default'}
                    variant="outlined"
                    sx={{ fontSize: '0.7rem' }}
                  />
                  {response.retryCount !== undefined && response.retryCount > 0 && (
                    <Chip
                      label={`Retried ${response.retryCount}x`}
                      size="small"
                      color="info"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                  )}
                </Box>
              </Box>
            </>
          )}
        </Stack>
      </CardContent>
      {/* Action buttons */}
      {(onCopy || onRegenerate || onFeedback) && (
        <Box
          className="card-actions"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            opacity: 0,
            transition: 'opacity 0.2s',
            display: 'flex',
            gap: 0.5,
            bgcolor: 'background.paper',
            borderRadius: 2,
            boxShadow: 2,
            p: 0.5,
          }}
        >
          {onCopy && (
            <Tooltip title={copied ? 'Copied!' : 'Copy response'} arrow>
              <IconButton size="small" onClick={onCopy} sx={{ width: 28, height: 28 }}>
                {copied ? (
                  <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />
                ) : (
                  <ContentCopyIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </Tooltip>
          )}
          {onRegenerate && (
            <Tooltip title="Regenerate response" arrow>
              <IconButton size="small" onClick={onRegenerate} sx={{ width: 28, height: 28 }}>
                <RefreshIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          {onFeedback && (
            <>
              <Tooltip title="Helpful" arrow>
                <IconButton
                  size="small"
                  onClick={() => onFeedback('positive')}
                  sx={{
                    width: 28,
                    height: 28,
                    color: feedback === 'positive' ? 'success.main' : 'inherit',
                  }}
                >
                  <ThumbUpIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Not helpful" arrow>
                <IconButton
                  size="small"
                  onClick={() => onFeedback('negative')}
                  sx={{
                    width: 28,
                    height: 28,
                    color: feedback === 'negative' ? 'error.main' : 'inherit',
                  }}
                >
                  <ThumbDownIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      )}
    </Card>
  );
}

