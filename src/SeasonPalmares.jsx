import { m } from 'framer-motion'
import { asset } from './data'
import { RollText } from './FinalPlayers'

// Palmarès de la saison (collectif, individuel), commun au bloc du tableau (mobile) et à la
// colonne à côté du joueur (grand écran).

// Titres collectifs du palmarès (mobile) : les compétitions gagnées, avec leur logo, sous le nom
// du titre du palmarès (« MLS Cup » plutôt que la ligne « MLS » du tableau).
const collectiveTitles = (player) => {
  const won = player.competitions.filter((c) => c.trophee)
  const names = player.collectif.map((t) => t.titre)
  const free = names.filter((n) => !won.some((c) => c.nom === n))
  return won.map((c) => ({ nom: names.includes(c.nom) ? c.nom : free.shift() ?? c.nom, logo: c.logo, won: true }))
}
// Puis, en plus sombre (sans compter dans les titres) : finales perdues et 2e place en
// championnat, demi-finales perdues et 3e place en championnat. Une 3e ou 4e place en coupe
// (Coupe du monde : match pour la 3e place) est une demi-finale perdue.
const nearLabel = (c) => {
  if (c.trophee) return null
  if (c.type === 'championnat') return c.resultat === '2e' ? '2ème place' : c.resultat === '3e' ? '3ème place' : null
  if (c.resultat === 'Finale') return 'Finaliste'
  return c.resultat === 'Demi-finale' || /^[34]e$/.test(c.resultat) ? 'Demi-finaliste' : null
}
const nearTitles = (player) => ['Finaliste', '2ème place', 'Demi-finaliste', '3ème place'].flatMap((label) => player.competitions
  .filter((c) => nearLabel(c) === label).map((c) => ({ nom: c.nom, logo: c.logo, sub: label })))

/** Palmarès du joueur : titres collectifs (logo de la compétition ; finales, demi-finales et
    places d'honneur en championnat ensuite, atténuées) et distinctions individuelles (logo, nom de
    la compétition dessous ; places d'honneur atténuées), chacun avec son nombre de titres
    (distinctions : les 1ers). Mobile : dans le bloc du tableau ; grand écran : à côté du joueur
    (SidePanel, FinalPlayers.jsx). `r` : apparition (FinalTables). */
export default function SeasonPalmares({ player, r = () => ({}) }) {
  // Textes qui défilent au changement de joueur (et à l'apparition d'une ligne).
  const roll = (t) => <RollText text={t} trigger={player.id} onMount />
  const coll = collectiveTitles(player)
  const near = nearTitles(player)
  const wins = player.individuel.filter((t) => t.rang === 1).length
  return (
    <m.div className="final-table-palm" {...r(1)}>
      <div className="final-table-palm-col">
        <h3>Collectif{coll.length > 0 && <b>{roll(String(coll.length))}</b>}</h3>
        {coll.length + near.length ? (
          <ul>
            {[...coll, ...near].map((t, i) => (
              <li key={i} className={t.won ? undefined : 'is-minor'}>
                <img className="final-table-palm-logo" src={asset(t.logo)} alt="" loading="lazy" width="36" height="36" />
                <span>{roll(t.nom)}{t.sub && <small>{roll(t.sub)}</small>}</span>
              </li>
            ))}
          </ul>
        ) : <p className="final-table-palm-empty">Aucun titre</p>}
      </div>
      <div className="final-table-palm-col">
        <h3>Individuel{wins > 0 && <b>{roll(String(wins))}</b>}</h3>
        {player.individuel.length ? (
          <ul>
            {player.individuel.map((t, i) => (
              <li key={i} className={t.rang > 1 ? 'is-minor' : undefined}>
                <img className="final-table-palm-logo" src={asset(t.logo)} alt="" loading="lazy" width="36" height="36" />
                <span>{roll(t.titre.split(' — ')[0])}<small>{roll(t.competition)}</small></span>
              </li>
            ))}
          </ul>
        ) : <p className="final-table-palm-empty">Aucune distinction</p>}
      </div>
    </m.div>
  )
}

