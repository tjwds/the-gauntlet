'use client';

import { Button, Card, cn } from '@heroui/react';
import { segments, t } from '@/lib/copy';
import { SCOPE_ROWS } from '@/lib/auth/scopes';
import { COLUMNS } from '@/lib/domain/columns';

export interface LoginScreenProps {
  onSignIn(): void;
  /** Set when Spotify's consent screen turned the listener away. */
  error?: string | null;
  repoUrl?: string;
}

/**
 * The app doesn't explain the system; the post does. Three numbered steps used
 * to sit here, which was the app teaching a method it didn't invent to someone
 * who by definition already knows it or is one click from reading it.
 *
 * The consequence to hold onto: this link is the whole onboarding.
 */
export function LoginScreen({
  onSignIn,
  error = null,
  repoUrl = 'https://github.com/tjwds/the-gauntlet',
}: LoginScreenProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-120 min-w-0">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-xl font-extrabold text-accent-foreground">
            G
          </span>
          <div className="text-2xl leading-tight font-bold tracking-tight">{t('app.name')}</div>
        </div>

        <Card>
          <Card.Content className="p-5">
            <p className="mb-6">
              {segments('login.blurb').map((segment, index) =>
                segment.href ? (
                  <a
                    key={index}
                    href={segment.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-link underline"
                  >
                    {segment.text}
                  </a>
                ) : (
                  <span key={index}>{segment.text}</span>
                ),
              )}
            </p>

            {/*
              One line, always: a queue that wraps mid-arrow stops reading as a
              queue. Tight enough to fit the card at every width the login
              screen has, and it scrolls rather than folds if it ever doesn't.
            */}
            <div className="-mx-1 mb-5 flex min-w-0 items-center gap-1.5 overflow-x-auto px-1 pb-1 text-xs">
              {COLUMNS.filter((column) => column.id !== 'abandoned').map((column, index) => (
                <span key={column.id} className="flex shrink-0 items-center gap-1.5">
                  {index > 0 && <span className="text-separator">→</span>}
                  <span
                    className={cn(
                      'rounded-xl px-2.5 py-1.5 font-medium whitespace-nowrap',
                      column.id === 'done'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-surface-secondary text-foreground',
                    )}
                  >
                    {column.name}
                  </span>
                </span>
              ))}
            </div>

            {error && (
              <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-3.5 py-3 text-[13px] text-danger">
                {error}
              </p>
            )}

            <Button variant="primary" size="lg" fullWidth onPress={() => onSignIn()}>
              {t('login.cta')}
            </Button>

            <p className="mt-4 text-[13px] text-muted">{t('login.premium')}</p>
            <p className="mt-2.5 text-[13px]">
              <a href={repoUrl} target="_blank" rel="noreferrer noopener" className="text-link underline">
                {t('login.githubLink')}
              </a>
            </p>
          </Card.Content>
          <Card.Footer className="flex items-center gap-3 border-t border-separator bg-surface-secondary px-5 py-3.5">
            <span className="flex-1 text-[13px] text-muted">{t('login.footer.storage')}</span>
            <a href={repoUrl} className="text-[13px] text-link underline">
              {t('login.footer.link')}
            </a>
          </Card.Footer>
        </Card>

        {/*
          Spotify shows its own consent screen listing these. This disclosure is
          ours, shown before the redirect, so the consent screen isn't the first
          time the listener sees the list.
        */}
        <details className="mt-4.5">
          <summary className="cursor-pointer text-[13px] text-muted">
            {t('login.scopes.summary')}
          </summary>
          <Card className="mt-2.5">
            <table className="w-full table-fixed text-[13px]">
              <tbody>
                {SCOPE_ROWS.map((row) => (
                  <tr key={row.scope} className="border-t border-separator first:border-t-0">
                    <td className="w-1/2 px-5 py-3 align-top font-mono text-xs break-all">{row.scope}</td>
                    <td className="px-5 py-3 align-top text-muted">{t(row.copyKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </details>
      </div>
    </main>
  );
}
