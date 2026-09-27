// Adresses des pages (audit du 27/09/2026) : chaque page a son lien, partageable, et le bouton
// Retour du navigateur revient à la page précédente.
//   (rien)                   l'intro
//   #duel/<id>/<id>          page du duel
//   #joueur/<id>             présentation d'un joueur
//   #classement              Mon classement
import players from './data'

const index = (id) => players.findIndex((p) => p.id === id)

/** Page décrite par une adresse (#…) ; adresse inconnue : l'intro. */
export function parseRoute(hash) {
  const [page, a, b] = decodeURIComponent(hash).replace(/^#\/?/, '').split('/')
  const i = index(a), j = index(b)
  if (page === 'duel' && i >= 0 && j >= 0 && i !== j) return { page: 'final', pair: [i, j] }
  if (page === 'joueur' && i >= 0) return { page: 'solo', solo: i }
  if (page === 'classement') return { page: 'game' }
  return { page: 'carousel' }
}

/** Adresse et titre d'onglet d'une page. */
export function routeOf({ page, pair, solo }) {
  if (page === 'final') {
    const [a, b] = pair.map((k) => players[k])
    return { hash: `#duel/${a.id}/${b.id}`, title: `${a.nom} contre ${b.nom} · Ballon d'Or 2026` }
  }
  if (page === 'solo') return { hash: `#joueur/${players[solo].id}`, title: `${players[solo].nom} · Ballon d'Or 2026` }
  if (page === 'game') return { hash: '#classement', title: "Mon classement · Ballon d'Or 2026" }
  return { hash: '', title: "Ballon d'Or 2026" }
}
