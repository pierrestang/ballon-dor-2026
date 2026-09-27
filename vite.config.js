import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { staticContent } from './scripts/contenu_statique.mjs'

// Contenu statique des 10 candidats dans #root (référencement), régénéré à chaque build.
const staticHtml = () => ({
  name: 'contenu-statique',
  transformIndexHtml: (html) => html.replace('<div id="root"></div>', `<div id="root">${staticContent('players.json')}</div>`),
})

// base relative : le site fonctionne à la racine d'un domaine comme dans un
// sous-dossier GitHub Pages (https://<compte>.github.io/<depot>/) sans réglage.
export default defineConfig({
  base: './',
  plugins: [react(), staticHtml()],
})
