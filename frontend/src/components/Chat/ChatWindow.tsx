'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Stack,
  CircularProgress,
  Alert,
  Fade,
  Grow,
  Paper,
  Typography,
  Avatar,
  Button,
  Chip,
  Tooltip,
  Zoom,
  Collapse,
  Fab,
} from '@mui/material';
import {
  Send as SendIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
  AddComment as NewChatIcon,
  AutoAwesome as SparkleIcon,
  Lightbulb as LightbulbIcon,
} from '@mui/icons-material';
import { useMutation } from '@tanstack/react-query';
import { sendChatMessage, ChatMessageResponse, getConversation, ConversationMessage } from '@/app/api';
import MessageBubble from './MessageBubble';
import AnswerCard from './AnswerCard';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  response?: ChatMessageResponse;
  timestamp?: Date;
  feedback?: 'positive' | 'negative';
}

interface ChatWindowProps {
  initialConvId?: string;
}

export default function ChatWindow ({ initialConvId }: ChatWindowProps) {
  // Track if component is mounted to avoid hydration errors
  const [mounted, setMounted] = useState(false);

  // Initialize messages from localStorage
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chatMessages');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [inputText, setInputText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Initialize convId from localStorage
  const [convId, setConvId] = useState<string | undefined>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('convId') || undefined;
    }
    return undefined;
  });

  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Set mounted to true after component mounts (client-side only)
  useEffect(() => {
    setMounted(true);
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Save to localStorage whenever messages or convId change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chatMessages', JSON.stringify(messages));
      if (convId) {
        localStorage.setItem('convId', convId);
      }
    }
  }, [messages, convId]);

  // Load conversation history on mount or when initialConvId changes
  useEffect(() => {
    const loadConversationHistory = async () => {
      // Prioritize initialConvId (from sidebar selection)
      const targetConvId = initialConvId || (typeof window !== 'undefined' ? localStorage.getItem('convId') : null);

      if (targetConvId) {
        setIsLoadingHistory(true);
        try {
          const response = await getConversation(targetConvId);
          const loadedMessages: Message[] = response.messages.map((m: ConversationMessage) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            text: m.text,
            response: m.json,
            timestamp: m.createdAt ? new Date(m.createdAt) : new Date(),
          }));
          setMessages(loadedMessages);
          setConvId(targetConvId);
        } catch (error) {
          console.error('Failed to load conversation:', error);
          // Clear invalid convId
          if (typeof window !== 'undefined') {
            localStorage.removeItem('convId');
          }
          // If initialConvId failed, clear messages
          if (initialConvId) {
            setMessages([]);
            setConvId(undefined);
          }
        } finally {
          setIsLoadingHistory(false);
        }
      } else {
        // No conversation selected, start fresh
        setMessages([]);
        setConvId(undefined);
        setIsLoadingHistory(false);
      }
    };

    loadConversationHistory();
  }, [initialConvId]); // Re-run when initialConvId changes

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle scroll to show/hide scroll-to-top button
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowScrollTop(scrollTop > 200 && scrollHeight > clientHeight * 1.5);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages]);

  const mutation = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: (response) => {
      // Update convId for subsequent messages
      if (response.convId && !convId) {
        setConvId(response.convId);
      }

      // Add assistant message
      const assistantMessage: Message = {
        id: response.messageId,
        role: 'assistant',
        text: response.summary,
        response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setShowSuggestions(false);
    },
    onError: (error) => {
      console.error('Chat error:', error);
      // Add error message
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        text: 'Sorry, I encountered an error. Please try again.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  const handleSend = () => {
    if (!inputText.trim() || mutation.isPending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: inputText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setShowSuggestions(false);
    inputRef.current?.focus();

    mutation.mutate({
      userId: 'demo-user', // Match userId used in diet system
      convId,
      text: inputText,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    // Clear state
    setMessages([]);
    setConvId(undefined);
    setInputText('');
    setShowSuggestions(true);

    // Clear localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('chatMessages');
      localStorage.removeItem('convId');
    }
  };

  const handleCopyMessage = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleRegenerate = (messageId: string) => {
    // Find the user message before this assistant message
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex > 0) {
      const previousUserMessage = messages[messageIndex - 1];
      if (previousUserMessage.role === 'user') {
        // Remove the assistant message and regenerate
        setMessages((prev) => prev.slice(0, messageIndex));
        mutation.mutate({
          userId: 'demo-user',
          convId,
          text: previousUserMessage.text,
        });
      }
    }
  };

  const handleFeedback = (messageId: string, feedback: 'positive' | 'negative') => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, feedback } : msg))
    );
  };

  const quickSuggestions = [
    { text: "I'm eating roti for lunch", icon: '🍽️', label: 'Log Food' },
    { text: 'What foods are good for diabetes?', icon: '💡', label: 'Nutrition Tips' },
    { text: 'I have a headache, what should I do?', icon: '🏥', label: 'Symptom Help' },
    { text: 'Can I have 100g of chocolate ice cream?', icon: '❓', label: 'Diet Advice' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box
        sx={{
          height: 64,
          px: 2.5,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: 'background.paper',
          flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(33, 150, 243, 0.05) 0%, rgba(76, 175, 80, 0.05) 100%)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            sx={{
              width: 40,
              height: 40,
              background: 'linear-gradient(135deg, #2196f3 0%, #4caf50 100%)',
              boxShadow: '0 2px 8px rgba(33, 150, 243, 0.3)',
            }}
          >
            <BotIcon sx={{ fontSize: 24 }} />
          </Avatar>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Health Bot AI
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              {mounted
                ? mutation.isPending
                  ? 'Processing...'
                  : messages.length > 0
                    ? `${messages.length} messages`
                    : 'Ready to chat'
                : 'Ready to chat'}
            </Typography>
          </Box>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<NewChatIcon />}
          onClick={handleNewChat}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            transition: 'all 0.3s',
            '&:hover': {
              transform: 'translateY(-1px)',
              boxShadow: 2,
            },
          }}
        >
          New Chat
        </Button>
      </Box>

      {/* Messages Area */}
      <Box
        ref={messagesContainerRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 3,
          position: 'relative',
          background: 'linear-gradient(135deg, #f5f7fa 0%, #e8f0f5 50%, #f0f8f5 100%)',
          '&::-webkit-scrollbar': {
            width: '10px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'rgba(0,0,0,0.05)',
            borderRadius: '5px',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '5px',
            '&:hover': {
              background: 'rgba(0,0,0,0.3)',
            },
          },
        }}
      >
        {/* Scroll to top button */}
        {showScrollTop && (
          <Zoom in={showScrollTop}>
            <Fab
              size="small"
              color="primary"
              onClick={() => {
                messagesContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              sx={{
                position: 'absolute',
                bottom: 100,
                right: 24,
                zIndex: 10,
                boxShadow: 4,
                '&:hover': {
                  transform: 'scale(1.1)',
                },
              }}
            >
              ↑
            </Fab>
          </Zoom>
        )}
        {isLoadingHistory && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              Loading conversation history...
            </Typography>
          </Box>
        )}
        {mounted && messages.length === 0 && !isLoadingHistory && (
          <Fade in timeout={800}>
            <Box
              sx={{
                textAlign: 'center',
                py: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                maxWidth: 600,
                mx: 'auto',
              }}
            >
              <Zoom in timeout={600}>
                <Avatar
                  sx={{
                    width: 80,
                    height: 80,
                    background: 'linear-gradient(135deg, #2196f3 0%, #4caf50 100%)',
                    boxShadow: '0 8px 24px rgba(33, 150, 243, 0.3)',
                    mb: 1,
                  }}
                >
                  <BotIcon sx={{ fontSize: 40 }} />
                </Avatar>
              </Zoom>
              <Fade in timeout={800} style={{ transitionDelay: '200ms' }}>
                <Box>
                  <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700, mb: 1 }}>
                    👋 Hello! I&apos;m your Health Bot
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                    Ask me about symptoms, nutrition, or your diet plan! I can help you track food, get personalized advice, and answer health questions.
                  </Typography>
                </Box>
              </Fade>
              <Fade in timeout={800} style={{ transitionDelay: '400ms' }}>
                <Box sx={{ width: '100%' }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, fontWeight: 600 }}>
                    <LightbulbIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
                    Try asking:
                  </Typography>
                  <Stack spacing={1.5} sx={{ width: '100%' }}>
                    {quickSuggestions.map((suggestion, index) => (
                      <Zoom
                        key={index}
                        in
                        timeout={600}
                        style={{ transitionDelay: `${500 + index * 100}ms` }}
                      >
                        <Paper
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            bgcolor: 'background.paper',
                            border: '1px solid',
                            borderColor: 'divider',
                            cursor: 'pointer',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            '&:hover': {
                              bgcolor: 'primary.50',
                              borderColor: 'primary.main',
                              transform: 'translateY(-2px)',
                              boxShadow: '0 4px 12px rgba(33, 150, 243, 0.15)',
                            },
                          }}
                          onClick={() => {
                            setInputText(suggestion.text);
                            inputRef.current?.focus();
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Typography variant="h6" sx={{ fontSize: 24 }}>
                              {suggestion.icon}
                            </Typography>
                            <Box sx={{ flex: 1, textAlign: 'left' }}>
                              <Typography variant="body2" fontWeight={600} color="text.primary">
                                {suggestion.label}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {suggestion.text}
                              </Typography>
                            </Box>
                            <SparkleIcon sx={{ fontSize: 18, color: 'primary.main', opacity: 0.6 }} />
                          </Box>
                        </Paper>
                      </Zoom>
                    ))}
                  </Stack>
                </Box>
              </Fade>
            </Box>
          </Fade>
        )}

        <Stack spacing={3}>
          {mounted && messages.map((message, index) => (
            <Fade in key={message.id} timeout={300 + index * 50}>
              <Box
                sx={{
                  display: 'flex',
                  gap: 1.5,
                  flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                  position: 'relative',
                  '&:hover .message-actions': {
                    opacity: 1,
                  },
                }}
              >
                <Avatar
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor:
                      message.role === 'user'
                        ? 'primary.main'
                        : 'linear-gradient(135deg, #2196f3 0%, #4caf50 100%)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    flexShrink: 0,
                  }}
                >
                  {message.role === 'user' ? (
                    <PersonIcon sx={{ fontSize: 20 }} />
                  ) : (
                    <BotIcon sx={{ fontSize: 20 }} />
                  )}
                </Avatar>
                <Box sx={{ flex: 1, maxWidth: '85%', minWidth: 0 }}>
                  {message.role === 'user' ? (
                    <MessageBubble
                      message={message.text}
                      role={message.role}
                      timestamp={message.timestamp}
                      onCopy={() => handleCopyMessage(message.text, message.id)}
                      copied={copiedMessageId === message.id}
                    />
                  ) : (
                    <>
                      {message.response ? (
                        <AnswerCard
                          response={message.response}
                          onCopy={() => handleCopyMessage(message.text, message.id)}
                          onRegenerate={() => handleRegenerate(message.id)}
                          onFeedback={(feedback) => handleFeedback(message.id, feedback)}
                          copied={copiedMessageId === message.id}
                          feedback={message.feedback}
                        />
                      ) : (
                        <MessageBubble
                          message={message.text}
                          role={message.role}
                          timestamp={message.timestamp}
                          onCopy={() => handleCopyMessage(message.text, message.id)}
                          copied={copiedMessageId === message.id}
                        />
                      )}
                    </>
                  )}
                </Box>
              </Box>
            </Fade>
          ))}
          {mounted && mutation.isPending && (
            <Fade in timeout={400}>
              <Box
                sx={{
                  display: 'flex',
                  gap: 1.5,
                  alignItems: 'flex-start',
                }}
              >
                <Avatar
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor: 'linear-gradient(135deg, #2196f3 0%, #4caf50 100%)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    '@keyframes pulse': {
                      '0%, 100%': {
                        transform: 'scale(1)',
                        opacity: 1,
                      },
                      '50%': {
                        transform: 'scale(1.05)',
                        opacity: 0.8,
                      },
                    },
                    animation: 'pulse 2s ease-in-out infinite',
                  }}
                >
                  <BotIcon sx={{ fontSize: 20 }} />
                </Avatar>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 2.5,
                    bgcolor: 'background.paper',
                    borderRadius: 3,
                    boxShadow: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <CircularProgress size={20} thickness={4} />
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Thinking...
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 0.5,
                      ml: 1,
                      '@keyframes bounce': {
                        '0%, 80%, 100%': { transform: 'scale(0)', opacity: 0.5 },
                        '40%': { transform: 'scale(1)', opacity: 1 },
                      },
                      '& .dot': {
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                        animation: 'bounce 1.4s ease-in-out infinite',
                        '&:nth-of-type(1)': { animationDelay: '0ms' },
                        '&:nth-of-type(2)': { animationDelay: '200ms' },
                        '&:nth-of-type(3)': { animationDelay: '400ms' },
                      },
                    }}
                  >
                    <Box className="dot" />
                    <Box className="dot" />
                    <Box className="dot" />
                  </Box>
                </Box>
              </Box>
            </Fade>
          )}
          <div ref={messagesEndRef} />
        </Stack>
      </Box>

      {/* Quick Suggestions (when no messages) */}
      {mounted && showSuggestions && messages.length === 0 && !isLoadingHistory && (
        <Collapse in={showSuggestions}>
          <Box
            sx={{
              px: 2,
              pb: 1,
              borderTop: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, px: 1 }}>
              Quick suggestions:
            </Typography>
            <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 1, '&::-webkit-scrollbar': { display: 'none' } }}>
              {quickSuggestions.slice(0, 3).map((suggestion, index) => (
                <Chip
                  key={index}
                  label={suggestion.text}
                  size="small"
                  onClick={() => {
                    setInputText(suggestion.text);
                    inputRef.current?.focus();
                  }}
                  sx={{
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: 'primary.50',
                      transform: 'translateY(-1px)',
                    },
                  }}
                />
              ))}
            </Stack>
          </Box>
        </Collapse>
      )}

      {/* Input Area */}
      <Paper
        elevation={8}
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          borderRadius: 0,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="flex-end">
          <TextField
            inputRef={inputRef}
            fullWidth
            multiline
            maxRows={4}
            placeholder="Ask about symptoms, nutrition, or your diet plan..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={mutation.isPending}
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
                bgcolor: 'grey.50',
                transition: 'all 0.3s',
                '&:hover': {
                  bgcolor: 'grey.100',
                },
                '&.Mui-focused': {
                  bgcolor: 'background.paper',
                  boxShadow: '0 0 0 2px rgba(33, 150, 243, 0.1)',
                },
              },
            }}
          />
          <Tooltip title={inputText.trim() ? 'Send message' : 'Type a message to send'} arrow>
            <span>
              <IconButton
                color="primary"
                onClick={handleSend}
                disabled={!inputText.trim() || mutation.isPending}
                sx={{
                  bgcolor: 'primary.main',
                  color: 'white',
                  width: 48,
                  height: 48,
                  '&:hover': {
                    bgcolor: 'primary.dark',
                    transform: 'scale(1.1)',
                    boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)',
                  },
                  '&:disabled': {
                    bgcolor: 'grey.300',
                    color: 'grey.500',
                  },
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 2px 8px rgba(33, 150, 243, 0.3)',
                }}
              >
                {mutation.isPending ? (
                  <CircularProgress size={20} sx={{ color: 'white' }} />
                ) : (
                  <SendIcon />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        {inputText.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, px: 1.5, fontSize: '0.7rem' }}>
            Press Enter to send, Shift+Enter for new line
          </Typography>
        )}
      </Paper>
    </Box>
  );
}

