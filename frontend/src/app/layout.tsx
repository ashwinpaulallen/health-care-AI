import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import theme from './theme';
import Providers from './providers';
import Navigation from '../components/Navigation';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Health Bot AI - AI Health & Nutrition Assistant',
  description: 'Get personalized health and nutrition guidance powered by AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <Providers>
              <Navigation />
              {children}
            </Providers>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}

