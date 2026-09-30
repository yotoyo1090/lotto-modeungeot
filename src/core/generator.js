// Le générateur de grilles 6/45.
//
// L'ancienne plateforme bouclait en Python sur les 8 145 060 combinaisons de
// C(45,6), redéfinissait ses quatorze fonctions de filtrage **à l'intérieur**
// de la boucle, les évaluait deux fois par combinaison, et faisait deux
// requêtes SQL invariantes à chaque tour — environ une heure de calcul.
//
// La version Python de référence corrigeait cela en matérialisant l'espace
// dans un tableau numpy de 48,9 Mo mis en cache sur disque, puis en filtrant
// par masques. Excellent sur un serveur ; intenable dans un navigateur, où
// 49 Mo de données plus une vingtaine de colonnes d'indicateurs feraient
// plusieurs centaines de mégaoctets de mémoire.
//
// Ici, **rien n'est matérialisé**. Six boucles imbriquées parcourent l'espace
// en tenant à jour les indicateurs de façon incrémentale : le 총합, le compte
// de 저, les 배수, les 구간 d'un préfixe de trois numéros sont calculés une
// fois et servent aux ~12 000 grilles qui commencent par ce préfixe. Deux
// élagages coupent des branches entières avant d'atteindre les feuilles.
//
// Conséquence : aucun cache, aucun fichier, aucune dépendance — et le même
// fichier tourne dans le pré-calcul, dans le Web Worker et dans le MCP.
//
// Deux corrections de fond héritées de l'audit de l'original :
//
//   * `calculate_ac_value(...) != False` éliminait silencieusement les 180
//     grilles d'AC값 nul, même sans filtre AC actif (en JavaScript comme en
//     Python, 0 est faux). Les filtres sont ici des bornes explicites ;
//   * le seuil 저/고 était `< 23` pour le décompte et `<= 23` pour la liste.
//     Un seul seuil, celui de `draws.LOW_MAX`.

import { HEAD, IS_COMPOSITE, IS_PRIME, LOW_MAX, NMAX, PICK, SECTIONS, TAIL }
  from './draws.js'
import { MULTIPLES } from './metrics.js'
import { allows, criterion } from './criteria.js'
import { SMALL_MAX, popularity as popularityOf, popularityFrom, sharingFrom, sharingIndex }
  from './sharing.js'

/** C(45, 6) — la taille de l'espace complet. */
export const TOTAL_COMBINATIONS = choose(NMAX, PICK)

/**
 * Les critères, dans l'ordre où ils sont évalués.
 *
 * L'ordre n'est pas décoratif : les moins chers et les plus sélectifs
 * passent en premier, l'AC값 — le seul qui demande quinze soustractions —
 * ne voit que ce qui a survécu.
 */
export const CRITERIA = [
  'total', 'low', 'odd', 'multiples', 'primes', 'composites',
  'headSum', 'tailSum', 'sections', 'ac', 'sharing', 'match',
  // Ajoutés pour le 결과 필터 : la popularité chez ceux qui choisissent
  // (un réel, comme 분배), et le nombre de numéros communs avec un tirage
  // donné (`hitReference`, en général les sept d'un 회차 passé).
  'popularity', 'hit',
  // Ajoutés pour que chaque colonne du tableau 조합 ait son filtre :
  // les sommes (이월 · 소수 · 합성수 · 배수), la position d'où vient
  // chaque 이월, et la plus longue répétition d'un 앞자리 / 끝자리.
  'carriedSum', 'carriedPos', 'primeSum', 'compositeSum', 'multSums',
  'headRepeat', 'tailRepeat',
]

export const LABELS = {
  pool: '추천수 / 제외수',
  include: '고정수',
  total: '총합',
  low: '저고',
  odd: '홀짝',
  primes: '소수',
  composites: '합성수',
  headSum: '앞자리수합',
  tailSum: '끝자리수합',
  sections: '구간',
  ac: 'AC값',
  sharing: '분배',
  match: '대비',
  popularity: '수동 인기',
  hit: '당첨 개수',
  carriedSum: '이월합',
  carriedPos: '이월 위치',
  primeSum: '소수합',
  compositeSum: '합성수합',
  multSums: '배수합',
  headRepeat: '앞쌍',
  tailRepeat: '끝쌍',
  count: '개수 조건',
}

