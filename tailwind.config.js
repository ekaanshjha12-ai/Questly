/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0a12',
          900: '#0f0f1a',
          850: '#14141f',
          800: '#191926',
          700: '#232336',
          600: '#2f2f47',
          500: '#3d3d5c',
        },
        gold: {
          300: '#ffe27a',
          400: '#ffd24d',
          500: '#f5b800',
          600: '#d99900',
        },
        ember: {
          400: '#ff8a5c',
          500: '#ff6b3d',
          600: '#e2501f',
        },
        mystic: {
          400: '#8b7fff',
          500: '#6c5ce7',
          600: '#5341d6',
        },
      },
      fontFamily: {
        display: ['"Cinzel"', 'ui-serif', 'Georgia', 'serif'],
        body: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(245, 184, 0, 0.35)',
        'glow-mystic': '0 0 20px rgba(108, 92, 231, 0.4)',
      },
      keyframes: {
        'pop-in': {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'float-up': {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(-40px)', opacity: '0' },
        },
      },
      animation: {
        'pop-in': 'pop-in 0.25s ease-out',
        shimmer: 'shimmer 2.5s linear infinite',
        'float-up': 'float-up 1s ease-out forwards',
      },
    },
  },
  plugins: [],
}
