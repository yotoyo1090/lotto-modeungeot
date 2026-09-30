// 구간 — les cinq tranches de dizaines, et les douze familles de numéros.
//
// L'ancienne plateforme en faisait **douze pages** bâties sur le même moule,
// une par famille de numéros : 당첨번호, les quatre 배수, 소수, 홀수, 짝수,
// 저수, 고수, 합성수, 이월차번호. Chacune répartissait sa famille dans les
// cinq 구간 (1–9, 10–19, 20–29, 30–39, 40–45) et montrait trois comptages
// plus un tableau. Douze vues Django de soixante lignes, identiques au nom
// des colonnes près.
//
// Elles lisaient `customeruser_sectionall` — soixante colonnes de listes
// stockées en texte. Rien n'est réimporté : tout se recalcule depuis les
// sept numéros du tirage (voir test/board.test.js, qui rejoue les 68 040
// cellules).
//
// Toutes les familles portent sur les **sept** numéros — six plus le
// 보너스. C'est ce que faisait l'original, et c'est ce que dit la table :
// au 회차 1134, le 당첨번호이십 stocké est {24, 23}, et 23 est le 보너스.

import { fromRows, IS_COMPOSITE, IS_PRIME, NMAX, SECTIONS } from './draws.js'
import { mulberry32 } from './generator.js'
import { carryover } from './metrics.js'

/** Les cinq 구간, avec le nom que leur donnait l'ancien tableau. */
export const SECTION_LABELS = ['일', '십', '이십', '삼십', '사십']

/**
 * La frontière 저 / 고 **de cette page**.
 *
 * Attention, elle n'est pas celle du reste du site. L'ancienne base se
 * contredisait : le ratio 저고 comptait `저 < 23`, mais la liste 저번호 —
 * celle que les 구간 découpent — retenait `저 <= 23`. `metrics.js` a tranché
 * pour le ratio en fixant `LOW_MAX = 22` ; ici c'est la liste qui fait foi,
 * donc 23 tombe en 저. Sur les 1 134 회차, cela ne concerne que les 156 qui
 * contiennent le 23, et seulement les deux écrans 저수 et 고수.
 */
export const SECTION_LOW_MAX = 23

/**
 * Les douze familles, dans l'ordre de l'ancienne barre latérale.
 *
 * `pick` reçoit un numéro et dit s'il appartient à la famille. La seule qui
 * n'en est pas une est 이월차번호 : elle ne se lit pas sur le tirage seul,
 * mais sur ce qu'il reprend du précédent — d'où `carry`.
 */
export const SECTION_FAMILIES = [
  { key: 'winner', label: '당첨번호', gloss: '일곱 번호 모두', pick: () => true },
  { key: 'double', label: '이의배수', gloss: '2의 배수', pick: (n) => n % 2 === 0 },
  { key: 'triple', label: '삼의배수', gloss: '3의 배수', pick: (n) => n % 3 === 0 },
  { key: 'quad', label: '사의배수', gloss: '4의 배수', pick: (n) => n % 4 === 0 },
  { key: 'quint', label: '오의배수', gloss: '5의 배수', pick: (n) => n % 5 === 0 },
  { key: 'prime', label: '소수', gloss: '소수', pick: (n) => IS_PRIME[n] === 1 },
  { key: 'odd', label: '홀수', gloss: '홀수', pick: (n) => n % 2 === 1 },
  { key: 'even', label: '짝수', gloss: '짝수', pick: (n) => n % 2 === 0 },
  { key: 'low', label: '저수', gloss: `1–${SECTION_LOW_MAX}`, pick: (n) => n <= SECTION_LOW_MAX },
  { key: 'high', label: '고수', gloss: `${SECTION_LOW_MAX + 1}–45`, pick: (n) => n > SECTION_LOW_MAX },
  { key: 'composite', label: '합성수', gloss: '합성수', pick: (n) => IS_COMPOSITE[n] === 1 },
  { key: 'carry', label: '이월차번호', gloss: '전 회차에서 이어진 번호', carry: true },
]

export const isFamily = (key) => SECTION_FAMILIES.some((f) => f.key === key)

/** 있음 / 점멸 — les deux mots de l'ancien tableau. */
export const ON = '있음'
export const OFF = '점멸'

/**
 * L'état d'un 구간 : 있음 ou 점멸.
 *
 * La règle de l'original, reprise **telle quelle** :
 *
 *     if label == '[]': '점멸'
 *     elif len(...) == 1 and ...[0] in range(10, 20): '점멸'
 *     else: '있음'
 *
 * Un 구간 vide est éteint — c'est le sens attendu. Mais un 구간 qui ne
 * contient qu'**un seul numéro compris entre 10 et 19** l'est aussi, et ce
 * test s'applique aux **cinq** 구간, pas seulement au 십. C'est un
 * copier-coller resté en place, identique dans les douze vues. On le garde :
 * sans lui, les 24 combinaisons et les hauteurs des barres ne sont plus
 * celles de l'ancienne page.
 *
 * Conséquence à connaître : le deuxième comptage (`blanks`) ne compte, lui,
 * que les 구간 réellement vides. Les deux totaux ne se recoupent donc pas —
 * c'était déjà le cas dans l'original.
 */
export function sectionFlag(cell) {
  if (cell.length === 0) return OFF
  if (cell.length === 1 && cell[0] >= 10 && cell[0] <= 19) return OFF
  return ON
}

