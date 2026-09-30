// Les huit analyses de la plateforme, en fonctions pures et paramétrées.
//
// Elles remplacent 144 classes de vues et ~14 000 lignes de l'ancien
// `customeruser/views.py` :
//
//   흐름   gaps, flow        écarts entre sorties, numéro par numéro
//   차뜨   temperature       hot · midle · cold · dead
//   구간   sections          les cinq tranches de dizaines
//   이월   carryover         voir metrics.js
//   친구   companions        co-occurrences, matrice 45 × 45
//   중복   overlap           recouvrement sur une fenêtre glissante
//   분포   distribution      histogramme d'un indicateur
//   위치   positions         fréquence par position de boule
//
// Aucune ne prend de paramètre venant d'une URL : elles prennent un
// `Draws` et des entiers.

import { FULL, NMAX, PICK, SECTIONS, TEMPERATURE_BANDS } from './draws.js'
import { choose } from './generator.js'

const WIDTH = NMAX + 1          // colonne 0 inutilisée : l'indice est le numéro

/**
 * (N, 46) — l'écart de chaque numéro à chaque tirage.
 *
 * `gaps[i * 46 + k]` = nombre de tirages depuis la dernière sortie du
 * numéro k, au moment du tirage i. Vaut 0 si k sort au tirage i. Tant
 * qu'un numéro n'est jamais sorti, l'écart se compte depuis le début de
 * l'historique — `i + 1` — comme le faisait la table `numberpattern`.
 *
 * C'est la matrice 흐름, que l'ancienne plateforme stockait sur 1 238
 * lignes × 45 colonnes de texte. Elle se reconstruit en un passage.
 */
export function gaps(draws, { withBonus = false } = {}) {
  const mask = draws.mask({ withBonus })
  const out = new Int16Array(draws.n * WIDTH)
  const last = new Int32Array(WIDTH).fill(-1)

  for (let i = 0; i < draws.n; i++) {
    const base = i * WIDTH
    for (let k = 1; k <= NMAX; k++) {
      if (mask[base + k]) { out[base + k] = 0; last[k] = i }
      else out[base + k] = i - last[k]     // jamais sorti (−1) → i + 1
    }
  }
  return out
}

/**
 * (N, 46) — la **série** de chaque numéro à chaque tirage.
 *
 * `runs[i * 46 + k]` vaut 0 si le numéro k ne sort pas au tirage i, 1 s'il
 * sort sans être au tirage précédent, 2 s'il y était déjà, 3 s'il était aux
 * deux précédents, etc. Autrement dit : le rang du tirage dans la série en
 * cours.
 *
 * C'est l'information qui manquait à `gaps()`. Un écart ne dit que « il est
 * sorti » (0) ; il ne distingue pas 당첨 de 이월. Les drapeaux vivaient
 * jusqu'ici dans `cells()` de `board.js`, qui ne sert que le 패턴 et le
 * 차뜨 ; la matrice 흐름 n'y avait pas accès. On les calcule ici, dans la
 * même forme que `gaps()`, pour que les deux écrans disent la même chose.
 *
 * La série ne se poursuit qu'entre 회차 **consécutifs** — sur une base
 * tronquée, un trou de numérotation la coupe, exactement comme dans
 * `board.js`.
 */
export function runs(draws, { withBonus = false } = {}) {
  const mask = draws.mask({ withBonus })
  const out = new Int8Array(draws.n * WIDTH)

  for (let i = 0; i < draws.n; i++) {
    const base = i * WIDTH
    const prev = i > 0 && draws.rangs[i - 1] === draws.rangs[i] - 1
      ? (i - 1) * WIDTH : -1
    for (let k = 1; k <= NMAX; k++) {
      if (!mask[base + k]) continue
      out[base + k] = prev >= 0 && out[prev + k] ? out[prev + k] + 1 : 1
    }
  }
  return out
}

/**
 * Le nom coréen d'une série — les mêmes mots que la table `numberpattern`.
 *
 *   0 → null      pas sorti
 *   1 → 당첨      sorti, absent du 회차 précédent
 *   2 → 이월      série de deux
 *   3 → (1)이월   série de trois, etc.
 */
