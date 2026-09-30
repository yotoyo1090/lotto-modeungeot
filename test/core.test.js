// Le noyau, testé pour lui-même — propriétés et invariants, sans base.
//
// Chaque bug relevé à l'audit de l'ancienne plateforme a ici son test :
// c'est la seule garantie qu'il ne revienne pas.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  fromRows, Draws, NMAX, PICK, FULL, LOW_MAX, SECTIONS, PRIMES, COMPOSITES,
  HEAD, TAIL,
} from '../src/core/draws.js'
import { acValue, carryover, compute, MULTIPLES } from '../src/core/metrics.js'
import * as analysis from '../src/core/analysis.js'
import * as pension from '../src/core/pension.js'

// Un historique jouet, court et prévisible.
const ROWS = [
  { rang: 1, date: '2002-12-07', numbers: [10, 23, 29, 33, 37, 40], bonus: 16 },
  { rang: 2, date: '2002-12-14', numbers: [9, 13, 21, 25, 32, 42], bonus: 2 },
  { rang: 3, date: '2002-12-21', numbers: [11, 16, 19, 21, 27, 31], bonus: 30 },
  { rang: 4, date: '2002-12-28', numbers: [14, 27, 30, 31, 40, 42], bonus: 2 },
  { rang: 5, date: '2003-01-04', numbers: [16, 24, 29, 40, 41, 42], bonus: 3 },
]
const toy = () => fromRows(ROWS)

// -------------------------------------------------------------- structure

test('les numéros sont triés et le bonus rangé à part', () => {
  const d = fromRows([{ rang: 1, date: '2002-12-07',
                        numbers: [40, 10, 33, 23, 37, 29], bonus: 16 }])
  assert.deepEqual([...d.numbersAt(0)], [10, 23, 29, 33, 37, 40])
  assert.equal(d.bonus[0], 16)
})

test('`sequence` place le bonus en septième position, `full` trie les sept', () => {
  const d = toy()
  assert.deepEqual([...d.sequenceAt(0)], [10, 23, 29, 33, 37, 40, 16])
  assert.deepEqual([...d.fullAt(0)], [10, 16, 23, 29, 33, 37, 40])
  // C'est `sequence` qui définit les positions 일 = 1 … 보너스 = 7.
  assert.equal(d.sequenceAt(0)[PICK], 16)
})

test('le masque marque exactement les numéros sortis', () => {
  const d = toy()
  const mask = d.mask()
  const width = NMAX + 1
  assert.equal(mask.subarray(0, width).reduce((a, b) => a + b, 0), PICK)
  for (const n of [10, 23, 29, 33, 37, 40]) assert.equal(mask[n], 1)
  assert.equal(mask[16], 0, 'le bonus n\'est pas compté sans withBonus')
  assert.equal(d.mask({ withBonus: true })[16], 1)
})

test('fenêtres et découpes gardent la cohérence', () => {
  const d = toy()
  const w = d.window(2, 4)
  assert.equal(w.n, 3)
  assert.deepEqual([...w.rangs], [2, 3, 4])
  assert.deepEqual([...w.numbersAt(0)], [9, 13, 21, 25, 32, 42])
  assert.equal(d.last(2).n, 2)
  assert.equal(d.indexOf(3), 2)
  assert.throws(() => d.indexOf(99), RangeError)
})

test('les familles de numéros partitionnent 2..45', () => {
  const both = PRIMES.filter((p) => COMPOSITES.includes(p))
  assert.deepEqual(both, [], 'aucun numéro n\'est à la fois premier et composé')
  assert.equal(PRIMES.length + COMPOSITES.length, NMAX - 1, '1 n\'est ni l\'un ni l\'autre')
  assert.ok(!PRIMES.includes(1) && !COMPOSITES.includes(1))
})

test('앞자리수 et 끝자리수 lisent les bons chiffres', () => {
  assert.equal(HEAD[7], 7); assert.equal(TAIL[7], 7)
  assert.equal(HEAD[13], 1); assert.equal(TAIL[13], 3)
  assert.equal(HEAD[45], 4); assert.equal(TAIL[45], 5)
})

// ------------------------------------------------------------- indicateurs

test('les comptes se complètent toujours', () => {
  const d = toy()
  const m = compute(d)
  for (let i = 0; i < d.n; i++) {
    assert.equal(m.lowCount[i] + m.highCount[i], FULL)
    assert.equal(m.oddCount[i] + m.evenCount[i], FULL)
    assert.equal(m.sectionsAt(i).reduce((a, b) => a + b, 0), FULL)
  }
})

