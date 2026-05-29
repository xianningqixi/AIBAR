import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#0a0c16',
        surface: {
          DEFAULT: '#161a28',
          elevated: '#1f2334',
          sunken: '#10131c',
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          700: '#334155',
          800: '#1e293b',
          850: '#172033',
          900: '#0f172a',
          950: '#020617',
        },
        border: {
          subtle: 'rgba(255,255,255,0.07)',
          DEFAULT: 'rgba(255,255,255,0.12)',
          strong: 'rgba(255,255,255,0.20)',
        },
        ink: {
          primary: '#eef0f5',
          secondary: '#a5acbb',
          muted: '#737a8a',
        },
        brand: {
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
        },
        accent: {
          200: '#fbcfe8',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
        },
      },
      ringColor: {
        brand: '#8b5cf6',
        accent: '#ec4899',
      },
      boxShadow: {
        elevated: '0 10px 30px -10px rgba(0, 0, 0, 0.6), 0 4px 12px -4px rgba(0, 0, 0, 0.4)',
        glow: '0 0 0 1px rgba(139, 92, 246, 0.25), 0 8px 28px -8px rgba(139, 92, 246, 0.35)',
        'glow-lg': '0 0 0 1px rgba(139, 92, 246, 0.30), 0 14px 44px -10px rgba(139, 92, 246, 0.50), 0 4px 16px -6px rgba(236, 72, 153, 0.30)',
        'glow-accent': '0 0 0 1px rgba(236, 72, 153, 0.25), 0 8px 28px -8px rgba(236, 72, 153, 0.35)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
        'brand-soft': 'linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(236,72,153,0.12) 50%, rgba(139,92,246,0.04) 100%)',
        'hero-radial': 'radial-gradient(120% 80% at 0% 0%, rgba(139,92,246,0.20) 0%, transparent 55%), radial-gradient(80% 60% at 100% 0%, rgba(236,72,153,0.14) 0%, transparent 60%)',
        'shimmer': 'linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.06) 60%, transparent 80%)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.25s ease both',
        'pop-in': 'pop-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
