// Les analyses du 로또 6/45, portées sur le 연금복권 720+.
//
// Ce n'est pas le même jeu, et rien ne se transpose mécaniquement :
//
//   로또 6/45        six numéros **sur 45**, sans remise, triés
//   연금복권 720+     six chiffres **0–9**, avec remise, et la position compte
//
// Trois faits mesurés sur les tirages décident du reste :
//
//   * **82 % des tirages répètent un chiffre** — 4,71 chiffres distincts sur
//     six en moyenne. Un tirage n'est pas un ensemble, c'est une suite.
//   * **La position est l'identité.** Au 6/45 on demande « quel numéro
//     occupe la troisième place » ; ici la place ne se déduit pas, elle est
//     donnée. Toute analyse d'écart se fait donc **par position**.
//   * **L'écart attendu vaut 10**, pas 6,4 : dix chiffres possibles à chaque
//     place, contre sept numéros tirés sur quarante-cinq.
//
// C'est ce dernier point qui fixe les bandes 차뜨 ci-dessous.

import {
  BASE, DIGITS, LOW_MAX, MULTIPLES, PRIMES, COMPOSITES, carryover,
} from './pension.js'

/**
 * Les quatre bandes 차뜨, rééchelonnées.
 *
 * Celles du 6/45 — 1–5, 6–10, 11–19, 20+ — valent 0,78, 1,56 et 2,95 fois
 * l'écart attendu de ce jeu-là (6,4). Portées sur un écart attendu de 10,
 * elles donnent les bornes ci-dessous. Garder telles quelles celles du 로또
 * mettrait la moitié des chiffres en 사망 en permanence, à tout moment.
 */
export const PENSION_BANDS = [
  { key: 'hot', label: '뜨거운', min: 1, max: 8 },
  { key: 'midle', label: '중간', min: 9, max: 16 },
  { key: 'cold', label: '차가운', min: 17, max: 29 },
  { key: 'dead', label: '사망', min: 30, max: Infinity },
]

export function pensionBandOf(gap) {
  for (const b of PENSION_BANDS) if (gap >= b.min && gap <= b.max) return b.key
  return PENSION_BANDS[0].key
}

/**
 * 구간 — trois tranches, et non cinq.
 *
 * Les 구간 du 6/45 sont les tranches de dizaines de 1 à 45 ; un chiffre 0–9
 * n'a pas de dizaine. La coupure retenue est en trois : 0–3, 4–6, 7–9.
 */
export const PENSION_SECTIONS = [[0, 3], [4, 6], [7, 9]]
export const PENSION_SECTION_LABELS = ['0–3', '4–6', '7–9']

export function pensionSectionOf(digit) {
  for (let k = 0; k < PENSION_SECTIONS.length; k++) {
    const [lo, hi] = PENSION_SECTIONS[k]
    if (digit >= lo && digit <= hi) return k
  }
  return 0
}

// ────────────────────────────────────────────── 흐름 · 차뜨, par position

/**
 * Les dix cases d'une position, à chaque 회차.
 *
 *   gap    회차 depuis la dernière fois que ce chiffre a occupé cette place
 *   flag   null, '당첨' (première sortie après une attente), '이월' (deux
 *          fois de suite), '(n)이월' au delà
 *
 * Une seule passe. C'est la matrice 흐름 du 6/45, mais large de dix au lieu
 * de quarante-cinq, et il y en a six — une par place.
 */
export function pensionCells(p, place, { source = 'digits' } = {}) {
  if (!Number.isInteger(place) || place < 0 || place >= DIGITS) {
    throw new RangeError(`자리 ${place}: 0..${DIGITS - 1} 범위여야 합니다`)
  }
  const last = new Int32Array(BASE).fill(-1)
  const streak = new Int32Array(BASE)
  const out = []

  for (let i = 0; i < p.n; i++) {
    const hit = p.sourceAt(i, source)[place]
    const row = []
    for (let d = 0; d < BASE; d++) {
      const gap = last[d] < 0 ? i + 1 : i - last[d]
      if (d === hit) {
        const run = streak[d]
        row.push({
          digit: d, gap, drawn: true,
          flag: run === 0 ? '당첨' : run === 1 ? '이월' : `(${run - 1})이월`,
        })
      } else {
        row.push({ digit: d, gap, drawn: false, flag: null })
      }
    }
    out.push(row)

    for (let d = 0; d < BASE; d++) {
      if (d === hit) { streak[d]++; last[d] = i } else streak[d] = 0
    }
  }
  return out
}

/**
 * Les dix chiffres d'une position, rangés en quatre bandes à un 회차 donné.
 *
 * Le pendant du 차뜨 du 6/45 : écart croissant, puis chiffre croissant.
 */
export function pensionTemperature(row) {
  const sorted = [...row].sort((a, b) => a.gap - b.gap || a.digit - b.digit)
  return PENSION_BANDS.map((b) => ({
    ...b,
    entries: sorted.filter((c) => pensionBandOf(c.gap) === b.key),
  }))
}

