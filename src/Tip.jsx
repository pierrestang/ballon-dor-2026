/** Élément (icône, intitulé) dont le libellé complet s'affiche au survol (ou au focus
    clavier), sans délai, dans une infobulle au-dessus (`.tip::after`, styles.css). */
export default function Tip({ label, children }) {
  return <span className="tip" data-tip={label} tabIndex={0}>{children}</span>
}
