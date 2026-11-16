/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        leaf: { 50: '#EEF9F2', 100: '#D9F2E3', 200: '#B4E5C8', 300: '#86D3A7', 400: '#57BD85', 500: '#34A56B', 600: '#268556', 700: '#206A46', 800: '#1D5439', 900: '#184530' },
        ink: { 900: '#111613', 700: '#2E3731', 500: '#667069', 400: '#8C958F', 300: '#B7BEB9', 200: '#DDE2DE', 100: '#EEF1EE', 50: '#F5F7F5' },
      },
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"Helvetica Neue"', 'Inter', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(17,22,19,.04), 0 8px 24px rgba(17,22,19,.05)' },
    },
  },
  plugins: [],
}
