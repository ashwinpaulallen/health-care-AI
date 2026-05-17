'use client';

import { Box, Typography, Chip, Stack } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { Citation } from '@/app/api';

interface CitationsProps {
  citations: Citation[];
}

export default function Citations({ citations }: CitationsProps) {
  if (!citations || citations.length === 0) return null;

  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}
      >
        <MenuBookIcon fontSize="small" />
        Sources:
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {citations.map((citation, index) => (
          <Chip
            key={index}
            label={citation.section ? `${citation.title} - ${citation.section}` : citation.title}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.75rem' }}
          />
        ))}
      </Stack>
    </Box>
  );
}

