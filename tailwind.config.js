/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: '#141619',
          panel: '#1e2227',
          surface: '#282c34',
          border: '#3a3f4b',
          accent: '#e5a50a',
          blob: '#f39c12',
          blobActive: '#e67e22',
          scaleActive: '#2d333b',
          scaleInactive: '#181b20',
          playhead: '#ff3366',
        }
      }
    },
  },
  plugins: [],
}