export const runFlag = (run) =>
  !run ? null : run === 1 ? '당첨' : run === 2 ? '이월' : `(${run - 2})이월`

/** 흐름 d'un seul numéro. Une fonction remplace les 45 classes `pattern*`. */
export function flow(draws, number, { withBonus = false } = {}) {
  if (!Number.isInteger(number) || number < 1 || number > NMAX) {
    throw new RangeError(`번호 ${number}: 1..${NMAX} 범위 밖입니다`)
  }
  const matrix = gaps(draws, { withBonus })
  const gap = new Int16Array(draws.n)
  const hits = []
  for (let i = 0; i < draws.n; i++) {
    gap[i] = matrix[i * WIDTH + number]
    if (gap[i] === 0) hits.push(i)
  }
  const intervals = hits.slice(1).map((h, k) => h - hits[k])
  return {
    number,
    rangs: draws.rangs,
    gap,
    hits: hits.length,
    intervals,
    currentGap: draws.n ? gap[draws.n - 1] : 0,
  }
}

export function flowSummary(draws, number, { withBonus = false } = {}) {
  const f = flow(draws, number, { withBonus })
  const histogram = {}
  for (const gap of f.intervals) histogram[gap] = (histogram[gap] ?? 0) + 1
  const mean = f.intervals.length
    ? f.intervals.reduce((a, b) => a + b, 0) / f.intervals.length : null
  return {
    number,
    hits: f.hits,
    currentGap: f.currentGap,
    gapMean: mean === null ? null : Math.round(mean * 100) / 100,
    gapMax: f.intervals.length ? Math.max(...f.intervals) : null,
    gapHistogram: sortNumericKeys(histogram),
  }
}

/**
 * 차뜨 — (N, 46) : la bande de chaque numéro à chaque tirage.
 *
 * Valeurs = index dans TEMPERATURE_BANDS (0 = hot … 3 = dead). La colonne
 * 0 vaut −1, elle est inutilisée.
 */
export function temperature(draws) {
  const matrix = gaps(draws)
  const out = new Int8Array(draws.n * WIDTH).fill(-1)
  for (let i = 0; i < draws.n; i++) {
    const base = i * WIDTH
    for (let k = 1; k <= NMAX; k++) {
      const g = matrix[base + k]
      for (let b = 0; b < TEMPERATURE_BANDS.length; b++) {
        const { min, max } = TEMPERATURE_BANDS[b]
        if (g >= min && g <= max) { out[base + k] = b; break }
      }
    }
  }
  return out
}

/**
 * (N, 4) — d'où venaient les six gagnants, tirage par tirage.
 *
 * Ligne i = combien de numéros du tirage i étaient hot / midle / cold /
 * dead **avant** ce tirage. C'est la question que posaient les 14 pages
 * `hotcold*`, en une seule matrice.
 */
export function temperatureOfWinners(draws) {
  const bands = temperature(draws)
  const width = TEMPERATURE_BANDS.length
  const out = new Int16Array(draws.n * width)
  for (let i = 1; i < draws.n; i++) {
    const previous = (i - 1) * WIDTH
    const row = draws.numbersAt(i)
    for (let k = 0; k < PICK; k++) {
      const band = bands[previous + row[k]]
      if (band >= 0) out[i * width + band]++
    }
  }
  return out
}

/** 구간 — (N, 5) : combien de numéros dans chacune des cinq tranches. */
export function sections(draws, { withBonus = true } = {}) {
  const width = SECTIONS.length
  const out = new Int8Array(draws.n * width)
  for (let i = 0; i < draws.n; i++) {
    const row = withBonus ? draws.fullAt(i) : draws.numbersAt(i)
    for (const value of row) {
      for (let s = 0; s < width; s++) {
        const [lo, hi] = SECTIONS[s]
        if (value >= lo && value <= hi) { out[i * width + s]++; break }
      }
    }
  }
  return out
}

/**
 * Fréquence de chaque signature 있음/점멸 des cinq 구간.
 *
 * Remplace les 12 classes `section*` : la sous-population (multiples,
 * premiers, pairs…) devient un filtre appliqué en amont sur `draws`.
 */
