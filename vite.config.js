import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// VITE_BASE es la ruta donde se publica el sitio:
//   local            -> /
//   GitHub Pages prod  -> /proyectoNUBE/
//   GitHub Pages test  -> /proyectoNUBE/test/
// El workflow de GitHub Actions la define; en local no hace falta.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
})
