'use client';

import { Radio, RadioGroup, useTheme } from '@heroui/react';
import { t, type CopyKey } from '@/lib/copy';
import { isThemeChoice, THEME_CHOICES, type ThemeChoice } from '@/lib/ui/theme';

const LABELS: Record<ThemeChoice, CopyKey> = {
  system: 'settings.appearance.system',
  light: 'settings.appearance.light',
  dark: 'settings.appearance.dark',
};

/**
 * The one control on Settings. Three radios rather than a switch, because
 * following the OS is a third answer and not the absence of the other two.
 */
export function ThemePicker() {
  const { theme, setTheme } = useTheme('system');
  // Anything stored that isn't one of the three reads as System, which is what
  // the page itself does with it — better than a group with nothing selected.
  const choice = isThemeChoice(theme) ? theme : 'system';

  return (
    <RadioGroup
      // The visible label is the row's, so the group carries its own copy of it
      // rather than leaving a screen reader to infer one from position.
      aria-label={t('settings.appearance.label')}
      orientation="horizontal"
      value={choice}
      onChange={setTheme}
    >
      {THEME_CHOICES.map((option) => (
        <Radio key={option} value={option}>
          {/* Radio.Content is the <label>; outside it the control has no name. */}
          <Radio.Content>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            {t(LABELS[option])}
          </Radio.Content>
        </Radio>
      ))}
    </RadioGroup>
  );
}
