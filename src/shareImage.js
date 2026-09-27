// Image à partager du classement final (27/09/2026) : 1080 × 1350 (format portrait des réseaux),
// fond noir, « MON BALLON D'OR 2026 », podium des trois pièces (le 1er au centre, plus grand),
// puis les places 4 à 10. Dessinée dans un canvas ; partagée (navigator.share, mobile) ou
// téléchargée (PNG).
import players, { coinUrl } from './data'

const W = 1080, H = 1350
const GOLD = '#d4af37', INK = '#edeae3', MUTED = '#9a968f'
const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif'
const SERIF = '"Cormorant Garamond", Georgia, serif'   // chiffres : italique à empattements, comme le site
const byId = Object.fromEntries(players.map((p) => [p.id, p]))

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = src
})

/** Canvas du classement (ranking : ids du 1er au 10e). */
export async function drawRanking(ranking) {
  await Promise.all([document.fonts?.load(`700 40px ${FONT}`), document.fonts?.load(`italic 600 40px ${SERIF}`)])
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')
  // Fond : noir, lumière dorée derrière le podium.
  g.fillStyle = '#050505'; g.fillRect(0, 0, W, H)
  const glow = g.createRadialGradient(W / 2, 430, 0, W / 2, 430, 520)
  glow.addColorStop(0, 'rgba(212, 175, 55, 0.28)'); glow.addColorStop(1, 'rgba(212, 175, 55, 0)')
  g.fillStyle = glow; g.fillRect(0, 0, W, H)
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'
  // Titre.
  g.fillStyle = INK; g.font = `700 76px ${FONT}`
  g.fillText('MON BALLON D’OR', W / 2, 150)
  g.fillStyle = GOLD; g.font = `italic 600 96px ${SERIF}`
  g.fillText('2026', W / 2, 238)
  // Podium : 2e · 1er · 3e.
  const coins = await Promise.all(ranking.slice(0, 3).map((id) => loadImage(coinUrl(id))))
  const spots = [{ i: 1, x: 250, y: 470, d: 250 }, { i: 0, x: 540, y: 430, d: 330 }, { i: 2, x: 830, y: 470, d: 250 }]
  for (const { i, x, y, d } of spots) {
    g.save(); g.translate(x, y); g.scale(-1, 1)   // portrait tourné vers la droite, comme sur le site
    g.drawImage(coins[i], -d / 2, -d / 2, d, d); g.restore()
    g.fillStyle = GOLD; g.font = `italic 600 ${i === 0 ? 68 : 54}px ${SERIF}`
    g.fillText(`#${i + 1}`, x, y + d / 2 + 64)
    g.fillStyle = INK; g.font = `700 ${i === 0 ? 38 : 30}px ${FONT}`
    g.fillText(byId[ranking[i]].nom.toUpperCase(), x, y + d / 2 + (i === 0 ? 112 : 104))
  }
  // Places 4 à 10.
  g.textAlign = 'left'
  ranking.slice(3).forEach((id, k) => {
    const y = 870 + k * 58
    g.fillStyle = 'rgba(237, 234, 227, 0.1)'; g.fillRect(260, y - 40, 560, 1)
    g.fillStyle = MUTED; g.font = `italic 600 40px ${SERIF}`; g.fillText(`#${k + 4}`, 270, y)
    g.fillStyle = INK; g.font = `700 34px ${FONT}`; g.fillText(byId[id].nom.toUpperCase(), 360, y)
  })
  g.textAlign = 'center'; g.fillStyle = MUTED; g.font = `700 26px ${FONT}`
  g.fillText('ÉTABLISSEZ LE VÔTRE', W / 2, H - 50)
  return c
}

/** Partage l'image (feuille de partage du système si elle accepte les fichiers), sinon la
    télécharge. Renvoie 'shared' | 'downloaded'. */
export async function shareRanking(ranking) {
  const c = await drawRanking(ranking)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const file = new File([blob], 'mon-ballon-dor-2026.png', { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Mon Ballon d’Or 2026' })
      return 'shared'
    } catch { /* partage annulé : on télécharge */ }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = file.name
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}
