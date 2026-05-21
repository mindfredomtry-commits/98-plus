import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0F0F0F',
        card: '#1A1A1A',
        accent: '#9B59B6',
        warning: '#FF4D4D',
        muted: '#666666',
      },
      boxShadow: {
        glow: '0 0 24px rgba(155, 89, 182, 0.45)',
        'glow-sm': '0 0 12px rgba(155, 89, 182, 0.35)',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        shake: 'shake 0.4s ease-in-out',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 16px rgba(155, 89, 182, 0.3)' },
          '50%': { boxShadow: '0 0 28px rgba(155, 89, 182, 0.6)' },
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