test('le seuil 저/고 est unique — le bug historique ne peut pas revenir', () => {
  // L'original comptait 저 avec `< 23` mais listait 저번호 avec `<= 23` :
  // les deux se contredisaient.
  const d = toy()
  const m = compute(d)
  for (let i = 0; i < d.n; i++) {
    const listed = [...d.fullAt(i)].filter((n) => n <= LOW_MAX)
    assert.equal(listed.length, m.lowCount[i])
  }
})

test('총합 est bien la somme des sept', () => {
  const d = toy()
  const m = compute(d)
  for (let i = 0; i < d.n; i++) {
    assert.equal(m.total[i], [...d.fullAt(i)].reduce((a, b) => a + b, 0))
  }
})

test('AC값 suit sa définition', () => {
  // Sur 7 valeurs : nombre d'écarts distincts − 6.
  assert.equal(acValue([1, 2, 3, 4, 5, 6, 7], 7), 6 - 6)
  const d = toy()
  const m = compute(d)
  for (let i = 0; i < d.n; i++) {
    const row = [...d.fullAt(i)]
    const distinct = new Set()
    for (let a = 0; a < row.length; a++) {
      for (let b = a + 1; b < row.length; b++) distinct.add(Math.abs(row[a] - row[b]))
    }
    assert.equal(m.ac[i], distinct.size - (FULL - 1))
  }
})

test('les multiples et les familles somment ce qu\'ils comptent', () => {
  const d = toy()
  const m = compute(d)
  for (let i = 0; i < d.n; i++) {
    const row = [...d.fullAt(i)]
    for (const k of MULTIPLES) {
      const hit = row.filter((n) => n % k === 0)
      assert.equal(m.multipleCount[k][i], hit.length, `${k}의배수 개수`)
      assert.equal(m.multipleSum[k][i], hit.reduce((a, b) => a + b, 0), `${k}의배수합`)
    }
    assert.equal(m.primeSum[i],
      row.filter((n) => PRIMES.includes(n)).reduce((a, b) => a + b, 0))
  }
})

test('이월 est l\'intersection avec le tirage précédent, positions comprises', () => {
  const d = toy()
  const carry = carryover(d)
  assert.deepEqual(carry.numbers[0], [], 'le premier tirage n\'a pas de précédent')
  for (let i = 1; i < d.n; i++) {
    const previous = [...d.sequenceAt(i - 1)]
    const current = new Set(d.sequenceAt(i))
    const expected = previous.filter((v) => current.has(v))
    assert.deepEqual([...carry.numbers[i]].sort((a, b) => a - b),
      expected.sort((a, b) => a - b))
    // La position est celle du tirage PRÉCÉDENT, en base 1.
    for (let k = 0; k < carry.numbers[i].length; k++) {
      const value = carry.numbers[i][k]
      assert.equal(previous[carry.positions[i][k] - 1], value)
    }
    assert.equal(carry.count[i], carry.numbers[i].length)
    assert.equal(carry.sum[i], carry.numbers[i].reduce((a, b) => a + b, 0))
  }
})

// ---------------------------------------------------------------- analyses

test('l\'écart vaut 0 le jour de la sortie et croît de 1 ensuite', () => {
  const d = toy()
  const g = analysis.gaps(d)
  const width = NMAX + 1
  const mask = d.mask()
  for (let i = 0; i < d.n; i++) {
    for (let k = 1; k <= NMAX; k++) {
      assert.equal(g[i * width + k] === 0, mask[i * width + k] === 1,
        `écart nul ⟺ sortie — tirage ${i}, numéro ${k}`)
      assert.ok(g[i * width + k] >= 0, 'aucun écart négatif')
    }
  }
  // 42 sort aux tirages 2, 4 et 5 (indices 1, 3, 4).
  assert.equal(g[1 * width + 42], 0)
  assert.equal(g[2 * width + 42], 1)
  assert.equal(g[3 * width + 42], 0)
  // Jamais sorti : l'écart se compte depuis le début.
  assert.equal(g[0 * width + 1], 1)
  assert.equal(g[4 * width + 1], 5)
})

test('흐름 refuse un numéro hors bornes', () => {
  const d = toy()
  for (const bad of [0, 46, -1, 1.5]) {
    assert.throws(() => analysis.flow(d, bad), RangeError, `numéro ${bad}`)
  }
  assert.throws(() => analysis.companionsOf(d, 99), RangeError)
})

