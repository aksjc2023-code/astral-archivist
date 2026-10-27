/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        astral: {
          950: '#07090e',
          900: '#0d131f',
          800: '#172236',
          700: '#233453',
          amber: '#f59e0b',
          glow: '#d97706',
          violet: '#7c3aed',
        },
      },
    },
  },
  plugins: [],
};
