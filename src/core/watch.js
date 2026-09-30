// 감시 — la machine tire-t-elle toujours juste, cette semaine ?
//
// Les cinq tests du rapport 무작위성 regardent le passé entier : un défaut
// qui apparaît en 2027 y serait noyé dans 1 240 tirages sains pendant des
// années. Ce fichier pose la question au présent, avec l'outil du contrôle
// qualité en usine : la somme cumulée (CUSUM). Chaque semaine, chaque
// accumulateur reçoit l'écart standardisé de la semaine, moins une marge k ;
// une semaine normale le ramène vers zéro, un écart persistant le fait
// monter. Au-dessus de h : alerte.
//
// Tout est une fonction pure des tirages — rien à stocker, rien à
// resynchroniser : on rejoue l'histoire à chaque ouverture, et l'état du
// jour est ce qu'on lit à la fin.
//
// Quatre surveillances :
//
//   freq     45 accumulateurs — un numéro sort trop ou trop peu
//   order    45 — un numéro sort trop tôt ou trop tard (공나온 순서)
//   machine  135 — un numéro, sur une machine donnée
//   carry    1 — le nombre de numéros repris du tirage précédent
//
// Calibration honnête, à lire avant de se réjouir d'un écran vert :
//
//   * h est calé pour au plus UNE fausse alerte par décennie sur les 226
//     accumulateurs réunis (approximation de Siegmund, deux côtés).
//   * k vise un défaut précis : un numéro qui sort DEUX FOIS trop souvent
//     (freq, machine), une boule qui sort UNE POSITION trop tôt (order).
//     Pour ce défaut-là, le délai moyen de détection est de l'ordre de
//     deux ans et demi (freq) et de neuf ans (order) — parce qu'il n'y a
//     qu'un tirage par semaine. Un défaut plus petit met plus longtemps ;
//     un défaut énorme (numéro qui ne sort plus) se voit en quelques mois.
//
// Ce que ça vaut : la seule surveillance statistique indépendante du
// lotto 6/45, mise à jour chaque samedi. Ce que ça ne fait pas : prédire.

import { NMAX, PICK } from './draws.js'

const P = PICK / NMAX                       // 0,1333
const SIGMA = Math.sqrt(P * (1 - P))        // 0,340
const POS_MEAN = (PICK + 1) / 2             // 3,5
const POS_SIGMA = Math.sqrt((PICK * PICK - 1) / 12)   // 1,708
// Numéros repris du tirage précédent : hypergéométrique (45, 6, 6).
const CARRY_MEAN = PICK * PICK / NMAX       // 0,8
const CARRY_SIGMA = Math.sqrt(PICK * PICK * (NMAX - PICK) * (NMAX - PICK) / (NMAX * NMAX * (NMAX - 1)))

export const WEEKS_PER_DECADE = 522
export const ACCUMULATORS = 45 + 45 + 135 + 1

/** Le seuil h (en σ) pour une ARL₀ donnée et une marge k — Siegmund. */
export function threshold(k, arl0) {
  return Math.log(2 * k * k * arl0) / (2 * k)
}

/** Une surveillance : marge k, seuil h, délai moyen pour le défaut visé. */
function spec(delta, unitWeeks) {
  const k = delta / 2
  const arl0 = WEEKS_PER_DECADE * ACCUMULATORS * 2   // deux côtés
  const h = threshold(k, arl0)
  return { k, h, delay: (h / (delta - k)) * unitWeeks }
}

export const SPECS = {
  freq: spec(P / SIGMA, 1),                   // ×2 sur un numéro
  order: spec(1 / POS_SIGMA, 1 / P),           // une position, par apparition
  machine: spec(P / SIGMA, 3),                 // ×2, mais une machine sur trois
  carry: spec(CARRY_MEAN / CARRY_SIGMA, 1),    // ×2 sur les reprises
}

/** Un accumulateur CUSUM deux côtés. `step(z)` ; `hi`/`lo` ≥ 0 ; `peak`. */
export function cusum(k) {
  const a = { hi: 0, lo: 0, peak: 0, peakAt: null, n: 0 }
  return {
    a,
    step(z, at) {
      a.hi = Math.max(0, a.hi + z - k)
      a.lo = Math.max(0, a.lo - z - k)
      a.n++
      const m = Math.max(a.hi, a.lo)
      if (m > a.peak) { a.peak = m; a.peakAt = at }
      return m
    },
  }
}

