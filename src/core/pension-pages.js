// Les vingt pages du menu 연금복권.
//
// L'ancien site les rangeait en trois groupes — 당첨번호 (13), 보너스 (4),
// 당첨번호+보너스 (4) — et les écrivait une par une, chacune avec sa vue, son
// gabarit et sa copie du même comptage. Ici c'est un catalogue : chaque page
// dit quels blocs elle porte, et chaque bloc dit quelle fonction de
// `pension.js` le remplit.
//
// Deux calculs manquaient au noyau, ils sont ici :
//
//   repeatTokens    수평반복 — les chiffres qui reviennent **dans un même
//                   tirage**, comptés « chiffre:combien »
//   hitIntervals    les pages 라인일…라인육 — pour un chiffre et une place,
//                   la distribution des attentes entre deux sorties
//
// ─── ce que l'ancien ne pouvait pas montrer
//
// Sur les vingt pages, **onze blocs de graphique ne se dessinaient pas** et
// **onze filtres de plage étaient morts** : le gabarit bouclait sur une
// variable que la vue ne posait jamais. Le détail est noté bloc par bloc.
//
// ─── les écarts assumés, déjà notés dans `pension.js`
//
//   저고     l'ancien comptait avec `< 4` mais listait avec `<= 4` : les deux
//            se contredisaient. Un seul seuil ici, 0–4 / 5–9.
//   배수     0 est multiple de tout ; l'ancien le comptait dans les quatre
//            familles à la fois. `pension.js` l'écarte.
//   이월 위치 les positions stockées ne suivaient aucune règle : l'index
//            1-based du tirage courant les remplace.

import {
  BASE, DIGITS, MULTIPLES, distribution, gaps, windows,
} from './pension.js'

/**
 * 수평반복 — les chiffres répétés à l'intérieur d'un tirage.
 *
 * Un jeton par chiffre répété, « chiffre:combien ». Un tirage de six
 * chiffres tous différents n'en produit aucun. Les jetons sont ensuite
 * comptés sur tout l'historique.
 *
 * L'ancienne page ne savait peindre que les répétitions de 2, 3 et 4 : au
 * delà, la cellule n'était pas écrite du tout et la ligne du tableau
 * perdait une colonne. Ici les six sont possibles.
 */
