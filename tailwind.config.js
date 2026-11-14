/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0c1210',
        panel: '#131a17',
        panel2: '#1a231f',
        accent: '#3ddc97',
        accent2: '#f4b942',
        text: '#e8f0ec',
        muted: '#7a8a82',
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', 'serif'],
        sans: ['"Noto Sans SC"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
