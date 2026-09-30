// Les 예고 des lots de 조합결과 : calculés une fois, en arrière-plan, puis
// gardés.
//
// `profiles[clé]` vaut `undefined` (pas encore demandé), `'pending'` (en
// calcul), ou le résultat de `lotProfile`. La clé change si le lot change
// (id, date d'enregistrement, nombre de grilles) : un 예고 ne peut pas
// survivre à un lot qu'il ne décrit plus.
//
// Le résultat est aussi rangé dans le navigateur : rouvrir 조합결과 ne
// relance pas une minute de calcul pour un lot déjà vu. Si le stockage est
// plein, on le garde seulement pour la visite — rien ne casse.

const KEY = 'lotto.profile.v1'

function readCache() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export const profiles = $state(readCache())

function persist() {
  try {
    const done = Object.fromEntries(Object.entries(profiles).filter(([, v]) => v && v !== 'pending'))
    localStorage.setItem(KEY, JSON.stringify(done))
  } catch { /* stockage plein : le 예고 vaut pour cette visite */ }
}

let worker = null
function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./profile.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    profiles[data.key] = data.error ? { error: data.error } : data.profile
    persist()
  }
  return worker
}

/** La clé d'un lot enregistré. */
export const profileKey = (entry) =>
  `${entry.id}:${entry.savedAt ?? ''}:${entry.grids?.length ?? 0}`

/**
 * Demande le 예고 d'un lot s'il n'est ni connu ni en cours. Les demandes
 * passent l'une après l'autre dans le même fil : la première ouverte est
 * la première servie.
 */
export function requestProfile(key, grids) {
  if (profiles[key] !== undefined || !grids.length) return
  profiles[key] = 'pending'
  const flat = new Int8Array(grids.length * 6)
  grids.forEach((g, i) => flat.set(g.slice(0, 6), i * 6))
  getWorker().postMessage({ key, flat }, [flat.buffer])
}
