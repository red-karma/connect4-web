import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base: HTML/JS/CSS references resolve against wherever the page was
  // actually loaded from, so the same dist/ build works whether it's deployed at
  // the site root or under any subpath, with no per-deployment config.
  base: './',
  plugins: [react()],
})
