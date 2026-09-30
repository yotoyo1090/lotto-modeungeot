// Combien de temps prend une recherche, sur **cette** machine.
//
// Ce n'est pas une curiosité : toute l'architecture repose sur l'idée que
// le générateur peut tourner dans le navigateur, dans un Web Worker, sans
// serveur. Cette mesure est ce qui le vérifie — ou l'infirme.
//
// Le seuil qui compte est celui de la perception : en dessous de 100 ms une
// recherche paraît instantanée, en dessous de 1 s elle paraît réactive.
// Au-delà, il faudrait précalculer, donc un serveur, donc une autre
// architecture.
//
//   node tools/bench.js

import * as gen from '../src/core/generator.js'
import * as pgen from '../src/core/pension-generator.js'

const RUNS = 5

const LOTTO = [
  ['aucun filtre', {}],
  ['총합 100–160', { total: [100, 160] }],
  ['총합 · AC · 저고 · 홀짝', { total: [100, 160], ac: [7, 10], low: [2, 4], odd: [2, 4] }],
  ['dix critères', {
    total: [90, 170], ac: [6, 10], low: [2, 4], odd: [2, 4],
    primes: [1, 3], composites: [1, 4], headSum: [10, 20], tailSum: [20, 35],
    multiples: { 3: [1, 3] }, sections: { 0: [0, 2], 4: [0, 2] },
  }],
  ['2 고정수 · 5 제외수', {
    include: [7, 13], exclude: [1, 2, 3, 44, 45], total: [110, 150],
  }],
  ['추천수 de 20', { pool: Array.from({ length: 20 }, (_, i) => i + 8) }],
  ['recherche impossible', { total: [130, 140], sections: { 0: [3, 3], 4: [3, 3] } }],
]

const PENSION = [
  ['aucun filtre', {}],
  ['총합 20–34', { total: [20, 34] }],
  ['cinq critères', {
    total: [20, 34], low: [2, 4], odd: [2, 4], ac: [3, 5], distinct: [5, 6],
  }],
  ['positions imposées', {
    positions: [[1, 2, 3], [4, 5, 6], null, [0, 9], null, [7, 8]],
  }],
  ['고정수', { include: [7, 3], total: [25, 30] }],
]

function measure(run) {
  run()                                   // chauffe : le JIT compile
  const times = []
  let last = null
  for (let i = 0; i < RUNS; i++) {
    const started = performance.now()
    last = run()
    times.push(performance.now() - started)
  }
  times.sort((a, b) => a - b)
  return { median: times[Math.floor(RUNS / 2)], best: times[0], result: last }
}

// Un caractère coréen occupe deux colonnes dans un terminal, mais une seule
// unité pour `padEnd`. Sans ça les colonnes du tableau partent en biais.
const width = (text) => [...text].reduce(
  (w, c) => w + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠]/
    .test(c) ? 2 : 1), 0)
const pad = (text, size) => text + ' '.repeat(Math.max(0, size - width(text)))

function table(title, suites, generate, size) {
  console.log(`\n${title}`)
  console.log(`  espace : ${size.toLocaleString('fr-FR')}\n`)
  console.log(`  ${pad('critères', 30)} ${'retenues'.padStart(11)}  ${'médiane'.padStart(9)} ${'meilleur'.padStart(9)}`)
  console.log(`  ${'─'.repeat(30)} ${'─'.repeat(11)}  ${'─'.repeat(9)} ${'─'.repeat(9)}`)
  let worst = 0
  for (const [name, filters] of suites) {
    const { median, best, result } = measure(() => generate(filters, { limit: 100 }))
    worst = Math.max(worst, median)
    console.log(`  ${pad(name, 30)} ${result.kept.toLocaleString('fr-FR').padStart(11)}  ` +
                `${(median.toFixed(0) + ' ms').padStart(9)} ${(best.toFixed(0) + ' ms').padStart(9)}`)
  }
  return worst
}

const a = table('로또 6/45', LOTTO, gen.generate, gen.TOTAL_COMBINATIONS)
const b = table('연금복권 720+', PENSION, pgen.generate, pgen.TOTAL_SEQUENCES)

const worst = Math.max(a, b)
console.log(`\npire cas mesuré : ${worst.toFixed(0)} ms`)
console.log(worst < 100 ? '→ instantané : le navigateur suffit largement.'
  : worst < 1000 ? '→ réactif : le navigateur suffit, dans un Web Worker.'
  : '→ trop lent pour le navigateur — il faudrait précalculer côté serveur.')

// Un dernier contrôle : le tirage au sort doit être reproductible, sinon
// deux personnes qui partagent une recherche ne voient pas la même chose.
const one = gen.generate({ total: [120, 140] }, { sample: 5, seed: 2026 })
const two = gen.generate({ total: [120, 140] }, { sample: 5, seed: 2026 })
const same = JSON.stringify(gen.toArrays(one)) === JSON.stringify(gen.toArrays(two))
console.log(`\ntirage au sort reproductible : ${same ? 'oui' : 'NON — à corriger'}`)
console.log(gen.toArrays(one).map((row) =>
  '  ' + row.map((n) => String(n).padStart(2)).join(' ')).join('\n'))
