// Contenu statique de la page (référencement, aperçus, lecteurs sans JavaScript) : les 10
// candidats en texte, générés depuis players.json et placés dans #root au build (vite.config.js).
// React remplace ce contenu au montage ; il est masqué visuellement (.static-content) pour ne
// jamais apparaître avant l'intro.
import fs from 'node:fs'
import { posteLabel } from '../src/postes.js'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const num = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`

function player(p) {
  const s = p.stats
  const coll = p.collectif.map((t) => t.titre)
  const indiv = p.individuel.map((t) => t.titre)
  return `<article>
<h2>${esc(p.nom)}</h2>
<p>${esc(posteLabel(p.poste))} · ${esc(p.club)} · ${esc(p.selection)}</p>
<p>Saison 2025-2026 : ${plural(s.matchs, 'match', 'matches')}, ${plural(s.buts, 'but')}, ${plural(s.passes, 'passe décisive', 'passes décisives')}, ${num(s.contributionsParMatch)} but ou passe par match.</p>
<p>Titres collectifs : ${coll.length ? esc(coll.join(', ')) : 'aucun'}.</p>
${indiv.length ? `<p>Distinctions individuelles : ${esc(indiv.join(', '))}.</p>` : ''}
</article>`
}

export function staticContent(file) {
  const players = JSON.parse(fs.readFileSync(file, 'utf8'))
  return `<main class="static-content">
<h1>Ballon d'Or 2026 : les 10 candidats</h1>
<p>Statistiques et palmarès de la saison (3 août 2025 – 19 juillet 2026) des candidats au Ballon d'Or 2026 : ${esc(players.map((p) => p.nom).join(', '))}. Comparez-les en duel et établissez votre propre classement.</p>
${players.map(player).join('\n')}
</main>`
}
