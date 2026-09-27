// Partie de « Mon classement » enregistrée dans le navigateur (Game.jsx l'écrit ; Carousel.jsx lit
// seulement `done`, pour savoir si la transition de l'intro mène à l'annonce du Ballon d'Or).
export const GAME_STORE = 'bo2026-classement-v2'
export const OLD_GAME_STORE = 'bo2026-classement'   // ancien format en poules, abandonné

/** Classement de la partie enregistrée déjà fait. */
export const gameFinished = () => {
  try { return !!JSON.parse(localStorage.getItem(GAME_STORE))?.done } catch { return false }
}