// Les emplacements de l'accumulateur, un jeu par profondeur.
const S_SUM = 0
const S_LOW = 1
const S_ODD = 2
const S_HEAD = 3
const S_TAIL = 4
const S_PRIME = 5
const S_COMP = 6
const S_AC_LO = 7        // écarts 1..31 vus, en bits
const S_AC_HI = 8        // écarts 32..44 vus, en bits
const S_MATCH = 9
const S_INCLUDE = 10
const S_MULT = 11        // 4 emplacements : 2, 3, 4, 5의배수
const S_SECT = 15        // 5 emplacements : les cinq 구간
const S_HIT = 20         // numéros communs avec `hitReference`
const S_CSUM = 21        // somme des numéros repris du tirage de référence
const S_BAD = 22         // numéros repris d'une position refusée
const S_PSUM = 23        // somme des 소수
const S_CPSUM = 24       // somme des 합성수
const S_MSUM = 25        // 4 emplacements : sommes des 2, 3, 4, 5의배수
const S_HEADC = 29       // 10 emplacements : combien de numéros par 앞자리
const S_TAILC = 39       // 10 emplacements : combien de numéros par 끝자리
const ACC = 49

/**
 * Cherche les grilles qui satisfont tous les critères.
 *
 * @param {object} filters  bornes incluses, `null` ou absent = pas de contrainte
 * @param {object} options  `limit`, ou `sample` + `seed` pour un tirage au sort
 * @returns {object} `{ grids, count, kept, candidates, rejected, elapsedMs }`
 */