export function sectionSignatures(draws, { withBonus = true } = {}) {
  const counts = sections(draws, { withBonus })
  const width = SECTIONS.length
  const tally = new Map()
  for (let i = 0; i < draws.n; i++) {
    let label = ''
    for (let s = 0; s < width; s++) {
      label += counts[i * width + s] > 0 ? '있음' : '점멸'
    }
    tally.set(label, (tally.get(label) ?? 0) + 1)
  }
  return Object.fromEntries([...tally].sort((a, b) => b[1] - a[1]))
}

/**
 * (46, 46) — combien de fois i et j sont sortis ensemble.
 *
 * Diagonale = nombre de sorties du numéro. Une seule matrice remplace les
 * 45 boucles « amis » de l'ancien code.
 */
export function companions(draws, { withBonus = false } = {}) {
  const out = new Int32Array(WIDTH * WIDTH)
  const stride = withBonus ? 7 : PICK
  for (let i = 0; i < draws.n; i++) {
    const row = withBonus ? draws.fullAt(i) : draws.numbersAt(i)
    for (let a = 0; a < stride; a++) {
      out[row[a] * WIDTH + row[a]]++
      for (let b = a + 1; b < stride; b++) {
        out[row[a] * WIDTH + row[b]]++
        out[row[b] * WIDTH + row[a]]++
      }
    }
  }
  return out
}

export function companionsOf(draws, number, top = 10, { withBonus = false } = {}) {
  if (!Number.isInteger(number) || number < 1 || number > NMAX) {
    throw new RangeError(`번호 ${number}: 1..${NMAX} 범위 밖입니다`)
  }
  const matrix = companions(draws, { withBonus })

  // La diagonale porte le nombre de sorties du numéro lui-même : c'est le
  // dénominateur, et il est déjà calculé. Sans lui, « 27 fois ensemble » ne
  // veut rien dire — 27 sur 140 sorties et 27 sur 900 ne racontent pas la
  // même histoire.
  const hits = matrix[number * WIDTH + number]

  // Et le repère : quand le numéro sort, il reste `stride − 1` places à
  // prendre parmi les `NMAX − 1` autres. Chaque autre numéro a donc cette
  // chance-là d'être du voyage, sans qu'aucune affinité n'existe.
  const stride = withBonus ? FULL : PICK
  const expected = hits * (stride - 1) / (NMAX - 1)

  const pairs = []
  for (let k = 1; k <= NMAX; k++) {
    if (k === number) continue
    const together = matrix[number * WIDTH + k]
    if (together > 0) {
      pairs.push({
        number: k,
        together,
        share: hits ? together / hits : 0,
      })
    }
  }
  pairs.sort((a, b) => b.together - a.together || a.number - b.number)
  return { number, hits, expected, pairs: pairs.slice(0, top) }
}

/**
 * 중복 — combien des six numéros figuraient dans les `window` tirages
 * précédents.
 *
 * L'ancienne version faisait 15 652 requêtes SQL pour ce chiffre. Ici, une
 * somme cumulée : un seul passage.
 */
export function overlap(draws, window = 14) {
  const mask = draws.mask()
  // cumulative[i][k] = combien de fois k est sorti dans les i premiers tirages
  const cumulative = new Int32Array((draws.n + 1) * WIDTH)
  for (let i = 0; i < draws.n; i++) {
    for (let k = 1; k <= NMAX; k++) {
      cumulative[(i + 1) * WIDTH + k] =
        cumulative[i * WIDTH + k] + mask[i * WIDTH + k]
    }
  }
  const out = new Int8Array(draws.n)
  for (let i = 0; i < draws.n; i++) {
    const lo = Math.max(0, i - window)
    const row = draws.numbersAt(i)
    let seen = 0
    for (let k = 0; k < PICK; k++) {
      const value = row[k]
      if (cumulative[i * WIDTH + value] - cumulative[lo * WIDTH + value] > 0) seen++
    }
    out[i] = seen
  }
  return out
}

