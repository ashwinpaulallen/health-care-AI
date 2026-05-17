'use client';

import { useState } from 'react';
import { Box, Drawer, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { Menu as MenuIcon } from '@mui/icons-material';
import ChatWindow from '@/components/Chat/ChatWindow';
import ConversationList from '@/components/Chat/ConversationList';
import { deleteConversation } from '@/app/api';

const DRAWER_WIDTH = 280;
const APP_BAR_HEIGHT = 64; // Height of the Navigation component

export default function Home () {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<string | undefined>();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleSelectConversation = (convId: string) => {
    setSelectedConvId(convId);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    try {
      await deleteConversation(convId);
      // If deleting current conversation, clear selection
      if (convId === selectedConvId) {
        setSelectedConvId(undefined);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const drawer = (
    <ConversationList
      userId="demo-user"
      currentConvId={selectedConvId}
      onSelectConversation={handleSelectConversation}
      onDeleteConversation={handleDeleteConversation}
    />
  );

  return (
    <Box sx={{ display: 'flex', height: `calc(100vh - ${APP_BAR_HEIGHT}px)`, bgcolor: 'background.default' }}>
      {/* Sidebar - Desktop persistent, Mobile drawer */}
      {isMobile ? (
        <>
          {/* Mobile menu button */}
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{
              position: 'fixed',
              top: APP_BAR_HEIGHT + 8,
              left: 16,
              zIndex: theme.zIndex.drawer + 1,
              bgcolor: 'primary.main',
              color: 'white',
              boxShadow: 3,
              '&:hover': {
                bgcolor: 'primary.dark',
              },
            }}
          >
            <MenuIcon />
          </IconButton>

          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{
              keepMounted: true, // Better mobile performance
            }}
            sx={{
              '& .MuiDrawer-paper': {
                boxSizing: 'border-box',
                width: DRAWER_WIDTH,
              },
            }}
          >
            {drawer}
          </Drawer>
        </>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              borderRight: '1px solid',
              borderColor: 'divider',
              position: 'relative',
            },
          }}
        >
          {drawer}
        </Drawer>
      )}

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          width: { xs: '100%', md: `calc(100% - ${DRAWER_WIDTH}px)` },
        }}
      >
        <ChatWindow key={selectedConvId} initialConvId={selectedConvId} />
      </Box>
    </Box>
  );
}
