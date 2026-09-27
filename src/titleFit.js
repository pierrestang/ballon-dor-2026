// Titre de page et description dessous (« DUEL » sur la sélection du duel, « LES CANDIDATS » sur
// le choix du joueur) : quand le titre est plus long, la description est espacée pour faire sa
// longueur ; quand il est plus court (« DUEL »), les deux gardent leur espacement normal (titre
// resserré, 27/09/2026). `title` et `sub` : les <span> du texte (display: inline-block).

export function fitTitle(title, sub) {
  if (!title || !sub) return
  title.style.letterSpacing = ''
  title.style.marginRight = ''
  sub.style.letterSpacing = '0px'
  sub.style.marginRight = ''
  const hs = parseFloat(getComputedStyle(title).letterSpacing) || 0
  const tw = title.getBoundingClientRect().width - hs   // sans l'espacement après la dernière lettre
  const sw = sub.getBoundingClientRect().width
  if (tw >= sw) {
    const m = sub.textContent.length
    const ls = m > 1 ? (tw - sw) / (m - 1) : 0
    sub.style.letterSpacing = `${ls}px`
    sub.style.marginRight = `${-ls}px`   // pas d'espacement après la dernière lettre : centrée
  }
}

/** Calage au montage, une fois les polices chargées et au redimensionnement ; renvoie le
    nettoyage (pour useLayoutEffect). */
export function watchTitle(getTitle, getSub) {
  const fit = () => fitTitle(getTitle(), getSub())
  fit()
  document.fonts?.ready.then(fit)
  window.addEventListener('resize', fit)
  return () => window.removeEventListener('resize', fit)
}
