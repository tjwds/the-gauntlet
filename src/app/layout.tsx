import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeSync } from '@/components/ThemeSync';
import { t } from '@/lib/copy';
import { THEME_BOOT_SCRIPT } from '@/lib/ui/theme';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: t('app.name'),
  description:
    'A listening queue for whole albums. Seven Spotify playlists act as kanban columns.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The script below writes to this element before React sees it, which is a
    // hydration mismatch by construction rather than by accident.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        {/*
          First thing in the document, and synchronous: a listener who chose
          dark otherwise gets a white page for as long as it takes React to
          arrive, on every navigation that isn't a client one.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