/**
 * Le repère de 중복 : combien de numéros on **devrait** retrouver.
 *
 * Les `window` tirages précédents laissent un pool de `T` numéros distincts.
 * Si le tirage suivant ignore ce pool — et c'est l'hypothèse à tester — il
 * en retombe en moyenne `PICK × T / NMAX`, sans plus. T grandit avec la
 * fenêtre et sature près de 45, ce qui suffit à expliquer que le 중복 monte
 * de 0.80 à 5.91 sans qu'aucune mémoire n'existe.
 *
 * Renvoie la moyenne de ce repère sur les tirages effectivement mesurables,
 * c'est-à-dire en sautant le premier, qui n'a pas de passé.
 */
export function overlapExpected(draws, window = 14) {
  if (draws.n < 2) return 0
  const mask = draws.mask()
  let total = 0
  for (let i = 1; i < draws.n; i++) {
    const lo = Math.max(0, i - window)
    let pool = 0
    for (let k = 1; k <= NMAX; k++) {
      // Un seul passage suffirait avec un cumul ; la fenêtre est bornée à
      // 50 tirages par l'écran, donc la boucle directe reste négligeable et
      // se lit sans reconstruire le tableau cumulé.
      for (let j = lo; j < i; j++) {
        if (mask[j * WIDTH + k]) { pool++; break }
      }
    }
    total += (PICK * pool) / NMAX
  }
  return total / (draws.n - 1)
}

/**
 * La loi complète de 중복, pas seulement sa moyenne : combien de 회차
 * devraient retrouver 0, 1, … PICK numéros du pool, si le tirage l'ignore.
 *
 * Pour un pool de `T` numéros, le nombre retrouvé suit l'hypergéométrique
 * C(T,k)·C(NMAX−T, PICK−k) / C(NMAX, PICK). Le pool change à chaque 회차,
 * donc on somme les lois une par une — même parcours qu'`overlapExpected`,
 * même premier tirage sauté. Renvoie `{ k: 회차 attendus }`, dont la somme
 * vaut `draws.n − 1`.
 */
export function overlapLaw(draws, window = 14) {
  const law = {}
  for (let k = 0; k <= PICK; k++) law[k] = 0
  if (draws.n < 2) return law
  const mask = draws.mask()
  const all = choose(NMAX, PICK)
  for (let i = 1; i < draws.n; i++) {
    const lo = Math.max(0, i - window)
    let pool = 0
    for (let k = 1; k <= NMAX; k++) {
      for (let j = lo; j < i; j++) {
        if (mask[j * WIDTH + k]) { pool++; break }
      }
    }
    for (let k = 0; k <= PICK; k++) {
      law[k] += choose(pool, k) * choose(NMAX - pool, PICK - k) / all
    }
  }
  return law
}

/**
 * Histogramme trié d'un indicateur.
 *
 * Remplace les 59 `GROUP BY` écrits à la main en Python dans l'original.
 */
export function distribution(values) {
  const tally = {}
  for (const value of values) tally[value] = (tally[value] ?? 0) + 1
  return sortNumericKeys(tally)
}

/** Fréquence de chaque numéro, position de boule par position de boule. */
export function positions(draws) {
  const out = []
  for (let p = 0; p < PICK; p++) out.push(distribution(placeColumn(draws, p)))
  out.push(distribution(draws.bonus))
  return out
}

/** Le nombre de positions : les six boules triées, plus le 보너스. */
export const PLACES = PICK + 1

/**
 * La colonne d'une position — le numéro qui l'occupe, 회차 par 회차.
 *
 * `p` va de 0 (일) à 5 (육) ; 6 est le 보너스. Les six numéros sont triés
 * avant d'être numérotés, donc 일 est toujours le plus petit : les valeurs
 * de la colonne 0 sont basses par **construction**, pas par hasard. La
 * remarque vaut pour toutes les positions, et c'est pour ça que la
 * comparaison entre deux positions n'a pas de sens.
 */
export function placeColumn(draws, p) {
  if (!Number.isInteger(p) || p < 0 || p >= PLACES) {
    throw new RangeError(`위치 ${p}: 0..${PLACES - 1} 범위 밖입니다`)
  }
  if (p === PICK) return Int8Array.from(draws.bonus)
  const column = new Int8Array(draws.n)
  for (let i = 0; i < draws.n; i++) column[i] = draws.numbersAt(i)[p]
  return column
}