export function repeatTokens(p, { source = 'digits' } = {}) {
  const perDraw = []
  const tally = new Map()

  for (let i = 0; i < p.n; i++) {
    const row = p.sourceAt(i, source)
    const seen = new Int8Array(BASE)
    for (let k = 0; k < DIGITS; k++) seen[row[k]]++

    const tokens = []
    for (let d = 0; d < BASE; d++) {
      if (seen[d] > 1) {
        const token = `${d}:${seen[d]}`
        tokens.push({ digit: d, count: seen[d], token })
        tally.set(token, (tally.get(token) ?? 0) + 1)
      }
    }
    perDraw.push(tokens)
  }

  return {
    perDraw,
    // Du plus fréquent au plus rare, puis par chiffre — l'ordre de l'ancien
    // histogramme, sans son étiquette « 7:2번호 » qui n'était pas un numéro.
    tally: Object.fromEntries(
      [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    /** Combien de tirages ne répètent rien. */
    clean: perDraw.reduce((a, t) => a + (t.length === 0 ? 1 : 0), 0),
  }
}

/**
 * Les pages 라인일 … 라인육 : pour une place, l'attente de chaque chiffre.
 *
 * Quand le chiffre `d` sort à la place `pos`, combien de tirages s'étaient
 * écoulés depuis sa dernière sortie **à cette place** ? La distribution de
 * ces attentes, chiffre par chiffre.
 *
 * Ce sont les tables `bokchkun` … `bokchksix` de l'ancien, qui stockaient
 * ce compteur en texte et collaient `-당첨` le tirage où il tombait. Deux
 * défauts en découlaient : le détecteur de sortie était `len(valeur) >= 3`,
 * si bien qu'un simple compteur à trois chiffres — une attente de 100 et
 * plus — passait pour une sortie ; et le cas `len == 3` n'était traité nulle
 * part à l'écriture, ce qui aurait fait tomber la mise à jour. Ici, rien
 * n'est stocké : l'attente se recompte.
 */
export function hitIntervals(p, pos, { source = 'digits' } = {}) {
  if (!Number.isInteger(pos) || pos < 0 || pos >= DIGITS) {
    throw new RangeError(`자리 ${pos}: 0..${DIGITS - 1} 범위여야 합니다`)
  }
  const last = new Int32Array(BASE).fill(-1)
  const out = []
  for (let d = 0; d < BASE; d++) out.push({ digit: d, intervals: [], hits: 0 })

  for (let i = 0; i < p.n; i++) {
    const d = p.sourceAt(i, source)[pos]
    // Le premier tirage compte depuis le début de l'historique, comme le
    // faisait le compteur stocké.
    out[d].intervals.push(last[d] < 0 ? i + 1 : i - last[d])
    out[d].hits++
    last[d] = i
  }

  return out.map((e) => ({
    digit: e.digit,
    hits: e.hits,
    counts: distribution(e.intervals),
    mean: e.intervals.length
      ? e.intervals.reduce((a, b) => a + b, 0) / e.intervals.length : 0,
    // Depuis combien de tirages ce chiffre n'est plus sorti à cette place.
    since: last[e.digit] < 0 ? p.n : p.n - 1 - last[e.digit],
  }))
}

/** Les mots de l'ancien pour les dix chiffres. */
export const DIGIT_WORDS = ['ZERO', 'UN', 'DEUX', 'TROIS', 'QUATRE',
                            'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF']

/** Les six places, dans les mots de l'ancien menu. */
export const PLACE_WORDS = ['일', '이', '삼', '사', '오', '육']

/**
 * Le catalogue : trois groupes, vingt pages.
 *
 * `source` dit sur quelle famille de chiffres la page travaille — les six du
 * 당첨번호, les six du 보너스, ou les deux mises bout à bout.
 *
 * La quatrième entrée du groupe 당첨번호+보너스 n'est pas reprise : son lien
 * était **commenté dans le menu** (`sidebar.html:464`) et pointait sur une
 * page `test` du 로또 6/45, sans rapport avec le 연금복권, dont deux des trois
 * blocs ne se dessinaient pas non plus.
 */
export const PENSION_GROUPS = [
  {
    key: 'winner',
    label: '당첨번호',
    pages: [
      { key: 'base', label: '당첨번호', kind: 'base', source: 'digits' },
      { key: 'pos', label: '당첨번호일', kind: 'positions', source: 'digits' },
      { key: 'pair', label: '당첨번호이', kind: 'windows', size: 2, source: 'digits' },
      { key: 'triple', label: '당첨번호삼', kind: 'windows', size: 3, source: 'digits' },
      { key: 'mult', label: '당첨번호이삼사오', kind: 'multiples', source: 'digits' },
      { key: 'indic', label: '총저고홀짝소합A이월', kind: 'indicators', source: 'digits' },
      { key: 'repeat', label: '당첨번호반복수', kind: 'repeats', source: 'digits' },
      ...PLACE_WORDS.map((w, k) => ({
        key: `line${k + 1}`, label: `${w} 흐름`, kind: 'line', place: k, source: 'digits',
      })),
    ],
  },
  {
    key: 'bonus',
    label: '보너스',
    pages: [
      { key: 'bbase', label: '보너스', kind: 'base', source: 'bonus' },
      { key: 'bpos', label: '보너스일', kind: 'positions', source: 'bonus' },
      { key: 'bpair', label: '보너스이', kind: 'windows', size: 2, source: 'bonus' },
      { key: 'btriple', label: '보너스삼', kind: 'windows', size: 3, source: 'bonus' },
    ],
  },
  {
    key: 'both',
    label: '당첨번호+보너스',
    pages: [
      { key: 'xall', label: '당첨번호+보너스', kind: 'base', source: 'both' },
      { key: 'xpair', label: '이', kind: 'windows', size: 2, source: 'both' },
      { key: 'xtriple', label: '삼', kind: 'windows', size: 3, source: 'both' },
    ],
  },
]

export const PENSION_PAGES = PENSION_GROUPS.flatMap((g) =>
  g.pages.map((p) => ({ ...p, group: g.key, groupLabel: g.label })))

export function pensionPage(key) {
  const page = PENSION_PAGES.find((p) => p.key === key)
  if (!page) throw new RangeError(`알 수 없는 페이지 : ${key}`)
  return page
}

/**
 * Les chiffres d'un tirage, selon la source de la page.
 *
 * `both` met les six du 당첨번호 devant les six du 보너스 : douze chiffres,
 * comme l'ancienne page `bokunwinerbonusall`, qui les comptait dans un seul
 * sac sans les apparier.
 */
export function sourceDigits(p, i, source) {
  if (source !== 'both') return [...p.sourceAt(i, source)]
  return [...p.digitsAt(i), ...p.bonusAt(i)]
}

/** Le comptage des dix chiffres, sur toute la tranche. */
export function digitFrequency(p, source = 'digits') {
  const counts = {}
  for (let d = 0; d < BASE; d++) counts[d] = 0
  for (let i = 0; i < p.n; i++) for (const d of sourceDigits(p, i, source)) counts[d]++
  return counts
}

/**
 * Les fenêtres d'une page, y compris la source `both`.
 *
 * Pour `both`, l'ancien empilait les fenêtres du 보너스 **puis** celles du
 * 당첨번호 dans le même sac. L'ordre ne change rien à un comptage ; le
 * tableau, lui, montre les deux familles côte à côte.
 */
export function pageWindows(p, size, source) {
  if (source !== 'both') return windows(p, size, { source })
  const a = windows(p, size, { source: 'digits' })
  const b = windows(p, size, { source: 'bonus' })
  return a.map((line, i) => [...line, ...b[i]])
}

export function pageWindowFrequency(p, size, source) {
  const tally = new Map()
  for (const line of pageWindows(p, size, source)) {
    for (const w of line) tally.set(w, (tally.get(w) ?? 0) + 1)
  }
  return Object.fromEntries(
    [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

export { BASE, DIGITS, MULTIPLES, distribution, gaps }
