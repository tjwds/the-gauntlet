import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { t } from '@/lib/copy';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: t('app.name'),
  description:
    'A listening queue for whole albums. Seven Spotify playlists act as kanban columns.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
