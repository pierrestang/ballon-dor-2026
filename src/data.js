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
export const bustUrl = (id) => sequence(id) + 'bust.avif'     // tête et buste (cartes page 1)
export const backUrl = (id) => sequence(id) + 'dos.avif'   // vue de dos (page 1)
export const frameUrl = (id, i) => sequence(id) + String(i).padStart(3, '0') + '.avif'
// Photo studio nette de face, calée sur l'image 000 de la séquence.
export const photoUrl = (id) => sequence(id) + 'face.avif'

export const decimal = (n) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
