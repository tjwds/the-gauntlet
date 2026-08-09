'use client';

import { Button, Spinner, type ButtonProps } from '@heroui/react';

export interface PendingButtonProps extends ButtonProps {
  isPending?: boolean;
  children: React.ReactNode;
}

/**
 * A button that shows it's working. HeroUI's pending state only stops pointer
 * events — the spinner is ours to render, which is what the render-prop child
 * is for. React Aria also blocks presses and marks the button `aria-disabled`
 * while pending, so a slow write can't be fired twice.
 *
 * The label stays put rather than being swapped out: the button keeps its width
 * and still says what it's doing.
 */
export function PendingButton({ isPending = false, children, ...props }: PendingButtonProps) {
  return (
    <Button {...props} isPending={isPending}>
      {(renderProps) => (
        <>
          {renderProps.isPending && (
            <Spinner size="sm" color="current" data-testid="pending-spinner" aria-hidden="true" />
          )}
          {children}
        </>
      )}
    </Button>
  );
}
