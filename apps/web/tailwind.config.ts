import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--98-bg-black)',
        card: 'var(--98-card-bg)',
        accent: 'var(--98-purple-core)',
        warning: '#FF4D4D',
        muted: '#666666',
      },
      boxShadow: {
        glow: '0 0 24px var(--98-glow-core)',
        'glow-sm': '0 0 12px var(--98-glow-soft)',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        shake: 'shake 0.4s ease-in-out',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 16px var(--98-glow-soft)' },
          '50%': { boxShadow: '0 0 28px var(--98-glow-core)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-6px)' },
          '75%': { transform: 'translateX(6px)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