export function generate(filters = {}, options = {}) {
  const started = now()
  const {
    limit = 1000,
    sample = null,
    seed = 0x5EED,
  } = options

  const spec = normalize(filters)
  const pool = spec.pool
  const size = pool.length

  // Comptes rendus : combien de grilles chaque critère a écarté, et
  // combien l'élagage a coupé sans jamais les construire.
  const rejected = new Map()
  for (const key of CRITERIA) rejected.set(key, 0)
  rejected.set('include', 0)
  rejected.set('count', 0)

  const candidates = size < PICK ? 0 : choose(size, PICK)
  const empty = {
    grids: new Int8Array(0), count: 0, kept: 0, candidates,
    rejected: report(rejected), elapsedMs: now() - started,
  }
  if (candidates === 0) return empty

  // --- tables auxiliaires du parcours -----------------------------------

  // Somme des `r` plus petits / plus grands numéros encore atteignables :
  // c'est ce qui permet d'abandonner une branche sur le 총합 seul.
  const prefix = new Int32Array(size + 1)
  for (let i = 0; i < size; i++) prefix[i + 1] = prefix[i] + pool[i]

  // Combien de 고정수 se trouvent à partir de l'indice i.
  const requiredAfter = new Int32Array(size + 1)
  for (let i = size - 1; i >= 0; i--) {
    requiredAfter[i] = requiredAfter[i + 1] + (spec.required[pool[i]] ? 1 : 0)
  }
  const requiredTotal = requiredAfter[0]

  const acc = new Int32Array((PICK + 1) * ACC)
  const chosen = new Int8Array(PICK)

  // --- collecte ---------------------------------------------------------

  const wanted = sample ?? limit
  const keepAll = wanted === null || wanted === Infinity
  const capacity = keepAll ? Math.min(candidates, 1_000_000) : wanted
  const store = new Int8Array(Math.max(0, capacity) * PICK)
  const random = mulberry32(seed >>> 0)
  let kept = 0

  const emit = () => {
    if (sample === null) {
      if (kept < capacity) store.set(chosen, kept * PICK)
    } else {
      // Échantillonnage par réservoir : chaque grille retenue a exactement
      // la même chance de figurer dans le tirage, sans qu'on ait besoin de
      // garder les millions d'autres.
      if (kept < capacity) store.set(chosen, kept * PICK)
      else {
        const slot = Math.floor(random() * (kept + 1))
        if (slot < capacity) store.set(chosen, slot * PICK)
      }
    }
    kept++
  }

  // --- le parcours ------------------------------------------------------

  const {
    total, low, odd, primes, composites, headSum, tailSum, ac, sharing, match, popularity, hit,
    carriedSum, carriedPos, primeSum, compositeSum, headRepeat, tailRepeat,
  } = spec

  // Les nouveaux accumulateurs ne sont tenus que si leur critère est actif :
  // une recherche qui ne les demande pas ne paie rien de plus qu'avant.
  const activeMSum = []
  spec.multSums.forEach((c, m) => { if (c) activeMSum.push([m, c]) })
  // Les sommes ne font que croître en descendant : un préfixe qui dépasse
  // déjà la borne haute ne donnera rien. [emplacement, critère, clé]
  const caps = []
  if (carriedSum !== null) caps.push([S_CSUM, carriedSum, 'carriedSum'])
  if (primeSum !== null) caps.push([S_PSUM, primeSum, 'primeSum'])
  if (compositeSum !== null) caps.push([S_CPSUM, compositeSum, 'compositeSum'])
  for (const [m, c] of activeMSum) caps.push([S_MSUM + m, c, 'multSums'])
  // Un seul drapeau pour tout le groupe : sans lui, la recherche la plus
  // courante paierait sept tests de plus par feuille, soit ~10 % de temps.
  const extra = caps.length > 0 || carriedPos !== null || headRepeat !== null || tailRepeat !== null

  function walk(depth, start) {
    // La dernière boucle porte à elle seule les 8,1 millions de feuilles,
    // contre 1,3 million de nœuds pour tous les étages au-dessus. Elle est
    // écrite à part : les valeurs du préfixe y sont lues une fois pour
    // toutes, et rien n'est réécrit dans l'accumulateur.
    if (depth === PICK - 1) return leaf(depth * ACC, start)

    const base = depth * ACC
    const next = base + ACC
    const remaining = PICK - depth

    for (let i = start; i <= size - remaining; i++) {
      // Élagage 고정수 : si les numéros obligatoires restants ne tiennent
      // plus dans ce qu'il reste à choisir, aucun i plus grand n'ira mieux.
      if (requiredTotal > 0) {
        const got = acc[base + S_INCLUDE]
        if (got + requiredAfter[i] < requiredTotal) {
          rejected.set('include', rejected.get('include') + choose(size - i, remaining))
          break
        }
      }

      const value = pool[i]
      const sum = acc[base + S_SUM] + value

      // Élagage 총합 : bornes de ce que la somme peut encore devenir.
      if (total !== null) {
        const r = remaining - 1
        if (sum + (prefix[i + 1 + r] - prefix[i + 1]) > total.max) {
          // La somme ne fera que croître avec i : la branche est close.
          rejected.set('total', rejected.get('total') + choose(size - i, remaining))
          break
        }
        if (sum + (prefix[size] - prefix[size - r]) < total.min) {
          rejected.set('total', rejected.get('total') + choose(size - 1 - i, r))
          continue
        }
      }

      chosen[depth] = value

      // Écarts deux-à-deux : on n'ajoute que ceux du nouveau numéro.
      let acLo = acc[base + S_AC_LO]
      let acHi = acc[base + S_AC_HI]
      for (let k = 0; k < depth; k++) {
        const gap = value - chosen[k]          // toujours > 0 : pool trié
        if (gap < 32) acLo |= 1 << gap
        else acHi |= 1 << (gap - 32)
      }

      acc[next + S_SUM] = sum
      acc[next + S_LOW] = acc[base + S_LOW] + (value <= LOW_MAX ? 1 : 0)
      acc[next + S_ODD] = acc[base + S_ODD] + (value & 1)
      acc[next + S_HEAD] = acc[base + S_HEAD] + HEAD[value]
      acc[next + S_TAIL] = acc[base + S_TAIL] + TAIL[value]
      acc[next + S_PRIME] = acc[base + S_PRIME] + IS_PRIME[value]
      acc[next + S_COMP] = acc[base + S_COMP] + IS_COMPOSITE[value]
      acc[next + S_AC_LO] = acLo
      acc[next + S_AC_HI] = acHi
      acc[next + S_MATCH] = acc[base + S_MATCH] + spec.referenceSet[value]
      acc[next + S_HIT] = acc[base + S_HIT] + spec.hitSet[value]
      acc[next + S_INCLUDE] = acc[base + S_INCLUDE] + (spec.required[value] ? 1 : 0)
      for (let m = 0; m < MULTIPLES.length; m++) {
        acc[next + S_MULT + m] =
          acc[base + S_MULT + m] + (value % MULTIPLES[m] === 0 ? 1 : 0)
      }
      for (let s = 0; s < SECTIONS.length; s++) {
        acc[next + S_SECT + s] = acc[base + S_SECT + s] + (SECTION_OF[value] === s ? 1 : 0)
      }
      if (extra) {
      if (carriedSum !== null) {
        acc[next + S_CSUM] = acc[base + S_CSUM] + (spec.referenceSet[value] ? value : 0)
      }
      if (carriedPos !== null) acc[next + S_BAD] = acc[base + S_BAD] + spec.badSet[value]
      if (primeSum !== null) acc[next + S_PSUM] = acc[base + S_PSUM] + (IS_PRIME[value] ? value : 0)
      if (compositeSum !== null) {
        acc[next + S_CPSUM] = acc[base + S_CPSUM] + (IS_COMPOSITE[value] ? value : 0)
      }
      for (let k = 0; k < activeMSum.length; k++) {
        const m = activeMSum[k][0]
        acc[next + S_MSUM + m] = acc[base + S_MSUM + m] + (value % MULTIPLES[m] === 0 ? value : 0)
      }
      if (headRepeat !== null) {
        for (let d = 0; d < 10; d++) acc[next + S_HEADC + d] = acc[base + S_HEADC + d]
        acc[next + S_HEADC + HEAD[value]]++
      }
      if (tailRepeat !== null) {
        for (let d = 0; d < 10; d++) acc[next + S_TAILC + d] = acc[base + S_TAILC + d]
        acc[next + S_TAILC + TAIL[value]]++
      }

      // Élagage sur les sommes et les répétitions : elles ne redescendent
      // jamais, donc un préfixe déjà au-dessus de la borne haute est perdu.
      if (caps.length || headRepeat !== null || tailRepeat !== null) {
        let over = null
        for (let k = 0; k < caps.length; k++) {
          if (acc[next + caps[k][0]] > caps[k][1].max) { over = caps[k][2]; break }
        }
        if (over === null && headRepeat !== null &&
            acc[next + S_HEADC + HEAD[value]] > headRepeat.max) over = 'headRepeat'
        if (over === null && tailRepeat !== null &&
            acc[next + S_TAILC + TAIL[value]] > tailRepeat.max) over = 'tailRepeat'
        if (over !== null) {
          rejected.set(over, rejected.get(over) + choose(size - 1 - i, remaining - 1))
          continue
        }
      }
      }  // extra

      // Élagage sur les critères de comptage : un préfixe qui a déjà trop de
      // 저, ou trop peu de 소수 pour rattraper avec ce qu'il reste à tirer,
      // ne peut donner aucune grille valide. On coupe le sous-arbre entier.
      if (counted && !reachable(next, remaining - 1)) {
        rejected.set('count', (rejected.get('count') ?? 0) + choose(size - 1 - i, remaining - 1))
        continue
      }

      walk(depth + 1, i + 1)
    }
  }

  /** Un préfixe peut-il encore satisfaire les comptes, avec `rest` numéros ? */
  function reachable(slot, rest) {
    for (let k = 0; k < counters.length; k++) {
      const [offset, lo, hi] = counters[k]
      const v = acc[slot + offset]
      if (v > hi || v + rest < lo) return false
    }
    return true
  }

  // Les critères actifs, décidés une fois : ce qui n'est pas filtré n'est
  // pas calculé. Une recherche sur le seul 총합 ne paie pas les 구간.
  // Les 배수 et 구간 réellement demandés, aplatis en [emplacement, min, max] :
  // la boucle terminale ne parcourt plus les neuf, seulement ceux-là.
  const activeMult = []
  spec.multiples.forEach((c, m) => { if (c) activeMult.push([m, c]) })
  const activeSect = []
  spec.sections.forEach((c, s) => { if (c) activeSect.push([s, c]) })

  // Tous les critères qui comptent des numéros — donc bornés d'avance, donc
  // élagables dès qu'un préfixe les dépasse.
  const counters = []
  const counter = (offset, c) => { if (c) counters.push([offset, c.min, c.max]) }
  counter(S_LOW, low)
  counter(S_ODD, odd)
  counter(S_PRIME, primes)
  counter(S_COMP, composites)
  counter(S_MATCH, match)
  counter(S_HIT, hit)
  for (const [m, c] of activeMult) counter(S_MULT + m, c)
  for (const [s, c] of activeSect) counter(S_SECT + s, c)
  // 이월 위치 : aucun numéro repris d'une position refusée — un compte borné à 0.
  if (carriedPos !== null) counters.push([S_BAD, 0, 0])
  const counted = counters.length > 0

  function leaf(base, start) {
    // Le préfixe des cinq premiers numéros : lu une fois, pas à chaque tour.
    const bSum = acc[base + S_SUM]
    const bLow = acc[base + S_LOW]
    const bOdd = acc[base + S_ODD]
    const bHead = acc[base + S_HEAD]
    const bTail = acc[base + S_TAIL]
    const bPrime = acc[base + S_PRIME]
    const bComp = acc[base + S_COMP]
    const bAcLo = acc[base + S_AC_LO]
    const bAcHi = acc[base + S_AC_HI]
    const bMatch = acc[base + S_MATCH]
    const bHit = acc[base + S_HIT]
    const bInclude = acc[base + S_INCLUDE]
    const bCSum = acc[base + S_CSUM]
    const bBad = acc[base + S_BAD]
    const bPSum = acc[base + S_PSUM]
    const bCPSum = acc[base + S_CPSUM]
    // La plus longue répétition d'un 앞자리 / 끝자리 parmi les cinq premiers.
    let bHeadMax = 0
    let bTailMax = 0
    if (headRepeat !== null) {
      for (let d = 0; d < 10; d++) if (acc[base + S_HEADC + d] > bHeadMax) bHeadMax = acc[base + S_HEADC + d]
    }
    if (tailRepeat !== null) {
      for (let d = 0; d < 10; d++) if (acc[base + S_TAILC + d] > bTailMax) bTailMax = acc[base + S_TAILC + d]
    }
    const c0 = chosen[0], c1 = chosen[1], c2 = chosen[2]
    const c3 = chosen[3], c4 = chosen[4]

    // 분배 : la part des facteurs portée par les cinq premiers numéros.
    // `chosen` est trié — le pool l'est et la descente ne recule jamais —
    // donc les paires consécutives se lisent sans rien réordonner.
    // 수동 인기 repose sur les trois mêmes facteurs.
    let bRuns = 0
    let bSmall = 0
    if (sharing !== null || popularity !== null) {
      for (let k = 1; k < PICK - 1; k++) if (chosen[k] - chosen[k - 1] === 1) bRuns++
      for (let k = 0; k < PICK - 1; k++) if (chosen[k] <= SMALL_MAX) bSmall++
    }

    for (let i = start; i < size; i++) {
      if (requiredTotal > 0 && bInclude + requiredAfter[i] < requiredTotal) {
        rejected.set('include', rejected.get('include') + (size - i))
        break
      }
      const value = pool[i]

      // Il ne reste qu'un numéro à poser : l'élagage ci-dessus dit que des
      // 고정수 restent atteignables, il ne dit pas que **celui-ci** complète
      // le compte. C'est ici, et nulle part ailleurs, que ça se vérifie.
      if (requiredTotal > 0 && bInclude + spec.required[value] < requiredTotal) {
        miss('include')
        continue
      }

      if (total !== null) {
        const v = bSum + value
        // La somme croît avec i : passé la borne haute, la boucle est finie.
        if (v > total.max) {
          rejected.set('total', rejected.get('total') + (size - i))
          break
        }
        if (v < total.min || !total.mask[v - total.min]) { miss('total'); continue }
      }
      if (low !== null) {
        const v = bLow + (value <= LOW_MAX ? 1 : 0)
        if (v < low.min || v > low.max || !low.mask[v - low.min]) { miss('low'); continue }
      }
      if (odd !== null) {
        const v = bOdd + (value & 1)
        if (v < odd.min || v > odd.max || !odd.mask[v - odd.min]) { miss('odd'); continue }
      }
      if (activeMult.length) {
        let failed = false
        for (let k = 0; k < activeMult.length; k++) {
          const [m, c] = activeMult[k]
          const v = acc[base + S_MULT + m] + (value % MULTIPLES[m] === 0 ? 1 : 0)
          if (v < c.min || v > c.max || !c.mask[v - c.min]) { failed = true; break }
        }
        if (failed) { miss('multiples'); continue }
      }
      if (primes !== null) {
        const v = bPrime + IS_PRIME[value]
        if (v < primes.min || v > primes.max || !primes.mask[v - primes.min]) { miss('primes'); continue }
      }
      if (composites !== null) {
        const v = bComp + IS_COMPOSITE[value]
        if (v < composites.min || v > composites.max || !composites.mask[v - composites.min]) { miss('composites'); continue }
      }
      if (headSum !== null) {
        const v = bHead + HEAD[value]
        if (v < headSum.min || v > headSum.max || !headSum.mask[v - headSum.min]) { miss('headSum'); continue }
      }
      if (tailSum !== null) {
        const v = bTail + TAIL[value]
        if (v < tailSum.min || v > tailSum.max || !tailSum.mask[v - tailSum.min]) { miss('tailSum'); continue }
      }
      if (activeSect.length) {
        let failed = false
        const own = SECTION_OF[value]
        for (let k = 0; k < activeSect.length; k++) {
          const [s, c] = activeSect[k]
          const v = acc[base + S_SECT + s] + (own === s ? 1 : 0)
          if (v < c.min || v > c.max || !c.mask[v - c.min]) { failed = true; break }
        }
        if (failed) { miss('sections'); continue }
      }
      if (ac !== null) {
        // Les cinq écarts que le dernier numéro ajoute — les dix autres sont
        // déjà dans `bAcLo` / `bAcHi`, calculés une fois par préfixe.
        let lo = bAcLo
        let hi = bAcHi
        let g = value - c0
        if (g < 32) lo |= 1 << g; else hi |= 1 << (g - 32)
        g = value - c1
        if (g < 32) lo |= 1 << g; else hi |= 1 << (g - 32)
        g = value - c2
        if (g < 32) lo |= 1 << g; else hi |= 1 << (g - 32)
        g = value - c3
        if (g < 32) lo |= 1 << g; else hi |= 1 << (g - 32)
        g = value - c4
        if (g < 32) lo |= 1 << g; else hi |= 1 << (g - 32)
        const v = popcount(lo) + popcount(hi) - (PICK - 1)
        if (v < ac.min || v > ac.max || !ac.mask[v - ac.min]) { miss('ac'); continue }
      }
      if (sharing !== null) {
        // Le dernier numéro est le plus grand : l'étendue et l'éventuelle
        // dernière paire consécutive se lisent sur lui seul.
        const v = sharingFrom(
          bRuns + (value - c4 === 1 ? 1 : 0),
          bSmall + (value <= SMALL_MAX ? 1 : 0),
          value - c0)
        if (v < sharing.min || v > sharing.max) { miss('sharing'); continue }
      }
      if (match !== null) {
        const v = bMatch + spec.referenceSet[value]
        if (v < match.min || v > match.max || !match.mask[v - match.min]) { miss('match'); continue }
      }
      if (popularity !== null) {
        const v = popularityFrom(
          bRuns + (value - c4 === 1 ? 1 : 0),
          bSmall + (value <= SMALL_MAX ? 1 : 0),
          value - c0)
        if (v < popularity.min || v > popularity.max) { miss('popularity'); continue }
      }
      if (hit !== null) {
        const v = bHit + spec.hitSet[value]
        if (v < hit.min || v > hit.max || !hit.mask[v - hit.min]) { miss('hit'); continue }
      }
      if (extra) {
      if (carriedSum !== null) {
        const v = bCSum + (spec.referenceSet[value] ? value : 0)
        if (v < carriedSum.min || v > carriedSum.max || !carriedSum.mask[v - carriedSum.min]) { miss('carriedSum'); continue }
      }
      if (carriedPos !== null && bBad + spec.badSet[value] > 0) { miss('carriedPos'); continue }
      if (primeSum !== null) {
        const v = bPSum + (IS_PRIME[value] ? value : 0)
        if (v < primeSum.min || v > primeSum.max || !primeSum.mask[v - primeSum.min]) { miss('primeSum'); continue }
      }
      if (compositeSum !== null) {
        const v = bCPSum + (IS_COMPOSITE[value] ? value : 0)
        if (v < compositeSum.min || v > compositeSum.max || !compositeSum.mask[v - compositeSum.min]) {
          miss('compositeSum'); continue
        }
      }
      if (activeMSum.length) {
        let failed = false
        for (let k = 0; k < activeMSum.length; k++) {
          const [m, c] = activeMSum[k]
          const v = acc[base + S_MSUM + m] + (value % MULTIPLES[m] === 0 ? value : 0)
          if (v < c.min || v > c.max || !c.mask[v - c.min]) { failed = true; break }
        }
        if (failed) { miss('multSums'); continue }
      }
      if (headRepeat !== null) {
        const own = acc[base + S_HEADC + HEAD[value]] + 1
        const v = own > bHeadMax ? own : bHeadMax
        if (v < headRepeat.min || v > headRepeat.max || !headRepeat.mask[v - headRepeat.min]) {
          miss('headRepeat'); continue
        }
      }
      if (tailRepeat !== null) {
        const own = acc[base + S_TAILC + TAIL[value]] + 1
        const v = own > bTailMax ? own : bTailMax
        if (v < tailRepeat.min || v > tailRepeat.max || !tailRepeat.mask[v - tailRepeat.min]) {
          miss('tailRepeat'); continue
        }
      }
      }  // extra

      chosen[PICK - 1] = value
      emit()
    }
  }

  const miss = (key) => { rejected.set(key, rejected.get(key) + 1) }

  walk(0, 0)

  const count = Math.min(kept, capacity)
  return {
    grids: store.subarray(0, count * PICK),
    count,
    kept,
    candidates,
    rejected: report(rejected),
    elapsedMs: now() - started,
  }
}

