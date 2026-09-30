// 테이블리스트 HL — le tableau du 차뜨, avec le passé de chaque case.
//
// C'est le même damier que 테이블리스트 : une colonne 당첨 pour les sept
// sortis, puis une colonne par écart. Ce qui change, c'est le contenu des
// cases. Chacune ne porte plus seulement son numéro, mais **dix chiffres**
// qui répondent à une seule question :
//
//   Si ce numéro sortait au prochain 회차, il sortirait après tant d'attente.
//   Combien de fois cela lui est-il déjà arrivé ?
//
// C'est ce que l'ancienne page appelait 미래위치 et 위치합.
//
// ─── la valeur d'une case
//
// L'attente d'un numéro ne se compte pas depuis sa dernière sortie, mais
// depuis la dernière sortie **avant la série en cours**. Un numéro tombé aux
// 회차 1230 et 1231, après un silence depuis 1225, vaut 5 au premier et 6 au
// second — pas 5 puis 1. L'ancien l'écrivait en sept branches (`+1` pour
// 당첨, `+2` pour 이월, `+3` pour `(1)이월`…) ; c'est une seule soustraction.
//
// 미래위치 vaut cette valeur plus un : ce que la case vaudrait si le numéro
// sortait au 회차 suivant. Vrai des deux côtés — une case vide passerait de
// l'écart g à g+1, une case sortie passerait de v à v+1 en devenant 이월.
//
// ─── ce que l'ancien ne pouvait pas afficher
//
// Sa vue recalculait tout l'historique **pour chaque 회차** : une boucle
// `for rangnumber in range(1238)`, et dedans, pour chacun des 45 numéros,
// plusieurs requêtes sur toute la table. Plus de trente millions de tours et
// des dizaines de milliers de requêtes SQL — la page ne pouvait pas
// s'afficher. Ici les comptes avancent d'un 회차 au suivant : une passe.
//
// Vérifié contre la base : au 회차 1238, le numéro 2 donne 당첨 147 · 이월 44
// · 꽝 1046 · 전부 1237, et à 미래위치 6 : 15 · 2 · 66 · 83 — les chiffres de
// l'ancienne page, au chiffre près, 이월 리스트 comprise.

import { FULL, NMAX } from './draws.js'
import { nextCells } from './tablelist.js'

/**
 * Les 45 cases de chaque 회차 : drapeau, écart, et valeur HL.
 *
 *   flag     null, '당첨', '이월', '(n)이월' — comme `board.cells`
 *   gap      회차 − dernière sortie (celle qui range les colonnes)
 *   value    회차 − dernière sortie **avant la série** (celle qui compte)
 *
 * Une seule passe : on avance en gardant, par numéro, sa dernière sortie et
 * l'ancre de sa série.
 */
export function hlCells(draws) {
  const last = new Int32Array(NMAX + 1)
  const anchor = new Int32Array(NMAX + 1)
  const streak = new Int32Array(NMAX + 1)
  const out = []

  for (let i = 0; i < draws.n; i++) {
    const rang = draws.rangs[i]
    const here = draws.fullAt(i)
    const drawn = new Uint8Array(NMAX + 1)
    for (let j = 0; j < FULL; j++) drawn[here[j]] = 1

    // Une série ne compte que sur des 회차 qui se suivent.
    const contiguous = i > 0 && draws.rangs[i - 1] === rang - 1

    const row = []
    for (let n = 1; n <= NMAX; n++) {
      if (drawn[n]) {
        const run = contiguous ? streak[n] : 0
        if (run === 0) anchor[n] = last[n]
        row.push({
          number: n,
          gap: rang - last[n],
          value: rang - anchor[n],
          flag: run === 0 ? '당첨' : run === 1 ? '이월' : `(${run - 1})이월`,
          carried: run > 0,
          // La longueur de la série en cours, celle-ci comprise. Elle dit de
          // combien de 회차 il faut reculer pour lire le passé de ce numéro.
          run: run + 1,
        })
      } else {
        const gap = rang - last[n]
        row.push({ number: n, gap, value: gap, flag: null, carried: false, run: 0 })
      }
    }
    out.push(row)

    for (let n = 1; n <= NMAX; n++) {
      if (drawn[n]) { streak[n] = contiguous ? streak[n] + 1 : 1; last[n] = rang }
      else streak[n] = 0
    }
  }
  return out
}