/**
 * Rejoue l'histoire. `draws` est un Draws ; `order` et `hogi` des Maps
 * (회차 → [six numéros dans l'ordre], 회차 → 1|2|3), facultatives.
 * Rend, par surveillance, la liste des accumulateurs et un résumé.
 */
export function watch(draws, { order = null, hogi = null } = {}) {
  const freq = Array.from({ length: NMAX + 1 }, () => cusum(SPECS.freq.k))
  const ord = Array.from({ length: NMAX + 1 }, () => cusum(SPECS.order.k))
  const mach = [1, 2, 3].map(() => Array.from({ length: NMAX + 1 }, () => cusum(SPECS.machine.k)))
  const carry = cusum(SPECS.carry.k)

  let prev = null
  // Le maximum des accumulateurs à chaque semaine — la courbe de l'écran.
  const trail = { freq: [], order: [], machine: [], carry: [] }

  for (let i = 0; i < draws.n; i++) {
    const rang = draws.rangs[i]
    const set = new Set(draws.numbersAt(i))
    let maxF = 0
    for (let n = 1; n <= NMAX; n++) {
      maxF = Math.max(maxF, freq[n].step(((set.has(n) ? 1 : 0) - P) / SIGMA, rang))
    }
    trail.freq.push(maxF)

    if (prev) {
      let repeats = 0
      for (const n of set) if (prev.has(n)) repeats++
      trail.carry.push(carry.step((repeats - CARRY_MEAN) / CARRY_SIGMA, rang))
    } else trail.carry.push(0)
    prev = set

    const seq = order?.get(rang)
    let maxO = trail.order.at(-1) ?? 0
    if (seq && seq.length === PICK) {
      maxO = 0
      seq.forEach((n, p) => { maxO = Math.max(maxO, ord[n].step((p + 1 - POS_MEAN) / POS_SIGMA, rang)) })
      // Les numéros absents ne bougent pas : le max courant reste le max global.
      for (let n = 1; n <= NMAX; n++) maxO = Math.max(maxO, ord[n].a.hi, ord[n].a.lo)
    }
    trail.order.push(maxO)

    const m = hogi?.get(rang)
    let maxM = trail.machine.at(-1) ?? 0
    if (m >= 1 && m <= 3) {
      const row = mach[m - 1]
      for (let n = 1; n <= NMAX; n++) row[n].step(((set.has(n) ? 1 : 0) - P) / SIGMA, rang)
      maxM = 0
      for (const r of mach) for (let n = 1; n <= NMAX; n++) maxM = Math.max(maxM, r[n].a.hi, r[n].a.lo)
    }
    trail.machine.push(maxM)
  }

  const summarize = (key, list, label) => {
    const h = SPECS[key].h
    const rows = list.map(({ a, label: l }) => ({
      label: l, hi: a.hi, lo: a.lo, value: Math.max(a.hi, a.lo), peak: a.peak, peakAt: a.peakAt,
      ratio: Math.max(a.hi, a.lo) / h, state: state(Math.max(a.hi, a.lo) / h),
    })).sort((x, y) => y.value - x.value)
    return { key, label, h, k: SPECS[key].k, delay: SPECS[key].delay, rows,
             worst: rows[0], state: rows[0]?.state ?? 'ok', trail: trail[key] }
  }
  const named = (arr, f) => arr.slice(1).map((c, i) => ({ a: c.a, label: f(i + 1) }))
  return {
    rangs: Array.from(draws.rangs),
    freq: summarize('freq', named(freq, (n) => `${n}`), '번호 빈도'),
    order: summarize('order', named(ord, (n) => `${n}`), '공 나온 자리'),
    machine: summarize('machine', mach.flatMap((row, m) => named(row, (n) => `${m + 1}호기 · ${n}`)), '추첨기별 빈도'),
    carry: summarize('carry', [{ a: carry.a, label: '이월 개수' }], '이월'),
  }
}

/** 정상 sous la moitié du seuil, 주의 au-dessus, 경보 au-delà du seuil. */
export function state(ratio) {
  return ratio >= 1 ? 'alarm' : ratio >= 0.5 ? 'watch' : 'ok'
}
