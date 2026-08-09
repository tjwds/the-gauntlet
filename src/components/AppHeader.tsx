'use client';

import Link from 'next/link';
import { Avatar, buttonVariants, cn, Input, TextField } from '@heroui/react';
import { t } from '@/lib/copy';

export interface AppHeaderProps {
  user?: { name: string | null; image: string | null } | null;
  query?: string;
  onQueryChange?(value: string): void;
  onAddAlbums?(): void;
  /** Settings is a page, so it links rather than opening anything. */
  settingsActive?: boolean;
}

export function AppHeader({
  user,
  query = '',
  onQueryChange,
  onAddAlbums,
  settingsActive = false,
}: AppHeaderProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-4 border-b border-separator px-5 py-3 board:h-16 board:flex-nowrap board:py-0">
      <Link href="/" className="flex items-center gap-2.5 text-base font-bold tracking-tight">
        <span className="grid size-7 place-items-center rounded-lg bg-accent text-[13px] font-extrabold text-accent-foreground">
          G
        </span>
        {t('app.name')}
      </Link>

      <TextField
        aria-label="Search the board"
        value={query}
        onChange={(value) => onQueryChange?.(value)}
        className="order-3 w-full board:order-none board:w-70"
      >
        <Input placeholder="Search the board" />
      </TextField>

      <div className="ml-auto flex items-center gap-2.5">
        {onAddAlbums && (
          <button type="button" onClick={onAddAlbums} className={buttonVariants({ variant: 'secondary' })}>
            {t('nav.addAlbums')}
          </button>
        )}
        <Link
          href="/settings"
          className={cn(buttonVariants({ variant: settingsActive ? 'secondary' : 'ghost' }))}
        >
          {t('nav.settings')}
        </Link>
        {user && (
          <>
            <Avatar size="sm">
              {user.image ? (
                <Avatar.Image src={user.image} alt="" />
              ) : (
                <Avatar.Fallback>{(user.name ?? '?').slice(0, 1).toUpperCase()}</Avatar.Fallback>
              )}
            </Avatar>
            <span className="hidden font-mono text-[13px] text-muted board:inline">{user.name}</span>
          </>
        )}
      </div>
    </header>
  );
}
