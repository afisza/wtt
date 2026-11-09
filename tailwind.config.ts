import type { Config } from 'tailwindcss';

/** Kolor z tokenu OKLCH zdefiniowanego w src/index.css (obsługuje modyfikatory /alpha). */
const token = (name: string) => `oklch(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        destructive: { DEFAULT: token('destructive'), foreground: token('destructive-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        highlight: {
          DEFAULT: token('highlight'),
          foreground: token('highlight-foreground'),
          ink: token('highlight-ink'),
        },
        popover: { DEFAULT: token('popover'), foreground: token('popover-foreground') },
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        weekend: token('weekend'),
        status: {
          done: token('st-done'),
          progress: token('st-progress'),
          todo: token('st-todo'),
          planned: token('st-planned'),
          cancelled: token('st-cancelled'),
        },
        palette: {
          ink: token('ink'),
          navy: token('navy'),
          slate: token('slate'),
          peach: token('peach'),
          crimson: token('crimson'),
          wine: token('wine'),
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
