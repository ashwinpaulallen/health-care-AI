'use client';

import { useEffect, useState } from 'react';
import {
    Box,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Typography,
    IconButton,
    Divider,
    CircularProgress,
    Chip,
} from '@mui/material';
import {
    Delete as DeleteIcon,
    Chat as ChatIcon,
    Schedule as ScheduleIcon,
    Message as MessageIcon,
} from '@mui/icons-material';
import { getUserConversations, ConversationSummary } from '@/app/api';

interface ConversationListProps {
    userId: string;
    currentConvId?: string;
    onSelectConversation: (convId: string) => void;
    onDeleteConversation?: (convId: string) => void;
}

export default function ConversationList ({
    userId,
    currentConvId,
    onSelectConversation,
    onDeleteConversation,
}: ConversationListProps) {
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadConversations = async () => {
        try {
            setLoading(true);
            const response = await getUserConversations(userId);
            setConversations(response.conversations);
            setError(null);
        } catch (err) {
            console.error('Failed to load conversations:', err);
            setError('Failed to load conversations');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConversations();
    }, [userId]);

    const handleDelete = async (convId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (onDeleteConversation) {
            onDeleteConversation(convId);
            //Refresh list after delete
            await loadConversations();
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;

        return date.toLocaleDateString();
    };

    const groupConversationsByDate = () => {
        const groups: { [key: string]: ConversationSummary[] } = {
            Today: [],
            Yesterday: [],
            'This Week': [],
            Older: [],
        };

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        conversations.forEach((conv) => {
            const convDate = new Date(conv.lastAt);
            const convDay = new Date(convDate.getFullYear(), convDate.getMonth(), convDate.getDate());

            if (convDay.getTime() === today.getTime()) {
                groups.Today.push(conv);
            } else if (convDay.getTime() === yesterday.getTime()) {
                groups.Yesterday.push(conv);
            } else if (convDate > weekAgo) {
                groups['This Week'].push(conv);
            } else {
                groups.Older.push(conv);
            }
        });

        return groups;
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4 }}>
                <CircularProgress size={24} />
                <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                    Loading...
                </Typography>
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="error">
                    {error}
                </Typography>
            </Box>
        );
    }

    const groupedConversations = groupConversationsByDate();

    return (
        <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{
                height: 64,
                px: 2.5,
                py: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
            }}>
                <Typography
                    variant="h6"
                    sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}
                    suppressHydrationWarning
                >
                    <ChatIcon color="primary" />
                    Conversations
                    {conversations.length > 0 && (
                        <Chip
                            label={conversations.length}
                            size="small"
                            color="primary"
                            variant="filled"
                            sx={{ ml: 'auto', fontWeight: 600 }}
                        />
                    )}
                </Typography>
            </Box>

            {conversations.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                    <MessageIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 0.5 }}>
                        No conversations yet
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Start chatting to see your history here
                    </Typography>
                </Box>
            ) : (
                <List sx={{ p: 1.5 }}>
                    {Object.entries(groupedConversations).map(([group, convs]) => {
                        if (convs.length === 0) return null;

                        return (
                            <Box key={group} sx={{ mb: 1 }}>
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ px: 2, py: 1, display: 'block', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}
                                >
                                    {group}
                                </Typography>
                                {convs.map((conv) => (
                                    <ListItem
                                        key={conv.id}
                                        disablePadding
                                        secondaryAction={
                                            onDeleteConversation && (
                                                <IconButton
                                                    edge="end"
                                                    size="small"
                                                    onClick={(e) => handleDelete(conv.id, e)}
                                                    sx={{
                                                        opacity: 0,
                                                        transition: 'opacity 0.2s',
                                                        '.MuiListItem-root:hover &': {
                                                            opacity: 0.7,
                                                        },
                                                        '&:hover': {
                                                            opacity: 1,
                                                            color: 'error.main',
                                                        },
                                                    }}
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            )
                                        }
                                        sx={{ mb: 0.5 }}
                                    >
                                        <ListItemButton
                                            selected={currentConvId === conv.id}
                                            onClick={() => onSelectConversation(conv.id)}
                                            sx={{
                                                borderRadius: 2,
                                                px: 2,
                                                py: 1.5,
                                                transition: 'all 0.2s',
                                                '&.Mui-selected': {
                                                    bgcolor: 'primary.main',
                                                    color: 'primary.contrastText',
                                                    '&:hover': {
                                                        bgcolor: 'primary.dark',
                                                    },
                                                    '& .MuiTypography-root': {
                                                        color: 'inherit',
                                                    },
                                                },
                                                '&:hover': {
                                                    bgcolor: 'action.hover',
                                                },
                                            }}
                                        >
                                            <ListItemText
                                                primary={
                                                    <Typography
                                                        variant="body2"
                                                        sx={{
                                                            fontWeight: 500,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            pr: 4,
                                                        }}
                                                    >
                                                        {conv.title || 'New Conversation'}
                                                    </Typography>
                                                }
                                                secondary={
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            <ScheduleIcon sx={{ fontSize: 12, opacity: 0.7 }} />
                                                            <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                                                {formatDate(conv.lastAt)}
                                                            </Typography>
                                                        </Box>
                                                        {conv.messageCount !== undefined && (
                                                            <>
                                                                <Typography variant="caption" sx={{ opacity: 0.5 }}>
                                                                    •
                                                                </Typography>
                                                                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                                                    {conv.messageCount} {conv.messageCount === 1 ? 'msg' : 'msgs'}
                                                                </Typography>
                                                            </>
                                                        )}
                                                    </Box>
                                                }
                                                secondaryTypographyProps={{
                                                    component: 'div',
                                                }}
                                            />
                                        </ListItemButton>
                                    </ListItem>
                                ))}
                                <Divider sx={{ my: 1 }} />
                            </Box>
                        );
                    })}
                </List>
            )}
        </Box>
    );
}