/**
 * Le numéro d'une position devient-il 이월 — ressort-il, parmi les sept du
 * 회차 suivant ?
 *
 * Une série 0/1 par 회차 (le dernier n'a pas de suivant, donc n − 1
 * valeurs), son taux, et le repère : si le tirage suivant ignore le
 * précédent, n'importe quel numéro y figure avec la probabilité 7 / 45.
 * La position ne change rien à ce repère — 일 est le plus petit numéro par
 * construction, mais le suivant n'en sait rien.
 */
export function placeCarry(draws, p) {
  const column = placeColumn(draws, p)
  const mask = draws.mask({ withBonus: true })
  const series = new Int8Array(Math.max(0, draws.n - 1))
  let hits = 0
  for (let i = 0; i + 1 < draws.n; i++) {
    const v = mask[(i + 1) * WIDTH + column[i]] ? 1 : 0
    series[i] = v
    hits += v
  }
  const rounds = series.length
  const expectedRate = FULL / NMAX
  return {
    place: p,
    rounds,
    hits,
    rate: rounds ? hits / rounds : 0,
    expected: rounds * expectedRate,
    expectedRate,
    series,
  }
}

/**
 * Ce que le hasard donne à une position : la loi de la k-ième plus petite
 * boule parmi six tirées sur 45. P(일 = v) = C(v−1, 0) C(45−v, 5) / C(45, 6),
 * et ainsi de suite ; le 보너스 est uniforme. C'est le « 기대 » à poser à côté
 * de `counts` — la bosse de 일 vers les petits numéros est là par
 * construction, et cette courbe le montre avant toute lecture.
 *
 * Rend { v: probabilité } pour v = 1 … 45 ; multiplier par le nombre de 회차
 * donne l'effectif attendu.
 */
export function placeExpected(p) {
  if (!Number.isInteger(p) || p < 0 || p >= PLACES) {
    throw new RangeError(`위치 ${p}: 0..${PLACES - 1} 범위 밖입니다`)
  }
  const out = {}
  if (p === PICK) {
    for (let v = 1; v <= NMAX; v++) out[v] = 1 / NMAX
    return out
  }
  const total = choose(NMAX, PICK)
  for (let v = 1; v <= NMAX; v++) {
    out[v] = (choose(v - 1, p) * choose(NMAX - v, PICK - 1 - p)) / total
  }
  return out
}

/**
 * 당첨 위치 — tout ce que montraient les sept pages 일 … 보너스.
 *
 * L'ancien en faisait sept vues de plusieurs centaines de lignes chacune,
 * pour trois blocs identiques : le comptage par numéro, la suite dans le
 * temps, et le tableau 회차 / 당첨번호 qu'on filtrait par intervalle. Une
 * fonction paramétrée les remplace.
 *
 *   counts   번호 → combien de fois il a occupé cette position
 *   series   [{ rang, value }], du plus récent au plus ancien
 *   min/max  les bornes observées — ce que les menus 시작패턴 / 종료패턴
 *            proposaient, et rien de plus : l'ancien listait exactement les
 *            valeurs rencontrées, pas 1..45.
 */
export function placeFlow(draws, p) {
  const column = placeColumn(draws, p)

  const counts = {}
  for (let i = 0; i < draws.n; i++) {
    const v = column[i]
    if (v) counts[v] = (counts[v] ?? 0) + 1
  }

  const series = []
  for (let i = draws.n - 1; i >= 0; i--) {
    series.push({ rang: draws.rangs[i], value: column[i] })
  }

  const seen = Object.keys(counts).map(Number).sort((a, b) => a - b)
  const law = placeExpected(p)
  const expected = {}
  for (const v of Object.keys(law)) expected[v] = law[v] * draws.n
  return {
    place: p,
    counts: sortNumericKeys(counts),
    expected,
    values: seen,
    series,
    min: seen[0] ?? 0,
    max: seen.at(-1) ?? 0,
  }
}

