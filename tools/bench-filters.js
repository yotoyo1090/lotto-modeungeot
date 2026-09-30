// 필터 조합 검정 : lance le banc de `src/core/filter-bench.js` sur tous les
// tirages de la base, et écrit le résultat que lit l'écran 팁 › 필터 조합 검정.
//
//   npm run bench:filters
//
// Une vingtaine de minutes : quelques milliers de passages du moteur sur les
// 8 145 060 combinaisons. À relancer de temps en temps, après de nouveaux
// 회차 — le résultat est figé dans `web/src/lib/filter-bench.json`, versionné
// avec le code, pour que l'installation n'ait pas à le recalculer.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fromRows } from '../src/core/draws.js'
import { benchFilters } from '../src/core/filter-bench.js'
import { DEFAULT_PATH, getDraws, open } from '../src/node/db.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'web', 'src', 'lib', 'filter-bench.json')

const round = (x) => Math.round(x * 1e6) / 1e6
const started = Date.now()
const draws = fromRows(getDraws(open(process.argv[2] ?? DEFAULT_PATH, { readOnly: true })))
console.log(`${draws.n} 회차 — ${draws.rangs[0]}회 à ${draws.rangs[draws.n - 1]}회`)

const result = benchFilters(draws, {
  onProgress: (...what) => console.log(`  ${((Date.now() - started) / 1000).toFixed(0).padStart(5)} s`, ...what),
})

// Six décimales suffisent, et divisent le fichier par deux.
const text = JSON.stringify(result, (_, v) => (typeof v === 'number' && !Number.isInteger(v) ? round(v) : v))
writeFileSync(OUT, text)
console.log(`écrit ${OUT} (${(text.length / 1024).toFixed(0)} Ko) en ${((Date.now() - started) / 60000).toFixed(1)} min`)
const a = result.all['0.8']
console.log(`toutes les cases ~80 % : ${a.kept} combinaisons, 적중 test ${(a.te * 100).toFixed(1)} % · 통과 ${(a.K * 100).toFixed(1)} %`)