test('les sorties de 흐름 correspondent aux fréquences', () => {
  const d = toy()
  const freq = analysis.frequency(d)
  for (let n = 1; n <= NMAX; n++) {
    assert.equal(analysis.flowSummary(d, n).hits, freq[n], `numéro ${n}`)
  }
})

test('la matrice des co-occurrences est symétrique', () => {
  const d = toy()
  const c = analysis.companions(d)
  const width = NMAX + 1
  for (let a = 1; a <= NMAX; a++) {
    for (let b = 1; b <= NMAX; b++) {
      assert.equal(c[a * width + b], c[b * width + a])
    }
  }
  const freq = analysis.frequency(d)
  for (let k = 1; k <= NMAX; k++) {
    assert.equal(c[k * width + k], freq[k], 'la diagonale compte les sorties')
  }
})

test('les co-occurrences excluent le numéro lui-même', () => {
  const d = toy()
  assert.ok(analysis.companionsOf(d, 42).pairs.every((x) => x.number !== 42))
})

test('le recouvrement reste entre 0 et 6', () => {
  const d = toy()
  const ov = analysis.overlap(d, 14)
  assert.equal(ov[0], 0, 'le premier tirage n\'a pas d\'historique')
  for (const v of ov) assert.ok(v >= 0 && v <= PICK)
})

test('le repère du recouvrement suit la taille du pool', () => {
  const d = toy()
  // Une fenêtre d'un seul tirage laisse exactement PICK numéros : le repère
  // vaut alors PICK × PICK / NMAX, quel que soit l'historique.
  assert.ok(Math.abs(analysis.overlapExpected(d, 1) - (PICK * PICK) / NMAX) < 1e-9,
    'sur une fenêtre de 1, le pool fait toujours six numéros')

  // Le pool ne peut que grandir avec la fenêtre, donc le repère aussi, et
  // il ne dépasse jamais PICK — un pool de 45 rendrait les six à coup sûr.
  let previous = 0
  for (const w of [1, 2, 5, 14, 50]) {
    const e = analysis.overlapExpected(d, w)
    assert.ok(e >= previous, `le repère recule entre ${previous} et ${e}`)
    assert.ok(e <= PICK, 'le repère ne peut pas dépasser six numéros')
    previous = e
  }
})

test('la loi du recouvrement somme aux 회차 mesurables et retrouve la moyenne', () => {
  const d = toy()
  for (const w of [1, 14]) {
    const law = analysis.overlapLaw(d, w)
    let sum = 0, mean = 0
    for (let k = 0; k <= PICK; k++) { sum += law[k]; mean += k * law[k] }
    assert.ok(Math.abs(sum - (d.n - 1)) < 1e-9, 'une loi par 회차, le premier sauté')
    assert.ok(Math.abs(mean / (d.n - 1) - analysis.overlapExpected(d, w)) < 1e-9,
      'la moyenne de la loi est le repère déjà calculé')
  }
  assert.equal(analysis.overlapLaw(d.slice(0, 1), 14)[0], 0, 'sans historique, rien')
})

test('le repère du recouvrement ne réclame pas d\'historique', () => {
  const d = toy()
  assert.equal(analysis.overlapExpected(d.slice(0, 1), 14), 0,
    'un seul tirage n\'a rien à recouvrir')
})

test('les signatures 구간 couvrent tous les tirages', () => {
  const d = toy()
  const total = Object.values(analysis.sectionSignatures(d))
    .reduce((a, b) => a + b, 0)
  assert.equal(total, d.n)
})

test('les températures des gagnants totalisent six numéros', () => {
  const d = toy()
  const counts = analysis.temperatureOfWinners(d)
  for (let i = 1; i < d.n; i++) {
    const row = [...counts.subarray(i * 4, (i + 1) * 4)]
    assert.equal(row.reduce((a, b) => a + b, 0), PICK, `tirage ${i}`)
  }
})

test('positions rend sept colonnes', () => {
  const d = toy()
  const p = analysis.positions(d)
  assert.equal(p.length, PICK + 1, 'six positions plus le bonus')
  for (const column of p) {
    assert.equal(Object.values(column).reduce((a, b) => a + b, 0), d.n)
  }
})

