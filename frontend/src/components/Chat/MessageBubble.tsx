'use client';

import { Box, Paper, Typography, IconButton, Tooltip, Stack, Fade } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';

interface MessageBubbleProps {
  message: string;
  role: 'user' | 'assistant';
  timestamp?: Date;
  onCopy?: () => void;
  copied?: boolean;
}

export default function MessageBubble({ message, role, timestamp, onCopy, copied }: MessageBubbleProps) {
  const isUser = role === 'user';

  const formatTime = (date?: Date) => {
    if (!date) return '';
    // Ensure date is a valid Date object
    const dateObj = date instanceof Date ? date : new Date(date);
    // Check if date is valid
    if (isNaN(dateObj.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(dateObj);
  };

  return (
    <Box
      sx={{
        position: 'relative',
        '&:hover .message-actions': {
          opacity: 1,
        },
      }}
    >
      <Paper
        elevation={isUser ? 2 : 1}
        sx={{
          p: 2,
          maxWidth: '100%',
          background: isUser
            ? 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)'
            : 'background.paper',
          color: isUser ? '#ffffff' : 'text.primary',
          borderRadius: 3,
          border: isUser ? 'none' : '1px solid',
          borderColor: 'divider',
          boxShadow: isUser
            ? '0 4px 12px rgba(33, 150, 243, 0.2)'
            : '0 2px 8px rgba(0,0,0,0.08)',
          transition: 'all 0.3s ease',
          '&:hover': {
            boxShadow: isUser
              ? '0 6px 16px rgba(33, 150, 243, 0.3)'
              : '0 4px 12px rgba(0,0,0,0.12)',
            transform: 'translateY(-1px)',
          },
        }}
      >
        <Typography
          variant="body1"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.6,
            color: isUser ? '#ffffff !important' : 'text.primary',
            fontWeight: isUser ? 400 : 'normal',
          }}
        >
          {message || ''}
        </Typography>
        {timestamp && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 1,
              opacity: 0.7,
              fontSize: '0.7rem',
              color: isUser ? 'rgba(255, 255, 255, 0.8)' : 'text.secondary',
            }}
          >
            {formatTime(timestamp)}
          </Typography>
        )}
      </Paper>
      {onCopy && (
        <Box
          className="message-actions"
          sx={{
            position: 'absolute',
            top: 8,
            right: isUser ? 'auto' : 8,
            left: isUser ? 8 : 'auto',
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
          <Tooltip title={copied ? 'Copied!' : 'Copy message'} arrow>
            <IconButton
              size="small"
              onClick={onCopy}
              sx={{
                width: 28,
                height: 28,
                '&:hover': {
                  bgcolor: 'action.hover',
                },
              }}
            >
              {copied ? (
                <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />
              ) : (
                <ContentCopyIcon sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}

