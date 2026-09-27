import players from '../players.json'

export default players

export const FRAMES = 48

// Les chemins du JSON commencent par « assets/ » : on les préfixe avec la base Vite.
export const asset = (path) => import.meta.env.BASE_URL + path

const LOGOS = {
  'Real Madrid': 'real.webp',
  'Paris Saint-Germain': 'psg.svg',
  'Bayern Munich': 'bayern.webp',
  'Manchester City': 'city.webp',
  'FC Barcelone': 'barca.webp',
  'Inter Miami': 'miami.webp',
}

export const clubLogo = (club) => (LOGOS[club] ? asset(`assets/logos/${LOGOS[club]}`) : null)

const sequence = (id) => asset(`assets/players/sequences/${id}/`)
export const posterUrl = (id) => sequence(id) + 'poster.avif'
// Pièces d'or (page 1) : portrait du joueur (les deux faces).
export const coinUrl = (id) => asset(`assets/coins/${id}.avif`)
export const frameUrl = (id, i) => sequence(id) + String(i).padStart(3, '0') + '.avif'
// Photo studio nette de face, calée sur l'image 000 de la séquence.
export const photoUrl = (id) => sequence(id) + 'face.avif'

export const decimal = (n) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Dates de naissance (données publiques, ajoutées le 27/09/2026 : absentes de l'Excel), pour
// l'âge affiché dans les tableaux de la page du duel.
const BIRTHS = {
  'kylian-mbappe': '1998-12-20',
  rodri: '1996-06-22',
  'harry-kane': '1993-07-28',
  'lionel-messi': '1987-06-24',
  'ousmane-dembele': '1997-05-15',
  'khvicha-kvaratskhelia': '2001-02-12',
  'lamine-yamal': '2007-07-13',
  'erling-haaland': '2000-07-21',
  'michael-olise': '2001-12-12',
  'jude-bellingham': '2003-06-29',
}

/** Âge du joueur aujourd'hui (null si date inconnue). */
// Couleur dominante du maillot de la photo (extraite des photos face.avif, 27/09/2026) : halo de
// lumière de scène derrière le joueur (--kit).
const KITS = {
  'erling-haaland': '#e10519', 'harry-kane': '#506096', 'jude-bellingham': '#4e6898',
  'khvicha-kvaratskhelia': '#035fe2', 'kylian-mbappe': '#064edf', 'lamine-yamal': '#e1040a',
  'lionel-messi': '#4270a3', 'michael-olise': '#064fdf', 'ousmane-dembele': '#074fde', rodri: '#da0b0f',
}
export const kitStyle = (id) => ({ '--kit': KITS[id] ?? '#d4af37' })

export const ageOf = (id, now = new Date()) => {
  const b = BIRTHS[id] && new Date(BIRTHS[id])
  if (!b) return null
  let a = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--
  return a
}

// Postes en toutes lettres (infobulle des abréviations BU, AD… ; POSTES dans excel_vers_json.py).
const POSTE_LABELS = {
  BU: 'Buteur', AD: 'Ailier droit', AG: 'Ailier gauche',
  MDC: 'Milieu défensif central', MOC: 'Milieu offensif central',
}
export const posteLabel = (poste) => poste.split('/').map((p) => POSTE_LABELS[p] ?? p).join(' / ')