/**
 * Pourquoi une grille donnée ne passe pas — ou `null` si elle passe.
 *
 * Même définition des critères que `generate`, écrite lisiblement plutôt que
 * pour la vitesse. Sert à répondre « pourquoi ma grille n'apparaît pas ? »,
 * et de contre-épreuve dans les tests.
 */
export function matches(numbers, filters = {}) {
  const spec = normalize(filters)
  const row = [...numbers].sort((a, b) => a - b)
  if (row.length !== PICK) throw new RangeError(`번호 ${PICK}개가 필요합니다`)
  for (let k = 1; k < PICK; k++) {
    if (row[k] === row[k - 1]) throw new RangeError('번호가 중복되었습니다')
  }
  for (const v of row) {
    if (!Number.isInteger(v) || v < 1 || v > NMAX) {
      throw new RangeError(`번호 ${v}: 1..${NMAX} 범위 밖입니다`)
    }
  }

  const allowed = new Set(spec.pool)
  if (row.some((v) => !allowed.has(v))) return 'pool'
  if (spec.include.some((v) => !row.includes(v))) return 'include'

  const count = (predicate) => row.filter(predicate).length
  const sum = (pick) => row.reduce((a, v) => a + pick(v), 0)

  const tests = {
    total: () => sum((v) => v),
    low: () => count((v) => v <= LOW_MAX),
    odd: () => count((v) => v % 2 === 1),
    primes: () => count((v) => IS_PRIME[v] === 1),
    composites: () => count((v) => IS_COMPOSITE[v] === 1),
    headSum: () => sum((v) => HEAD[v]),
    tailSum: () => sum((v) => TAIL[v]),
    ac: () => {
      const gaps = new Set()
      for (let i = 0; i < PICK; i++) {
        for (let j = i + 1; j < PICK; j++) gaps.add(Math.abs(row[i] - row[j]))
      }
      return gaps.size - (PICK - 1)
    },
    match: () => count((v) => spec.referenceSet[v] === 1),
    hit: () => count((v) => spec.hitSet[v] === 1),
    carriedSum: () => sum((v) => (spec.referenceSet[v] ? v : 0)),
    primeSum: () => sum((v) => (IS_PRIME[v] ? v : 0)),
    compositeSum: () => sum((v) => (IS_COMPOSITE[v] ? v : 0)),
    headRepeat: () => longestRun(row.map((v) => HEAD[v])),
    tailRepeat: () => longestRun(row.map((v) => TAIL[v])),
  }

  for (const key of CRITERIA) {
    if (key === 'multiples') {
      for (let m = 0; m < MULTIPLES.length; m++) {
        const bounds = spec.multiples[m]
        if (bounds === null) continue
        if (!allows(bounds, count((v) => v % MULTIPLES[m] === 0))) return 'multiples'
      }
      continue
    }
    if (key === 'sections') {
      for (let s = 0; s < SECTIONS.length; s++) {
        const bounds = spec.sections[s]
        if (bounds === null) continue
        if (!allows(bounds, count((v) => SECTION_OF[v] === s))) return 'sections'
      }
      continue
    }
    if (key === 'sharing') {
      if (spec.sharing === null) continue
      const v = sharingIndex(row)
      if (v < spec.sharing.min || v > spec.sharing.max) return 'sharing'
      continue
    }
    if (key === 'popularity') {
      if (spec.popularity === null) continue
      const v = popularityOf(row)
      if (v < spec.popularity.min || v > spec.popularity.max) return 'popularity'
      continue
    }
    if (key === 'carriedPos') {
      if (spec.carriedPos !== null && row.some((v) => spec.badSet[v] === 1)) return 'carriedPos'
      continue
    }
    if (key === 'multSums') {
      for (let m = 0; m < MULTIPLES.length; m++) {
        const bounds = spec.multSums[m]
        if (bounds === null) continue
        if (!allows(bounds, sum((v) => (v % MULTIPLES[m] === 0 ? v : 0)))) return 'multSums'
      }
      continue
    }
    const bounds = spec[key]
    if (bounds === null) continue
    if (!allows(bounds, tests[key]())) return key
  }
  return null
}

