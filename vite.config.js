import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relative : le site fonctionne à la racine d'un domaine comme dans un
// sous-dossier GitHub Pages (https://<compte>.github.io/<depot>/) sans réglage.
export default defineConfig({
  base: './',
  plugins: [react()],
})