test('placeExpected est une loi : somme 1, 일 penche bas, 육 penche haut, bonus plat', () => {
  for (let p = 0; p <= PICK; p++) {
    const law = analysis.placeExpected(p)
    const sum = Object.values(law).reduce((a, b) => a + b, 0)
    assert.ok(Math.abs(sum - 1) < 1e-9, `position ${p} : somme ${sum}`)
  }
  const first = analysis.placeExpected(0)
  const sixth = analysis.placeExpected(PICK - 1)
  // 일 peut valoir 40 (41…45 au-dessus), jamais 41 ; 육 peut valoir 6, jamais 5.
  assert.ok(first[1] > first[20] && first[40] > 0 && first[41] === 0, '일 ne monte pas à 41')
  assert.ok(sixth[45] > sixth[20] && sixth[6] > 0 && sixth[5] === 0, '육 ne descend pas à 5')
  // 일 = v exige cinq numéros au-dessus : C(45−v, 5) / C(45, 6)
  assert.ok(Math.abs(first[1] - 1086008 / 8145060) < 1e-9)
  const bonus = analysis.placeExpected(PICK)
  assert.ok(Math.abs(bonus[7] - 1 / 45) < 1e-12)
  // et placeFlow le porte, à l'échelle des 회차
  const d = toy()
  const f = analysis.placeFlow(d, 0)
  assert.ok(Math.abs(f.expected[1] - first[1] * d.n) < 1e-9)
  assert.throws(() => analysis.placeExpected(7), RangeError)
})

// -------------------------------------------------------------- 연금복권

const PENSION_ROWS = [
  { rang: 1, date: '2020-05-07', group: 1, digits: [4, 5, 0, 5, 5, 8], bonus: [1, 2, 3, 4, 5, 6] },
  { rang: 2, date: '2020-05-14', group: 3, digits: [5, 4, 4, 9, 5, 5], bonus: [2, 3, 4, 5, 6, 7] },
  { rang: 3, date: '2020-05-21', group: 5, digits: [1, 2, 4, 4, 2, 0], bonus: [3, 4, 5, 6, 7, 8] },
]
const toyPension = () => pension.fromRows(PENSION_ROWS)

test('les chiffres du 연금복권 peuvent se répéter', () => {
  const p = toyPension()
  assert.deepEqual([...p.digitsAt(0)], [4, 5, 0, 5, 5, 8])
  const m = pension.compute(p)
  assert.equal(m.repeats[0], 3, 'trois 5')
  assert.equal(m.distinct[0], 4, '4, 5, 0, 8')
})

test('les comptes 연금복권 se complètent', () => {
  const p = toyPension()
  const m = pension.compute(p)
  for (let i = 0; i < p.n; i++) {
    assert.equal(m.lowCount[i] + m.highCount[i], pension.DIGITS)
    assert.equal(m.oddCount[i] + m.evenCount[i], pension.DIGITS)
  }
})

test('le seuil 저/고 du 연금복권 est unique', () => {
  const p = toyPension()
  const m = pension.compute(p)
  for (let i = 0; i < p.n; i++) {
    const listed = [...p.digitsAt(i)].filter((d) => d <= pension.LOW_MAX)
    assert.equal(listed.length, m.lowCount[i])
  }
})

test('les multiples du 연금복권 écartent le zéro', () => {
  const p = toyPension()
  const m = pension.compute(p)
  // Tirage 1 : [4,5,0,5,5,8] — les multiples de 2 sont 4 et 8, pas 0.
  assert.equal(m.multipleCount[2][0], 2)
  assert.equal(m.multipleSum[2][0], 12)
})

test('이월 du 연금복권 compte les répétitions', () => {
  const p = toyPension()
  const carry = pension.carryover(p)
  // Tirage 2 [5,4,4,9,5,5] après [4,5,0,5,5,8] : trois 5 et deux 4.
  assert.deepEqual([...carry.values[1]].sort((a, b) => a - b), [4, 4, 5, 5, 5])
  assert.equal(carry.count[1], 5)
  assert.equal(carry.sum[1], 23)
  // La position est l'index 1-based dans le tirage courant.
  assert.deepEqual(carry.positions[1], [1, 2, 3, 5, 6])
})

test('les 흐름 par position ont la bonne forme', () => {
  const p = toyPension()
  const g = pension.gaps(p)
  assert.equal(g.length, p.n * pension.DIGITS * pension.BASE)
  for (let i = 0; i < p.n; i++) {
    for (let pos = 0; pos < pension.DIGITS; pos++) {
      const drawn = p.digitsAt(i)[pos]
      assert.equal(g[(i * pension.DIGITS + pos) * pension.BASE + drawn], 0,
        'le chiffre sorti a un écart nul')
      for (let d = 0; d < pension.BASE; d++) {
        assert.ok(g[(i * pension.DIGITS + pos) * pension.BASE + d] >= 0,
          'aucun écart négatif')
      }
    }
  }
})

