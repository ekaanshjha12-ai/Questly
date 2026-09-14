/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Every scale resolves through a CSS variable defined in index.css, so
      // switching theme is a change of values there rather than a rewrite of
      // every component.
      //
      // The `<alpha-value>` form is what makes `bg-ink-850/70` keep working —
      // it requires bare "R G B" triples, which is why the variables are not
      // hex. Roughly two hundred opacity-modified utilities in this app depend
      // on it, and with hex they would all fail silently.
      colors: {
        ink: {
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          850: 'rgb(var(--ink-850) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
        },
        // Overrides Tailwind's built-in slate so text tokens theme too.
        slate: {
          50: 'rgb(var(--slate-50) / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
        },
        gold: {
          300: 'rgb(var(--gold-300) / <alpha-value>)',
          400: 'rgb(var(--gold-400) / <alpha-value>)',
          500: 'rgb(var(--gold-500) / <alpha-value>)',
          600: 'rgb(var(--gold-600) / <alpha-value>)',
        },
        ember: {
          400: 'rgb(var(--ember-400) / <alpha-value>)',
          500: 'rgb(var(--ember-500) / <alpha-value>)',
          600: 'rgb(var(--ember-600) / <alpha-value>)',
        },
        mystic: {
          // 100–300 were used by a dozen components before they existed here,
          // so those classes silently generated nothing and the text fell back
          // to whatever it inherited.
          100: 'rgb(var(--mystic-100) / <alpha-value>)',
          200: 'rgb(var(--mystic-200) / <alpha-value>)',
          300: 'rgb(var(--mystic-300) / <alpha-value>)',
          400: 'rgb(var(--mystic-400) / <alpha-value>)',
          500: 'rgb(var(--mystic-500) / <alpha-value>)',
          600: 'rgb(var(--mystic-600) / <alpha-value>)',
        },
        emerald: {
          400: 'rgb(var(--emerald-400) / <alpha-value>)',
        },
        /** Rewards: XP, coins, anything earned. */
        reward: {
          300: 'rgb(var(--reward-300) / <alpha-value>)',
          400: 'rgb(var(--reward-400) / <alpha-value>)',
          500: 'rgb(var(--reward-500) / <alpha-value>)',
          600: 'rgb(var(--reward-600) / <alpha-value>)',
        },
        /** Parchment surfaces and their ink. */
        parch: {
          50: 'rgb(var(--parch-50) / <alpha-value>)',
          100: 'rgb(var(--parch-100) / <alpha-value>)',
          200: 'rgb(var(--parch-200) / <alpha-value>)',
          300: 'rgb(var(--parch-300) / <alpha-value>)',
          ink: 'rgb(var(--parch-ink) / <alpha-value>)',
          soft: 'rgb(var(--parch-soft) / <alpha-value>)',
        },
        rarity: {
          common: 'rgb(var(--rarity-common) / <alpha-value>)',
          rare: 'rgb(var(--rarity-rare) / <alpha-value>)',
          epic: 'rgb(var(--rarity-epic) / <alpha-value>)',
          legendary: 'rgb(var(--rarity-legendary) / <alpha-value>)',
        },
        danger: {
          400: 'rgb(var(--danger-400) / <alpha-value>)',
          500: 'rgb(var(--danger-500) / <alpha-value>)',
          600: 'rgb(var(--danger-600) / <alpha-value>)',
        },
        info: {
          400: 'rgb(var(--info-400) / <alpha-value>)',
        },
        arcane: {
          400: 'rgb(var(--arcane-400) / <alpha-value>)',
        },
        blue: {
          400: 'rgb(var(--blue-400) / <alpha-value>)',
        },
        /** Text and icons on a gold or ember fill — dark in both themes. */
        onAccent: 'rgb(var(--on-accent) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'ui-serif', 'Georgia', 'serif'],
        body: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        pixel: ['"Silkscreen"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        // Softened in the light theme, where a glow against white reads as blur
        // rather than light.
        glow: '0 0 20px var(--glow-gold)',
        'glow-reward': '0 0 24px var(--glow-reward)',
        'glow-mystic': '0 0 20px var(--glow-mystic)',
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
