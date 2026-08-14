import animate from 'tailwindcss-animate';

/*
  Design tokens. Everything visual comes from here rather than from one-off
  utility values, so the interface stays consistent as pages are added: one
  accent, one neutral ramp, one radius scale, one type scale, one set of soft
  neutral shadows.

  The colour values are mirrored as CSS custom properties in styles/index.css.
  Keep the two in sync — the variables exist so a second theme costs one block
  rather than a rewrite.
*/
export default {
  content: [
    './index.html',
    './{components,pages,contexts,hooks,services,utils}/**/*.{ts,tsx}',
    './App.tsx',
    './index.tsx',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'monospace'],
      },
      /* Compact scale — this app is dense by design. Air comes from spacing. */
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        lg: ['1rem', { lineHeight: '1.5rem' }],
        xl: ['1.125rem', { lineHeight: '1.625rem' }],
        '2xl': ['1.375rem', { lineHeight: '1.875rem' }],
        '3xl': ['1.75rem', { lineHeight: '2.125rem' }],
      },
      borderRadius: {
        md: '0.5rem',
        lg: '0.625rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      colors: {
        /*
          One accent. Named `brand` rather than by hue, so re-tinting the app
          never again leaves the palette lying about its own colour.
        */
        brand: {
          50: '#EFF4FF',
          100: '#DCE7FF',
          200: '#BED3FF',
          300: '#91B4FF',
          400: '#5D8DFF',
          500: '#3B6FFF',
          600: '#1E60FF',
          700: '#1551E5',
          800: '#1642B4',
          900: '#17398D',
        },
        /*
          Pure neutrals rather than the blue-tinted slate ramp. `gray` is the
          only neutral vocabulary in the app; `slate` is deliberately absent so
          the two cannot drift apart again.
        */
        gray: {
          50: '#F6F7F9',
          100: '#EFF1F4',
          200: '#E8EAED',
          300: '#D7DBE0',
          400: '#A8AEB9',
          500: '#8A909C',
          600: '#5B616E',
          700: '#414751',
          800: '#292D35',
          900: '#14161A',
        },
        canvas: '#FCFCFD',
      },
      /* Neutral, low-contrast elevation. No coloured glows. */
      boxShadow: {
        xs: '0 1px 2px 0 rgb(16 24 40 / 0.04)',
        sm: '0 1px 3px 0 rgb(16 24 40 / 0.05), 0 1px 2px -1px rgb(16 24 40 / 0.04)',
        DEFAULT: '0 2px 4px -1px rgb(16 24 40 / 0.05), 0 1px 2px -1px rgb(16 24 40 / 0.03)',
        md: '0 4px 8px -2px rgb(16 24 40 / 0.06), 0 2px 4px -2px rgb(16 24 40 / 0.04)',
        lg: '0 12px 16px -4px rgb(16 24 40 / 0.07), 0 4px 6px -2px rgb(16 24 40 / 0.03)',
        xl: '0 20px 24px -4px rgb(16 24 40 / 0.08), 0 8px 8px -4px rgb(16 24 40 / 0.03)',
        '2xl': '0 24px 48px -12px rgb(16 24 40 / 0.18)',
      },
      keyframes: {
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [animate],
};