test('les fenêtres gardent les zéros de tête', () => {
  const p = toyPension()
  for (const [size, expected] of [[3, 4], [2, 5], [1, 6]]) {
    const rows = pension.windows(p, size)
    assert.ok(rows.every((r) => r.length === expected), `taille ${size}`)
    assert.ok(rows.every((r) => r.every((w) => w.length === size)),
      '« 059 » et « 59 » ne sont pas le même motif')
  }
  assert.equal(pension.windows(p, 3)[0][1], '505')
  assert.throws(() => pension.windows(p, 4), RangeError)
})

test('les fréquences 연금복권 couvrent chaque position et chaque 조', () => {
  const p = toyPension()
  const positions = pension.positionFrequency(p)
  assert.equal(positions.length, pension.DIGITS)
  for (const column of positions) {
    assert.equal(Object.values(column).reduce((a, b) => a + b, 0), p.n)
  }
  assert.equal(Object.values(pension.groupFrequency(p)).reduce((a, b) => a + b, 0), p.n)
})

test('AC값 du 연금복권 peut être négatif quand les chiffres se répètent', () => {
  // Six chiffres identiques : un seul écart distinct (0), donc 1 − 5 = −4.
  assert.equal(pension.acValue([7, 7, 7, 7, 7, 7], 6), -4)
})

// Le compte de 동반 출현 번호 n'était pas seulement mal affiché : rien ne
// vérifiait qu'il existait. Ce test tient le dénominateur, la part et le
// repère ensemble — c'est ce trio qui rend un « 27회 » interprétable.
test('les compagnons rendent le compte, la part et le dénominateur', () => {
  const d = toy()
  for (const withBonus of [false, true]) {
    const n = 1
    const r = analysis.companionsOf(d, n, 45, { withBonus })

    // Le dénominateur est bien le nombre de sorties du numéro.
    let hits = 0
    for (let i = 0; i < d.n; i++) {
      const row = withBonus ? d.fullAt(i) : d.numbersAt(i)
      if ([...row].includes(n)) hits++
    }
    assert.equal(r.hits, hits, `출현 de ${n}`)

    for (const p of r.pairs) {
      assert.ok(p.together > 0)
      // Deux numéros ne peuvent pas sortir ensemble plus souvent que l'un
      // d'eux ne sort.
      assert.ok(p.together <= r.hits, `${p.number} : ${p.together} > ${r.hits}`)
      assert.equal(p.share, p.together / r.hits)
      assert.ok(p.share <= 1)
    }
    // Le repère : jamais plus que le nombre de sorties, jamais négatif.
    assert.ok(r.expected >= 0 && r.expected <= r.hits)
  }

  // Et il reste trié : du plus fréquent au moins fréquent.
  const { pairs } = analysis.companionsOf(d, 1, 45)
  for (let i = 1; i < pairs.length; i++) {
    assert.ok(pairs[i].together <= pairs[i - 1].together, 'tri par fréquence')
  }
})

// ------------------------------------------------------- 기본상식, les règles

