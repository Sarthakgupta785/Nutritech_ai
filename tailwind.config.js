/** Every palette resolves through CSS custom properties, so light and dark are one set of
 *  class names with two sets of values (see the :root / .dark blocks in src/index.css). */
const scale = (prefix, shades) => Object.fromEntries(shades.map(s => [s, `rgb(var(--${prefix}-${s}) / <alpha-value>)`]))

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'rgb(var(--surface) / <alpha-value>)',
        leaf: scale('leaf', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        ink: scale('ink', [50, 100, 200, 300, 400, 500, 700, 900]),
        sky: scale('sky', [50, 100, 300, 400, 600, 700, 800]),
        amber: scale('amber', [50, 100, 200, 300, 400, 800, 900]),
        red: scale('red', [50, 100, 600, 700, 800]),
        violet: scale('violet', [100, 400, 800]),
      },
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"Helvetica Neue"', 'Inter', 'system-ui', 'sans-serif'] },
      boxShadow: { card: 'var(--shadow-card)' },
    },
  },
  plugins: [],
}
