import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#f3f5fa',
        surface: {
          DEFAULT: '#ffffff',
          elevated: '#ffffff',
          sunken: '#edf0f7',
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
          subtle: 'rgba(22,30,60,0.08)',
          DEFAULT: 'rgba(22,30,60,0.14)',
          strong: 'rgba(22,30,60,0.22)',
        },
        ink: {
          primary: '#1d2438',
          secondary: '#4a5470',
          muted: '#7a849c',
        },
        // 亮色主题：100-300 作为正文强调色需要在白底上可读，因此取深紫
        brand: {
          100: '#5b21b6',
          200: '#6d28d9',
          300: '#7c3aed',
          400: '#8b5cf6',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
        },
        accent: {
          200: '#be185d',
          300: '#db2777',
          400: '#ec4899',
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
        elevated: '0 10px 30px -10px rgba(23, 30, 60, 0.16), 0 4px 12px -4px rgba(23, 30, 60, 0.08)',
        glow: '0 0 0 1px rgba(139, 92, 246, 0.18), 0 8px 24px -8px rgba(139, 92, 246, 0.30)',
        'glow-lg': '0 0 0 1px rgba(139, 92, 246, 0.22), 0 14px 40px -10px rgba(139, 92, 246, 0.35), 0 4px 16px -6px rgba(236, 72, 153, 0.20)',
        'glow-accent': '0 0 0 1px rgba(236, 72, 153, 0.18), 0 8px 24px -8px rgba(236, 72, 153, 0.30)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
        'brand-soft': 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(236,72,153,0.08) 50%, rgba(139,92,246,0.03) 100%)',
        'hero-radial': 'radial-gradient(120% 80% at 0% 0%, rgba(139,92,246,0.12) 0%, transparent 55%), radial-gradient(80% 60% at 100% 0%, rgba(236,72,153,0.09) 0%, transparent 60%)',
        'shimmer': 'linear-gradient(100deg, transparent 20%, rgba(23,30,60,0.04) 40%, rgba(23,30,60,0.07) 50%, rgba(23,30,60,0.04) 60%, transparent 80%)',
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
