/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
      },
      colors: {
        forest: {
          50:  '#f0faf4',
          100: '#d8f3e3',
          200: '#b3e6c8',
          300: '#7fd1a4',
          400: '#48b47a',
          500: '#259658',
          600: '#177a45',
          700: '#136138',
          800: '#124d2e',
          900: '#103f27',
        },
        stone: {
          50:  '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },
        sand: '#f5f0e8',
        cream: '#fdfcf9',
      },
    },
  },
  plugins: [],
}
