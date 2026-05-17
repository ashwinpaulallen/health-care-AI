'use client';

import { AppBar, Toolbar, Typography, Button, Box, Container } from '@mui/material';
import { useRouter, usePathname } from 'next/navigation';
import {
  Chat as ChatIcon,
  Restaurant as RestaurantIcon,
  AdminPanelSettings as AdminIcon,
} from '@mui/icons-material';

export default function Navigation() {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { label: 'Chat', path: '/', icon: <ChatIcon /> },
    { label: 'Diet Plan', path: '/diet', icon: <RestaurantIcon /> },
    { label: 'Admin', path: '/admin', icon: <AdminIcon /> },
  ];

  return (
    <AppBar position="static" color="primary" elevation={2}>
      <Container maxWidth="xl">
        <Toolbar disableGutters>
          <Typography
            variant="h6"
            component="div"
            sx={{ flexGrow: 0, mr: 4, fontWeight: 'bold' }}
          >
            Health Bot AI
          </Typography>

          <Box sx={{ flexGrow: 1, display: 'flex', gap: 1 }}>
            {navItems.map((item) => (
              <Button
                key={item.path}
                onClick={() => router.push(item.path)}
                startIcon={item.icon}
                sx={{
                  color: 'white',
                  backgroundColor:
                    pathname === item.path || pathname.startsWith(item.path + '/')
                      ? 'rgba(255, 255, 255, 0.2)'
                      : 'transparent',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  },
                }}
              >
                {item.label}
              </Button>
            ))}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
}