// ────────────────────────────────────────────────────── 리스트, onze familles

const inSet = (values) => {
  const table = new Uint8Array(BASE)
  for (const v of values) table[v] = 1
  return (d) => table[d] === 1
}

/**
 * Les onze familles du 리스트, portées sur les chiffres.
 *
 * Une asymétrie assumée, héritée du produit et non du portage : **0 est
 * écarté des 배수** — il est multiple de 2, 3, 4 et 5 à la fois et n'ajoute
 * rien aux sommes — mais **compté dans 짝수**, où il est bel et bien pair.
 * Le premier est une convention de comptage, le second un fait.
 */
export const PENSION_LIST_FAMILIES = [
  ...MULTIPLES.map((k) => ({
    key: `mult${k}`,
    label: `${['', '', '이', '삼', '사', '오'][k]}의배수`,
    gloss: `${k}의 배수 · 0 제외`,
    pick: (d) => d > 0 && d % k === 0,
  })),
  { key: 'prime', label: '소수', gloss: '2 · 3 · 5 · 7', pick: inSet(PRIMES) },
  { key: 'composite', label: '합성수', gloss: '4 · 6 · 8 · 9', pick: inSet(COMPOSITES) },
  { key: 'odd', label: '홀수', gloss: '홀수', pick: (d) => d % 2 === 1 },
  { key: 'even', label: '짝수', gloss: '0 포함', pick: (d) => d % 2 === 0 },
  { key: 'low', label: '저수', gloss: `0–${LOW_MAX}`, pick: (d) => d <= LOW_MAX },
  { key: 'high', label: '고수', gloss: `${LOW_MAX + 1}–9`, pick: (d) => d > LOW_MAX },
  { key: 'carry', label: '이월차번호', gloss: '전 회차에서 이어진 숫자', carry: true },
]

export function pensionFamily(key) {
  const f = PENSION_LIST_FAMILIES.find((x) => x.key === key)
  if (!f) throw new RangeError(`알 수 없는 가족 : ${key}`)
  return f
}

/** Les chiffres qu'une famille peut contenir. 이월 les accepte tous. */
export function pensionMembers(key) {
  const f = pensionFamily(key)
  const all = Array.from({ length: BASE }, (_, d) => d)
  return f.carry ? all : all.filter(f.pick)
}

function tally(values) {
  const m = new Map()
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
  return Object.fromEntries(
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([v, c]) => [String(v), c]))
}

/**
 * 리스트 — une famille, tirage par tirage.
 *
 * Même forme que `lists.js` pour le 6/45 :
 *
 *   rows      un 회차 par ligne, du plus récent au plus ancien
 *   members   chaque chiffre de la famille et combien de fois il est sorti
 *   combos    les combinaisons rencontrées, de la plus fréquente à la plus rare
 *   counts    la distribution du 숫자수
 *   sums      la distribution du 숫자합
 *   flow      le 숫자수 dans le temps, du plus ancien au plus récent
 *
 * Une différence de fond avec le 6/45 : un chiffre peut sortir **plusieurs
 * fois dans le même tirage**. Les listes gardent donc les doublons, et
 * `숫자수` peut dépasser le nombre de membres de la famille.
 */
export function pensionListSeries(p, key, { source = 'digits' } = {}) {
  const f = pensionFamily(key)
  const bag = f.carry ? carryover(p) : null

  const rows = []
  const flow = []
  const seen = new Map()
  const hits = new Map()

  for (let i = p.n - 1; i >= 0; i--) {
    const digits = f.carry
      ? [...(bag.values[i] ?? [])].sort((a, b) => a - b)
      : [...p.sourceAt(i, source)].filter(f.pick)

    const sum = digits.reduce((a, d) => a + d, 0)
    const label = `[${digits.join(', ')}]`

    for (const d of digits) hits.set(d, (hits.get(d) ?? 0) + 1)
    const combo = seen.get(label)
    if (combo) combo.count++
    else seen.set(label, { label, digits, count: 1 })

    rows.push({ rang: p.rangs[i], digits, count: digits.length, sum, label })
  }

  for (let k = rows.length - 1; k >= 0; k--) {
    flow.push({ rang: rows[k].rang, value: rows[k].count })
  }

  return {
    family: key,
    rows,
    // Clés non entières — « 7번 » — sinon l'objet les remettrait en ordre
    // croissant et le classement par fréquence serait perdu.
    members: Object.fromEntries(
      pensionMembers(key)
        .map((d) => [d, hits.get(d) ?? 0])
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .map(([d, c]) => [`${d}번`, c])),
    combos: [...seen.values()].sort(
      (a, b) => b.count - a.count || a.digits.length - b.digits.length
        || a.label.localeCompare(b.label)),
    counts: tally(rows.map((r) => r.count)),
    sums: tally(rows.map((r) => r.sum)),
    flow,
  }
}

export { BASE, DIGITS, LOW_MAX }