/** Les grilles d'un résultat, en tableaux ordinaires. */
export function toArrays({ grids, count }) {
  const out = []
  for (let i = 0; i < count; i++) out.push([...grids.subarray(i * PICK, (i + 1) * PICK)])
  return out
}

// ------------------------------------------------------------- validation

function normalize(filters) {
  const spec = {}
  for (const key of CRITERIA) {
    if (key === 'multiples' || key === 'sections' || key === 'sharing' || key === 'popularity' ||
        key === 'multSums' || key === 'carriedPos') continue
    spec[key] = criterion(key, filters[key])
  }
  spec.multSums = MULTIPLES.map((m) => criterion(`multSums.${m}`, filters.multSums?.[m]))
  spec.popularity = realBounds('popularity', filters.popularity)

  // 분배 n'est pas un compte de numéros mais un réel : pas de masque, pas
  // de `criterion`. Deux bornes suffisent, et l'écran n'en pose qu'une —
  // « au plus tel indice ».
  spec.sharing = realBounds('sharing', filters.sharing)

  spec.multiples = MULTIPLES.map((m) => criterion(`multiples.${m}`, filters.multiples?.[m]))
  spec.sections = SECTIONS.map((_, s) => criterion(`sections.${s}`, filters.sections?.[s]))

  const exclude = numbers('exclude', filters.exclude)
  const include = numbers('include', filters.include)
  if (include.length > PICK) {
    throw new RangeError(`고정수 ${include.length}개 — 번호는 ${PICK}개뿐입니다`)
  }
  const universe = new Uint8Array(NMAX + 1)
  const declared = filters.pool ? numbers('pool', filters.pool) : null
  for (const v of declared ?? range(1, NMAX)) universe[v] = 1
  for (const v of exclude) universe[v] = 0
  for (const v of include) {
    if (!universe[v]) throw new RangeError(`고정수 ${v}은(는) 제외되었거나 추천수 밖입니다`)
  }

  spec.pool = []
  for (let v = 1; v <= NMAX; v++) if (universe[v]) spec.pool.push(v)
  spec.include = include
  spec.required = new Uint8Array(NMAX + 1)
  for (const v of include) spec.required[v] = 1

  spec.referenceSet = new Uint8Array(NMAX + 1)
  if (filters.reference) {
    for (const v of numbers('reference', filters.reference)) spec.referenceSet[v] = 1
  } else if (spec.match !== null) {
    throw new RangeError('`match`에는 기준 회차(`reference`)가 필요합니다')
  } else if (spec.carriedSum !== null) {
    throw new RangeError('`carriedSum`에는 기준 회차(`reference`)가 필요합니다')
  }

  // 이월 위치 : `reference` est lu **dans l'ordre donné** — 일..육 puis
  // 보너스, positions 1 à 7 — et chaque numéro d'une position non cochée
  // devient interdit. Les numéros hors de la référence ne sont pas concernés.
  spec.carriedPos = null
  spec.badSet = new Uint8Array(NMAX + 1)
  if (filters.carriedPos !== null && filters.carriedPos !== undefined) {
    if (!filters.reference) throw new RangeError('`carriedPos`에는 기준 회차(`reference`)가 필요합니다')
    const allowed = new Set(filters.carriedPos)
    for (const p of allowed) {
      if (!Number.isInteger(p) || p < 1 || p > filters.reference.length) {
        throw new RangeError(`carriedPos : 자리 ${p}은(는) 1..${filters.reference.length} 범위 밖입니다`)
      }
    }
    filters.reference.forEach((v, k) => { if (!allowed.has(k + 1)) spec.badSet[v] = 1 })
    spec.carriedPos = { allowed: [...allowed].sort((a, b) => a - b) }
  }

  // 당첨 개수 : même mécanique que `match`, avec son propre tirage de
  // référence — les deux peuvent servir ensemble (이월 et 당첨).
  spec.hitSet = new Uint8Array(NMAX + 1)
  if (filters.hitReference) {
    for (const v of numbers('hitReference', filters.hitReference)) spec.hitSet[v] = 1
  } else if (spec.hit !== null) {
    throw new RangeError('`hit`에는 비교할 회차 번호(`hitReference`)가 필요합니다')
  }
  return spec
}