/** Les cinq cases d'un 회차, pour une famille. */
export function sectionCells(draws, i, family, carry = null) {
  const f = SECTION_FAMILIES.find((x) => x.key === family)
  if (!f) throw new RangeError(`알 수 없는 가족 : ${family}`)

  const pool = f.carry
    ? [...(carry?.numbers[i] ?? [])].sort((a, b) => a - b)
    : [...draws.fullAt(i)].filter(f.pick)

  // Les cellules sont triées. L'ancienne base les gardait dans l'ordre où
  // Python parcourait son `set` — 회차 1236 십 = « [10, 18, 12] », un ordre
  // de table de hachage, pas une intention. Le contenu est le même.
  return SECTIONS.map(([lo, hi]) => pool.filter((n) => n >= lo && n <= hi))
}

/** L'étiquette d'un 구간 éteint — « 일점멸구간 ». */
export const blankLabel = (s) => `${SECTION_LABELS[s]}점멸구간`

/**
 * 구간 — tout ce que montrait une des douze pages.
 *
 *   rows      un 회차 par ligne, du plus récent au plus ancien
 *   patterns  les combinaisons 있음/점멸 rencontrées, du plus allumé au plus
 *             éteint — l'ordre de l'ancien graphique
 *   blanks    combien de fois chaque 구간 est resté **vide**
 *   byCount   combien de 회차 ont 0, 1, 2… 구간 점멸
 */
export function sectionSeries(draws, family, carry = null) {
  const bag = carry ?? (SECTION_FAMILIES.find((f) => f.key === family)?.carry
    ? carryover(draws) : null)

  const rows = []
  const patterns = new Map()
  const blanks = new Array(5).fill(0)
  const byCount = new Map()

  for (let i = draws.n - 1; i >= 0; i--) {
    const cells = sectionCells(draws, i, family, bag)
    const flags = cells.map(sectionFlag)
    const off = flags.filter((f) => f === OFF).length

    for (let s = 0; s < 5; s++) if (cells[s].length === 0) blanks[s]++

    const key = flags.join(' ')
    patterns.set(key, (patterns.get(key) ?? 0) + 1)
    byCount.set(off, (byCount.get(off) ?? 0) + 1)

    rows.push({ rang: draws.rangs[i], cells, flags, off })
  }

  // L'ancien rangeait ses barres par nombre de 있음 décroissant : les 회차
  // qui remplissent tous les 구간 en tête, ceux qui n'en remplissent que
  // deux à la fin.
  const ordered = [...patterns.entries()]
    .sort((a, b) => b[0].split(' ').filter((w) => w === ON).length
      - a[0].split(' ').filter((w) => w === ON).length)

  return {
    family,
    rows,
    patterns: ordered.map(([flags, count]) => ({ flags: flags.split(' '), count })),
    blanks: Object.fromEntries(blanks.map((n, s) => [blankLabel(s), n])),
    byCount: Object.fromEntries(
      [...byCount.entries()].sort((a, b) => a[0] - b[0])),
  }
}

/**
 * Ce que le hasard donne aux trois comptages d'une famille.
 *
 * Pas de forme fermée qui vaille pour les douze familles à la fois — la
 * règle 점멸 avec son exception 10–19, le 보너스 compté avec les six, le
 * 이월 qui se lit sur deux tirages. On fait donc ce que fait un tirage : on
 * en simule `samples`, à graine fixe, et on leur applique **exactement**
 * `sectionSeries`. Même règle, même code, même erreur héritée s'il y en a —
 * c'est ce qui rend la comparaison juste.
 *
 * Rend les trois comptages de `sectionSeries` en **parts** (0–1) :
 * `patterns` (Map clé → part, la clé étant les cinq mots joints par un
 * espace), `blanks` et `byCount`. Multiplier par le nombre de 회차 affichés
 * donne l'attendu. Mémorisé par famille.
 */
const LAWS = new Map()
const LAW_SAMPLES = 20000

export function sectionLaw(family, { samples = LAW_SAMPLES, seed = 0x5EC7 } = {}) {
  if (!isFamily(family)) throw new RangeError(`알 수 없는 가족 : ${family}`)
  const key = `${family}/${samples}/${seed}`
  if (LAWS.has(key)) return LAWS.get(key)

  const rnd = mulberry32(seed)
  const bag = Array.from({ length: NMAX }, (_, i) => i + 1)
  const rows = []
  for (let t = 0; t < samples; t++) {
    // Sept numéros distincts : les six du tirage, triés, puis le 보너스.
    for (let k = 0; k < 7; k++) {
      const j = k + Math.floor(rnd() * (NMAX - k))
      ;[bag[k], bag[j]] = [bag[j], bag[k]]
    }
    rows.push({
      rang: t + 1, date: '',
      numbers: bag.slice(0, 6).sort((a, b) => a - b),
      bonus: bag[6],
    })
  }
  const s = sectionSeries(fromRows(rows), family)
  const law = {
    samples,
    patterns: new Map(s.patterns.map((p) => [p.flags.join(' '), p.count / samples])),
    blanks: Object.fromEntries(Object.entries(s.blanks).map(([k, v]) => [k, v / samples])),
    byCount: Object.fromEntries(Object.entries(s.byCount).map(([k, v]) => [k, v / samples])),
  }
  LAWS.set(key, law)
  return law
}
