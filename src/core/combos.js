// Le format du fichier qui porte les deux carnets 조합.
//
// Il est ici, dans le noyau, et pas dans le navigateur : le site l'écrit et
// le lit, et l'outil d'import de l'ancienne base l'écrit aussi. Un format
// défini à deux endroits finit par diverger — celui-ci n'a qu'une source.
//
//   {
//     kind: 'lotto.combos', version: 1,
//     auto:   [ { id, name, rang, form, filters, shifted?, savedAt } ],
//     manual: [ { id, name, rang, grids, pool, savedAt } ],
//   }
//
// Chaque onglet accepte aussi son propre export — `lotto.auto` ou
// `lotto.manual`, avec `entries` — pour qu'un fichier exporté d'un côté ne
// puisse pas être chargé de l'autre par mégarde.

export const BUNDLE = 'lotto.combos'
export const BUNDLE_VERSION = 1

export const AUTO_KIND = 'lotto.auto'
export const MANUAL_KIND = 'lotto.manual'

// Le 연금복권 a ses propres carnets : ce sont des **billets**, pas des
// grilles, et un billet chargé dans le carnet du 6/45 n'aurait aucun sens.
export const PENSION_AUTO_KIND = 'pension.auto'
export const PENSION_GRIDS_KIND = 'pension.grids'

/** Les champs du formulaire 자동조합, dans l'ordre de l'écran. */
export const AUTO_FIELDS = [
  'preset', 'add', 'remove', 'sections', 'fix', 'sumStart', 'sumEnd',
  'low', 'odd', 'ac', 'headSum', 'tailSum', 'carry',
  'primes', 'composites', 'mult2', 'mult3', 'mult4', 'mult5',
]

/** Un formulaire vide — le point de départ, et le socle d'un import. */
export function emptyForm() {
  return {
    preset: 'all',
    add: [], remove: [], sections: [], fix: [],
    sumStart: '', sumEnd: '',
    low: [], odd: [], ac: [], headSum: [], tailSum: [], carry: [],
    primes: [], composites: [], mult2: [], mult3: [], mult4: [], mult5: [],
  }
}

// ────────────────────────────────────────────────── d'où vient une grille

/**
 * Les trois écrans qui produisent des combinaisons.
 *
 * Une grille enregistrée porte sa provenance : 조합결과 les range par là, et
 * une grille tapée à la main ne se confond pas avec une grille sortie du
 * générateur. Les enregistrements d'avant ce champ sont du 수동 — c'était
 * le seul écran qui savait enregistrer.
 */
export const GRID_SOURCES = [
  { key: 'general', label: '일반조합' },
  { key: 'auto', label: '자동조합' },
  { key: 'manual', label: '수동조합' },
]

export const sourceOf = (entry) => entry?.source ?? 'manual'
export const sourceLabel = (key) =>
  GRID_SOURCES.find((s) => s.key === key)?.label ?? key

// ──────────────────────────────────────────────────────── ce qu'elle a fait

/**
 * Le rang d'une grille, sur un tirage connu.
 *
 * Les règles du 6/45, sans arrangement : six numéros font le 1등, cinq plus
 * le bonus le 2등, cinq le 3등, quatre le 4등, trois le 5등. En dessous,
 * rien — le mot de l'ancien site pour ça était 꽝.
 */
export function rankOf(matched, bonus = false) {
  if (matched >= 6) return 1
  if (matched === 5) return bonus ? 2 : 3
  if (matched === 4) return 4
  if (matched === 3) return 5
  return null
}

/** Les gains fixes, les seuls qui ne dépendent pas du nombre de gagnants. */
export const FIXED_PRIZE = { 4: 50000, 5: 5000 }

/**
 * Ce qu'une grille a attrapé d'un tirage.
 *
 * `draw` est le tirage complet — six numéros puis le bonus, dans cet ordre,
 * comme `sequenceAt` le rend.
 */
