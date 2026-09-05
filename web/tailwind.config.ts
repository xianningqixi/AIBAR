import type { Config } from 'tailwindcss'

// 主题色全部走 CSS 变量（定义在 src/assets/main.css 的 :root / html.dark 中），
// 这样 dark 模式只需切换 html.dark class，全站 token 自动翻转，组件无需 dark: 前缀。
// 变量值为 RGB 三元组，配合 <alpha-value> 支持 bg-brand-500/10 这类透明度写法。
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: v('--c-bg'),
        surface: {
          DEFAULT: v('--c-surface'),
          elevated: v('--c-surface-elevated'),
          sunken: v('--c-surface-sunken'),
        },
        border: {
          subtle: 'rgb(var(--c-border) / 0.10)',
          DEFAULT: 'rgb(var(--c-border) / 0.16)',
          strong: 'rgb(var(--c-border) / 0.26)',
        },
        ink: {
          primary: v('--c-ink-primary'),
          secondary: v('--c-ink-secondary'),
          muted: v('--c-ink-muted'),
        },
        // 品牌色：亮色主题下 100-300 是深紫（白底可读）；暗色主题变量翻转为浅紫
        brand: {
          DEFAULT: v('--c-brand-500'),
          100: v('--c-brand-100'),
          200: v('--c-brand-200'),
          300: v('--c-brand-300'),
          400: v('--c-brand-400'),
          500: v('--c-brand-500'),
          600: v('--c-brand-600'),
          700: v('--c-brand-700'),
        },
        accent: {
          DEFAULT: v('--c-accent-500'),
          200: v('--c-accent-200'),
          300: v('--c-accent-300'),
          400: v('--c-accent-400'),
          500: v('--c-accent-500'),
          600: v('--c-accent-600'),
          700: v('--c-accent-700'),
        },
        // 语义/反馈色：替代散落的 red-* / emerald-* / amber-* 硬编码
        // 用法：text-danger / bg-danger/10 / bg-danger-soft / border-danger/30 / text-danger-strong
        danger: {
          DEFAULT: v('--c-danger'),
          strong: v('--c-danger-strong'),
          soft: 'var(--c-danger-soft)',
        },
        success: {
          DEFAULT: v('--c-success'),
          strong: v('--c-success-strong'),
          soft: 'var(--c-success-soft)',
        },
        warning: {
          DEFAULT: v('--c-warning'),
          strong: v('--c-warning-strong'),
          soft: 'var(--c-warning-soft)',
        },
        info: {
          DEFAULT: v('--c-info'),
          strong: v('--c-info-strong'),
          soft: 'var(--c-info-soft)',
        },
      },
      boxShadow: {
        elevated: '0 10px 30px -10px rgb(var(--c-shadow) / 0.16), 0 4px 12px -4px rgb(var(--c-shadow) / 0.08)',
        glow: '0 0 0 1px rgba(139, 92, 246, 0.18), 0 8px 24px -8px rgba(139, 92, 246, 0.30)',
        'glow-lg': '0 0 0 1px rgba(139, 92, 246, 0.22), 0 14px 40px -10px rgba(139, 92, 246, 0.35), 0 4px 16px -6px rgba(236, 72, 153, 0.20)',
        'glow-accent': '0 0 0 1px rgba(236, 72, 153, 0.18), 0 8px 24px -8px rgba(236, 72, 153, 0.30)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #8b5cf6 0%, #7154d8 100%)',
        'brand-soft': 'linear-gradient(140deg, rgb(var(--c-brand-500) / .12), rgb(var(--c-brand-500) / .025))',
        'hero-radial': 'radial-gradient(120% 80% at 0% 0%, rgba(139,92,246,0.12) 0%, transparent 55%), radial-gradient(80% 60% at 100% 0%, rgba(236,72,153,0.09) 0%, transparent 60%)',
        shimmer: 'linear-gradient(100deg, transparent 20%, rgb(var(--c-shadow) / 0.04) 40%, rgb(var(--c-shadow) / 0.07) 50%, rgb(var(--c-shadow) / 0.04) 60%, transparent 80%)',
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