test('les règles des deux jeux se tiennent debout', async () => {
  const { RULES, chanceOver, yearsFor } = await import('../src/core/rules.js')

  // 로또 : l'espace vaut bien C(45,6), et la cote du 1등 vaut cet espace.
  const c456 = (() => {
    let out = 1
    for (let k = 0; k < 6; k++) out = (out * (45 - k)) / (k + 1)
    return Math.round(out)
  })()
  assert.equal(RULES.lotto.space, c456)
  assert.equal(RULES.lotto.ranks[0].odds, c456)

  // Les trois parts variables font le tout.
  const shares = RULES.lotto.ranks.filter((r) => r.share).map((r) => r.share)
  assert.equal(shares.length, 3)
  assert.equal(shares.reduce((a, b) => a + b, 0), 1)

  // Et les deux rangs fixes n'ont pas de part, ni l'inverse.
  for (const r of RULES.lotto.ranks) {
    assert.ok((r.share === undefined) !== (r.fixed === undefined), r.label)
  }

  // 연금복권 : cinq 조 de un million de billets.
  assert.equal(RULES.pension.space, 5 * 1_000_000)
  assert.equal(RULES.pension.ranks[0].odds, 5_000_000)

  // Les cotes des rangs à « queue » sont en 1/11, 1/111, 1/1111… : à chaque
  // chiffre de plus, on retranche les cas déjà gagnés au rang du dessous.
  const tails = RULES.pension.ranks.filter((r) => r.rank >= 3 && r.rank <= 7)
  assert.equal(tails.length, 5)
  for (const r of tails) {
    // Ces rangs ne comptent que la queue du numéro, et **excluent** ce qui
    // est déjà gagné au rang du dessus. Sur un 조, les billets dont les `d`
    // derniers chiffres tombent mais pas les `d+1` sont 9 × 10^(5−d) ; il y
    // a cinq 조 pour cinq millions de billets.
    const digits = 8 - r.rank            // 7등 → 1 chiffre, 3등 → 5 chiffres
    const winners = 5 * 9 * 10 ** (5 - digits)
    assert.equal(r.odds, Math.round(5_000_000 / winners),
      `${r.label} · ${digits} chiffres`)
  }

  // Les cotes vont du plus dur au plus facile, dans les deux jeux.
  for (const key of ['lotto', 'pension']) {
    const odds = RULES[key].ranks.filter((r) => !r.bonus).map((r) => r.odds)
    assert.deepEqual(odds, [...odds].sort((a, b) => b - a), key)
  }

  // Les annuités : le total annoncé vaut bien mensuel × durée.
  assert.equal(RULES.pension.ranks[0].total, 7_000_000 * 12 * 20)
  assert.equal(RULES.pension.ranks[1].total, 1_000_000 * 12 * 10)
})

test('la chance sur plusieurs jeux ne dépasse jamais un', async () => {
  const { chanceOver, yearsFor } = await import('../src/core/rules.js')

  // Un jeu : la chance vaut exactement la cote.
  assert.ok(Math.abs(chanceOver(45, 1) - 1 / 45) < 1e-12)

  // Elle croît avec les jeux, mais reste sous 1 — c'est tout le propos de
  // la page : dix fois plus de jeux ne fait pas dix fois plus de chances.
  let previous = 0
  for (const games of [1, 10, 100, 1000, 100000]) {
    const c = chanceOver(8145060, games)
    assert.ok(c > previous && c < 1, `${games} jeux`)
    previous = c
  }
  // Et elle reste **sous** le produit naïf.
  assert.ok(chanceOver(45, 100) < 100 / 45)

  // Le temps : une cote de 52 vaut un an à un jeu par semaine.
  assert.equal(yearsFor(52, 52), 1)
  assert.ok(Math.abs(yearsFor(8145060, 52) - 156636.7) < 1)
})

// --------------------------------------------------------- 위치별 이월

test('placeCarry : le numéro d\'une position ressort-il au 회차 suivant', () => {
  const d = toy()
  // 일 = 10, 9, 11, 14 : aucun ne figure dans le 회차 suivant.
  const first = analysis.placeCarry(d, 0)
  assert.equal(first.rounds, 4)
  assert.equal(first.hits, 0)
  assert.deepEqual([...first.series], [0, 0, 0, 0])
  assert.ok(Math.abs(first.expected - 4 * FULL / NMAX) < 1e-9)
  // 보너스 = 16, 2, 30, 2 : le 30 (rang 3) est dans le rang 4, le reste non.
  const bonus = analysis.placeCarry(d, PICK)
  assert.deepEqual([...bonus.series], [0, 0, 1, 0])
  assert.equal(bonus.hits, 1)
  assert.equal(analysis.placeCarry(d.slice(0, 1), 0).rounds, 0, 'un seul 회차 : rien à suivre')
})

// ------------------------------------------------------------- 제외번호

test('la loi du 제외번호 compte chaque 회차 une fois et retrouve la moyenne', async () => {
  const { excludedHitRate } = await import('../src/core/patterns.js')
  const d = toy()
  const r = excludedHitRate(d, { window: 2 })
  assert.equal(r.rounds, 3)
  assert.equal(r.series.length, 3)
  let obs = 0, law = 0, mean = 0
  for (let k = 0; k <= FULL; k++) { obs += r.counts[k]; law += r.law[k]; mean += k * r.law[k] }
  assert.equal(obs, r.rounds, 'un comptage par 회차')
  assert.ok(Math.abs(law - r.rounds) < 1e-9, 'une loi par 회차')
  assert.ok(Math.abs(mean - r.expected) < 1e-9, 'la moyenne de la loi est le repère')
  assert.equal(r.series.reduce((a, b) => a + b, 0), r.hits, 'la série somme aux réussites')
})