/** Combien de fois chaque numéro 1..45 est sorti. */
export function frequency(draws, { withBonus = false } = {}) {
  const mask = draws.mask({ withBonus })
  const out = {}
  for (let k = 1; k <= NMAX; k++) {
    let count = 0
    for (let i = 0; i < draws.n; i++) count += mask[i * WIDTH + k]
    out[k] = count
  }
  return out
}

function sortNumericKeys(object) {
  return Object.fromEntries(
    Object.entries(object).sort((a, b) => Number(a[0]) - Number(b[0])))
}

/**
 * 모든번호 — le détail d'un seul numéro, tel que les 45 pages le montraient.
 *
 * L'ancienne plateforme avait une page par numéro (`patternun` … et leurs
 * 45 jumelles), chacune découpant son histoire en quatre comptages :
 *
 *   당첨 통계          les retours « frais » — il sort après une attente
 *   이월 통계          les retours qui ouvrent une série de deux ou plus
 *   전부 통계          les deux ensemble
 *   당첨안된번호 통계   les회차 où il n'est PAS sorti, par écart atteint
 *
 * Un piège, et c'est tout l'intérêt de relire l'ancien code plutôt que de
 * le deviner : pour une sortie en série, la valeur retenue n'est pas 1.
 * `views.py` L2850 remonte de deux crans (`listwin[index-2] + 2`), de trois
 * pour `(1)이월`, et ainsi de suite — autrement dit il compte **l'attente
 * qui précédait le début de la série**, pas l'intervalle depuis la veille.
 * Un numéro absent vingt tirages puis sorti deux fois de suite compte 20 et
 * 21, pas 20 et 1. C'est une autre question, et c'est la bonne : elle porte
 * sur le retour, pas sur la répétition.
 */
export function numberFlow(draws, number, { withBonus = true } = {}) {
  if (!Number.isInteger(number) || number < 1 || number > NMAX) {
    throw new RangeError(`번호 ${number}: 1..${NMAX} 범위 밖입니다`)
  }

  const series = []
  const won = new Map()
  const carried = new Map()
  const lost = new Map()
  const bump = (map, v) => map.set(v, (map.get(v) ?? 0) + 1)

  let last = 0          // dernier 회차 où il est sorti
  let anchor = 0        // dernière sortie AVANT la série en cours
  let run = 0           // rang dans la série en cours — 0 = pas en série

  for (let i = 0; i < draws.n; i++) {
    const rang = draws.rangs[i]
    // Une série ne franchit pas un trou de numérotation, comme dans
    // `board.js`. Sur la base complète il n'y en a pas ; sur une base
    // tronquée, ce garde-fou évite d'inventer un 이월 entre deux 회차 qui
    // ne se suivent pas.
    if (run && !(i > 0 && draws.rangs[i - 1] === rang - 1)) run = 0
    // Bonus compris par défaut : c'est ainsi que l'ancienne table
    // `numberpattern` comptait, et les 45 pages la lisaient telle quelle.
    const row = withBonus ? draws.fullAt(i) : draws.numbersAt(i)
    const width = withBonus ? FULL : PICK
    let here = false
    for (let k = 0; k < width; k++) if (row[k] === number) { here = true; break }

    if (!here) {
      const value = rang - last
      series.push({ rang, value, flag: null, run: 0 })
      bump(lost, value)
      run = 0
      continue
    }

    if (!run) anchor = last            // la série commence : on retient l'avant
    run++
    const value = rang - anchor
    // `flag` porte le mot exact de la table `numberpattern` — 당첨, 이월,
    // (1)이월… — pour que le graphique et la matrice nomment la même chose
    // de la même façon. Les deux histogrammes, eux, n'ont que deux bacs :
    // c'est ce que faisait l'ancien.
    series.push({ rang, value, flag: runFlag(run), run })
    bump(run === 1 ? won : carried, value)

    last = rang
  }

  const sorted = (map) => Object.fromEntries(
    [...map.entries()].sort((a, b) => a[0] - b[0]))

  const all = new Map(won)
  for (const [v, n] of carried) all.set(v, (all.get(v) ?? 0) + n)

  return {
    number,
    series,
    won: sorted(won),
    carried: sorted(carried),
    all: sorted(all),
    lost: sorted(lost),
  }
}