export function scoreGrid(grid, draw) {
  if (!draw) return null
  const main = draw.slice(0, 6)
  const bonusNumber = draw[6]
  const hits = grid.filter((n) => main.includes(n))
  const bonus = grid.includes(bonusNumber)
  return { hits, matched: hits.length, bonus, rank: rankOf(hits.length, bonus) }
}

/**
 * La distribution attendue des 당첨 여부, si la grille était tirée au sort.
 *
 * Loi hypergéométrique : six numéros pris parmi 45, combien retombent sur
 * les six tirés. `P(k) = C(6,k)·C(39,6−k) / C(45,6)`.
 *
 * C'est le chiffre sans lequel « j'ai fait trois numéros deux fois » ne veut
 * rien dire. Avec lui, on voit que trois numéros arrivent à peu près une
 * fois sur quarante-cinq (1/44,6), et qu'en faire deux sur quatre-vingt-huit
 * grilles est exactement ce que ferait le hasard.
 */
export function expectedHits() {
  const total = choose(45, 6)
  return Array.from({ length: 7 }, (_, k) =>
    (choose(6, k) * choose(39, 6 - k)) / total)
}

function choose(n, k) {
  if (k < 0 || k > n) return 0
  let out = 1
  for (let i = 0; i < k; i++) out = (out * (n - i)) / (i + 1)
  return Math.round(out)
}

// ────────────────────────────────────────────── 연금복권 : le rang d'un billet

/**
 * Les huit rangs du 연금복권, et ce qu'ils rapportent.
 *
 * Un jeu de billet, pas de grille : on ne compte pas des numéros trouvés
 * mais des **chiffres de queue**. 3등 à 7등 ne regardent que la fin du
 * numéro et se moquent du 조 — c'est ce qui donne ces cotes en 1 qui se
 * répètent, 1/111, 1/1 111, et le 7등 qui tombe une fois sur onze.
 *
 * `key` sert de clef d'affichage ; le 보너스 n'a pas de numéro de rang, il
 * est tiré à part.
 */
export const PENSION_RANKS = [
  { key: '1', label: '1등', match: '조 + 여섯 자리', odds: 5000000, prize: 700_0000 * 12 * 20, annuity: true },
  { key: '2', label: '2등', match: '여섯 자리 · 조는 다름', odds: 1250000, prize: 100_0000 * 12 * 10, annuity: true },
  { key: 'B', label: '보너스', match: '보너스 여섯 자리', odds: 1000000, prize: 100_0000 * 12 * 10, annuity: true },
  { key: '3', label: '3등', match: '뒤 다섯 자리', odds: 111111, prize: 1000000 },
  { key: '4', label: '4등', match: '뒤 네 자리', odds: 11111, prize: 100000 },
  { key: '5', label: '5등', match: '뒤 세 자리', odds: 1111, prize: 50000 },
  { key: '6', label: '6등', match: '뒤 두 자리', odds: 111, prize: 5000 },
  { key: '7', label: '7등', match: '뒤 한 자리', odds: 11, prize: 1000 },
]

export const pensionRank = (key) => PENSION_RANKS.find((r) => r.key === key) ?? null

/** Combien de chiffres coïncident **par la fin**. */
export function tailMatch(a, b) {
  let k = 0
  while (k < a.length && k < b.length && a[a.length - 1 - k] === b[b.length - 1 - k]) k++
  return k
}

/**
 * Ce qu'un billet a gagné à un tirage.
 *
 * `ticket` est `{ group, digits }` ; `draw` est `{ group, digits, bonus }`.
 *
 * L'ordre des tests est celui des gains, pas celui des rangs : le 보너스
 * (1,2억 en rente) passe avant le 3등 (100만), bien que sa cote soit
 * meilleure. On gagne le meilleur lot, pas le premier rencontré.
 */
export function scoreTicket(ticket, draw) {
  if (!draw) return null
  const digits = [...ticket.digits]
  const tail = tailMatch(digits, draw.digits)
  const bonus = draw.bonus
    ? tailMatch(digits, draw.bonus) === digits.length : false

  let key = null
  if (tail === digits.length) key = ticket.group === draw.group ? '1' : '2'
  else if (bonus) key = 'B'
  else if (tail >= 5) key = '3'
  else if (tail === 4) key = '4'
  else if (tail === 3) key = '5'
  else if (tail === 2) key = '6'
  else if (tail === 1) key = '7'

  return { tail, bonus, key, rank: key ? pensionRank(key) : null }
}

