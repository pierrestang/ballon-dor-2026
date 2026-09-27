// Postes en toutes lettres (infobulle des abréviations BU, AD… ; POSTES dans excel_vers_json.py).
// Module sans dépendance : importé aussi par le build (contenu statique, scripts/contenu_statique.mjs).
const POSTE_LABELS = {
  BU: 'Buteur', AD: 'Ailier droit', AG: 'Ailier gauche',
  MDC: 'Milieu défensif central', MOC: 'Milieu offensif central',
}
export const posteLabel = (poste) => poste.split('/').map((p) => POSTE_LABELS[p] ?? p).join(' / ')
