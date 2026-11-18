/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0B1930', 700: '#13243F', 600: '#1B2F50' },
        primary: { DEFAULT: '#2563EB', hover: '#1D4ED8', light: '#DBEAFE' },
        success: { DEFAULT: '#16A34A', light: '#DCFCE7' },
        danger: { DEFAULT: '#DC2626', light: '#FEE2E2' },
        warning: { DEFAULT: '#F59E0B', light: '#FEF3C7' },
        bg: '#F4F6F8',
        surface: '#FFFFFF',
        ink: { DEFAULT: '#111827', muted: '#64748B' },
        line: '#E2E8F0',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: { card: '14px', btn: '10px' },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        pop: '0 12px 32px rgba(15, 23, 42, 0.14)',
      },
    },
  },
  plugins: [],
};