/**
 * La rangée du 회차 à venir, au format HL.
 *
 * Aucune case n'est sortie : `value` vaut donc l'écart — c'est la règle des
 * cases vides — et `run` vaut zéro, si bien qu'aucune case n'est retranchée
 * du passé au moment de compter les 위치합.
 */
export function hlNextCells(draws) {
  return nextCells(draws).map((c) => ({ ...c, value: c.gap, carried: false, run: 0 }))
}

/**
 * Le passé de chaque numéro, sur les `count` premiers 회차.
 *
 * Trois comptages par numéro, indexés par la valeur de la case :
 *
 *   won     les sorties après une attente        (당첨)
 *   carry   les sorties dans la foulée           (이월)
 *   blank   les 회차 sans sortie                  (꽝)
 *
 * Leurs totaux font `count`, toujours — c'est le 전부 통계 de l'ancien.
 */
export function hlHistory(cells, count = cells.length) {
  const out = []
  for (let n = 0; n <= NMAX; n++) {
    out.push({ won: new Map(), carry: new Map(), blank: new Map(), total: 0 })
  }
  for (let i = 0; i < count; i++) {
    const row = cells[i]
    for (let n = 1; n <= NMAX; n++) {
      const cell = row[n - 1]
      const h = out[n]
      const m = cell.flag ? (cell.carried ? h.carry : h.won) : h.blank
      m.set(cell.value, (m.get(cell.value) ?? 0) + 1)
      h.total++
    }
  }
  return out
}

const sum = (m) => { let t = 0; for (const v of m.values()) t += v; return t }

/**
 * Les dix chiffres d'une case, tels que l'ancienne page les écrivait.
 *
 * `history` porte le passé **jusqu'au 회차 d'avant** : une carte au 1238 se
 * lit sur 1 237 회차, comme dans l'original.
 */
export function hlDigits(cell, history, drop = []) {
  const h = history[cell.number]
  const at = cell.value + 1               // 미래위치

  // Une case vide se lit sur tout le passé, celui du 회차 courant compris.
  // Une case **sortie** se lit sur le passé d'avant sa série : l'ancien
  // remontait au 회차 `r − k` pour un numéro sorti k fois de suite, et
  // n'incluait donc pas la série elle-même. On retranche ces k cases.
  const won = new Map(h.won)
  const carry = new Map(h.carry)
  const blank = new Map(h.blank)
  let total = h.total
  for (const d of drop) {
    const m = d.flag ? (d.carried ? carry : won) : blank
    const left = (m.get(d.value) ?? 0) - 1
    if (left > 0) m.set(d.value, left)
    else m.delete(d.value)
    total--
  }

  return {
    future: at,
    wonTotal: sum(won),
    carryTotal: sum(carry),
    blankTotal: sum(blank),
    total,
    won: won.get(at) ?? 0,
    carry: carry.get(at) ?? 0,
    blank: blank.get(at) ?? 0,
    all: (won.get(at) ?? 0) + (carry.get(at) ?? 0) + (blank.get(at) ?? 0),
    // 이월 리스트 — le détail des 이월, du plus fréquent au plus rare.
    carryList: [...carry.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]),
  }
}

/**
 * Le damier d'un 회차, cases enrichies.
 *
 * Colonne 당첨 pour les sortis, puis une colonne par écart croissant — le
 * même rangement que `tablelist.boardColumns`, dont ceci est la version
 * documentée.
 */
function dropped(cells, i, cell) {
  if (!cell.run) return []
  const out = []
  for (let k = 0; k < cell.run && i - k >= 0; k++) {
    out.push(cells[i - k][cell.number - 1])
  }
  return out
}

