'use client';

import { Box, Container, Tabs, Tab, Typography, AppBar, Toolbar } from '@mui/material';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const currentTab = pathname?.includes('/food') ? 'food' : 'symptoms';

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    router.push(`/admin/${newValue}`);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Knowledge Base Admin
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Tabs value={currentTab} onChange={handleTabChange} sx={{ mb: 3 }}>
          <Tab label="Symptoms" value="symptoms" />
          <Tab label="Food & Nutrition" value="food" />
        </Tabs>

        {children}
      </Container>
    </Box>
  );
}