/** `[min, max]` réels — pour les critères qui ne comptent pas des numéros. */
function realBounds(name, value) {
  if (value === null || value === undefined) return null
  const [min, max] = Array.isArray(value) ? value : [value, value]
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new RangeError(`${name} : 숫자 두 개가 필요합니다`)
  }
  if (min > max) throw new RangeError(`${name} : ${min} > ${max}`)
  return { min, max }
}

function numbers(name, value) {
  if (value === null || value === undefined) return []
  const out = [...new Set(value)].sort((a, b) => a - b)
  for (const v of out) {
    if (!Number.isInteger(v) || v < 1 || v > NMAX) {
      throw new RangeError(`${name} : ${v}은(는) 1..${NMAX} 범위 밖입니다`)
    }
  }
  return out
}

// ---------------------------------------------------------------- outils

const SECTION_OF = (() => {
  const table = new Int8Array(NMAX + 1).fill(-1)
  for (let v = 1; v <= NMAX; v++) {
    for (let s = 0; s < SECTIONS.length; s++) {
      const [lo, hi] = SECTIONS[s]
      if (v >= lo && v <= hi) { table[v] = s; break }
    }
  }
  return table
})()

const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)

/** Combien de fois revient le chiffre le plus fréquent — 앞쌍 / 끝쌍. */
function longestRun(digits) {
  const seen = new Map()
  for (const d of digits) seen.set(d, (seen.get(d) ?? 0) + 1)
  return Math.max(...seen.values())
}

function report(map) {
  return [...map].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    .map(([key, n]) => ({ key, label: LABELS[key] ?? key, rejected: n }))
}

export function choose(n, k) {
  if (k < 0 || k > n) return 0
  let out = 1
  for (let i = 0; i < k; i++) out = (out * (n - i)) / (i + 1)
  return Math.round(out)
}

function popcount(x) {
  x = x - ((x >> 1) & 0x55555555)
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333)
  x = (x + (x >> 4)) & 0x0f0f0f0f
  return (x * 0x01010101) >> 24
}

/** Générateur pseudo-aléatoire à graine : deux appels de même graine, même tirage. */
export function mulberry32(seed) {
  let a = seed
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const now = () => (typeof performance === 'undefined'
  ? Date.now() : performance.now())