export function hlBoard(cells, i, history, next = null) {
  const row = cells[i]
  const after = new Uint8Array(NMAX + 1)
  if (next) for (const n of next) after[n] = 1

  const won = []
  const gaps = new Map()
  for (const cell of row) {
    const entry = {
      number: cell.number,
      gap: cell.gap,
      value: cell.value,
      flag: cell.flag,
      hit: after[cell.number] === 1,
      digits: hlDigits(cell, history, dropped(cells, i, cell)),
    }
    if (cell.flag) won.push(entry)
    else {
      if (!gaps.has(cell.gap)) gaps.set(cell.gap, [])
      gaps.get(cell.gap).push(entry)
    }
  }

  const columns = [{ key: 'won', label: '당첨', entries: won }]
  for (const g of [...gaps.keys()].sort((a, b) => a - b)) {
    columns.push({ key: g, label: String(g), entries: gaps.get(g) })
  }

  // 제외번호 — parmi les cases qui partagent la même 미래위치, l'ancien
  // marquait en noir celle dont le 당첨 위치합 est le plus **faible**, et en
  // rouge la plus **forte**. C'est là tout le conseil de la page : à attente
  // égale, ce numéro est celui qui a le moins souvent tenu.
  const byFuture = new Map()
  for (const c of columns) {
    for (const e of c.entries) {
      if (!byFuture.has(e.digits.future)) byFuture.set(e.digits.future, [])
      byFuture.get(e.digits.future).push(e)
    }
  }
  for (const group of byFuture.values()) {
    let low = group[0]
    let high = group[0]
    for (const e of group) {
      if (e.digits.won < low.digits.won) low = e
      if (e.digits.won > high.digits.won) high = e
    }
    if (low !== high) { low.mark = 'low'; high.mark = 'high' }
  }

  return {
    columns,
    height: Math.max(MIN_HEIGHT, ...columns.map((c) => c.entries.length)),
  }
}

export const MIN_HEIGHT = 7

/** Le comptage d'une liste d'entiers, valeur croissante. */
function tally(values) {
  const m = new Map()
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
  return Object.fromEntries(
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([v, c]) => [String(v), c]))
}

/**
 * Les neuf blocs de la page.
 *
 * Deux mesures, prises sur le damier d'un 회차, pour les numéros qui sortent
 * au **회차 suivant** :
 *
 *   vertical     le chiffre de la case — 0 si le numéro est déjà sorti,
 *                sinon son écart. C'est « depuis combien de temps il attend ».
 *   horizontal   son rang dans sa colonne — combien de numéros plus petits
 *                que lui portent la même valeur, plus un.
 *
 * Chacune est comptée deux fois : chez les sept qui sortent (당첨) et chez
 * les trente-huit qui ne sortent pas (꽝). Plus les cinq découpages que
 * `tablelist.tableListStats` donne déjà : up · down · start · middle · end.
 *
 * Une correction : l'ancien obtenait ses deux séries 꽝 en **soustrayant**
 * les rangs des gagnants de ceux des quarante-cinq. Mais il calculait les
 * deux avec des règles différentes — les 이월 étaient repliés sur 당첨 d'un
 * côté et pas de l'autre — si bien que la soustraction ne tombait pas juste.
 * Ici les trente-huit sont comptés directement.
 */
export function hlLineStats(draws, cells = hlCells(draws)) {
  const wonVertical = []
  const wonHorizontal = []
  const lostVertical = []
  const lostHorizontal = []
  const up = []
  const down = []
  const start = []
  const middle = []
  const end = []

  for (let i = 0; i < draws.n - 1; i++) {
    const row = cells[i]
    const next = draws.fullAt(i + 1)
    const wins = new Uint8Array(NMAX + 1)
    for (let j = 0; j < FULL; j++) wins[next[j]] = 1

    // La clé d'une case pour le classement horizontal : son drapeau s'il est
    // sorti, sinon son écart. Deux cases se ressemblent si la clé est la même.
    const key = (c) => (c.flag ?? String(c.gap))

    let u = 0, d = 0, s = 0, m = 0, e = 0
    for (let n = 1; n <= NMAX; n++) {
      const cell = row[n - 1]
      let rank = 1
      for (let k = 1; k < n; k++) if (key(row[k - 1]) === key(cell)) rank++
      const vertical = cell.flag ? 0 : cell.gap

      if (wins[n]) {
        wonVertical.push(vertical)
        wonHorizontal.push(rank)
        if (rank < 4) u++
        else d++
        if (cell.flag || cell.gap < 6) s++
        else if (cell.gap <= 10) m++
        else e++
      } else {
        lostVertical.push(vertical)
        lostHorizontal.push(rank)
      }
    }
    up.push(u); down.push(d); start.push(s); middle.push(m); end.push(e)
  }

  return {
    wonVertical: tally(wonVertical),
    lostVertical: tally(lostVertical),
    wonHorizontal: tally(wonHorizontal),
    lostHorizontal: tally(lostHorizontal),
    up: tally(up),
    down: tally(down),
    start: tally(start),
    middle: tally(middle),
    end: tally(end),
  }
}

export { NMAX }