/**
 * Ce que le hasard donnerait, rang par rang — les cotes publiées, retournées.
 *
 * Elles se recalculent : un chiffre de queue vaut 1/10, et pour s'arrêter
 * *exactement* là il faut que le suivant tombe à côté, d'où le 9/10. Un test
 * vérifie que ce calcul redonne bien les cotes de `rules.js`.
 */
export function pensionExpected() {
  return Object.fromEntries(PENSION_RANKS.map((r) => [r.key, 1 / r.odds]))
}

// ─────────────────────────────────────────────────────────────── le carnet

/**
 * Un carnet : une clé de stockage, un genre de fichier, et rien d'autre.
 *
 * Le stockage est passé, pas supposé. Le navigateur donne `localStorage` ;
 * un test donne une Map. La logique — les identifiants, l'ajout qui n'écrase
 * pas, le refus d'un fichier du mauvais genre — est ici, où elle se teste,
 * et pas dans un module qui exigerait un navigateur pour tourner.
 *
 * `storage` est une **fonction** : `localStorage` peut lever à la simple
 * lecture (navigation privée, stockage bloqué), et un module ne doit pas
 * tomber au chargement.
 */
export function carnet({ key, kind, slot, storage }) {
  const read = () => {
    try {
      const raw = storage().getItem(key)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const write = (entries) => {
    try {
      storage().setItem(key, JSON.stringify(entries))
      return true
    } catch {
      return false
    }
  }

  /** Les enregistrements, du plus récent au plus ancien. */
  const load = () => read()

  const nextId = (entries) => 1 + entries.reduce((max, e) => Math.max(max, e.id ?? 0), 0)

  /**
   * Enregistre sous un nom. Tout ce qui n'est ni `name` ni `rang` est gardé
   * tel quel : des grilles pour le 수동, un formulaire pour le 자동.
   *
   * L'identifiant vient du compteur, pas de l'horloge : deux enregistrements
   * dans la même seconde doivent rester distincts.
   */
  const save = ({ name, rang, ...rest }) => {
    const entries = load()
    const entry = {
      id: nextId(entries),
      name: name?.trim() || `${rang}회`,
      rang,
      ...rest,
      savedAt: new Date().toISOString(),
    }
    return write([entry, ...entries]) ? entry : null
  }

  const remove = (id) => write(load().filter((e) => e.id !== id))

  /** Le fichier d'export — c'est la copie que l'on peut ranger ailleurs. */
  const toFile = () => JSON.stringify({ kind, version: 1, entries: load() }, null, 2)

  /**
   * Reprend un fichier d'export, ou le fichier d'ensemble. Ajoute, ne
   * remplace pas : importer deux fois la même sauvegarde ne doit pas effacer
   * ce qu'on a saisi entre-temps.
   */
  const fromFile = (text) => {
    const parsed = JSON.parse(text)
    const incoming = parsed?.kind === kind && Array.isArray(parsed.entries)
      ? parsed.entries
      : parsed?.kind === BUNDLE && Array.isArray(parsed[slot])
        ? parsed[slot]
        : null
    if (!incoming) throw new Error('이 파일은 저장 파일이 아닙니다')

    const entries = load()
    let id = nextId(entries)
    const added = incoming.map((e) => ({ ...e, id: id++ }))
    if (!write([...added, ...entries])) throw new Error('브라우저가 저장을 거부했습니다')
    return added.length
  }

  /** Le stockage est-il utilisable ici ? */
  const available = () => {
    try {
      const probe = `${key}.probe`
      storage().setItem(probe, '1')
      storage().removeItem(probe)
      return true
    } catch {
      return false
    }
  }

  return { key, kind, slot, load, save, remove, toFile, fromFile, available }
}
