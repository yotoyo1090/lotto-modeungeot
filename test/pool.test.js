// 풀 검정 — l'écran qui répond « est-ce mieux que le hasard ? ».
//
// Ce que ces tests protègent, dans l'ordre d'importance :
//
//   1. la marche avant — un ensemble ne doit JAMAIS voir le 회차 qu'il prédit
//   2. la variance hypergéométrique — sans la correction (45−T)/44, un grand
//      ensemble sort significatif à tort
//   3. le contrôle : la règle `random` doit rendre un verdict « hasard »
//
// Le troisième est le seul qui compte vraiment pour l'utilisateur. Si le
// contrôle se déclarait significatif, tout l'écran mentirait.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

import {
  BASE_RATE, MIN_HISTORY, POOL_RULES, buildPool, hyperDist, poolCapture,
  poolRule, poolVerdict,
} from '../src/core/pool.js'
import { fromRows } from '../src/core/draws.js'
import { open, getDraws, DEFAULT_PATH } from '../src/node/db.js'

// Un historique synthétique, sans base : les tests de mécanique n'en ont pas
// besoin, et ils doivent tourner partout.
function synthetic(n = 400, seed = 7) {
  let a = seed
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rows = []
  for (let i = 1; i <= n; i++) {
    const bag = []
    for (let v = 1; v <= 45; v++) bag.push(v)
    for (let k = bag.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [bag[k], bag[j]] = [bag[j], bag[k]]
    }
    rows.push({
      rang: i,
      date: '2020-01-01',
      numbers: bag.slice(0, 6).sort((x, y) => x - y),
      bonus: bag[6],
    })
  }
  return fromRows(rows)
}

test('la référence est bien 6/45', () => {
  assert.equal(BASE_RATE, 6 / 45)
  assert.ok(Math.abs(BASE_RATE - 0.133333) < 1e-5)
})

test('chaque règle rend un ensemble de la taille demandée', () => {
  const draws = synthetic()
  for (const rule of POOL_RULES) {
    if (rule.manual) continue
    const pool = buildPool(draws, 300, { rule: rule.key, size: 14, window: 30 })
    assert.ok(pool.length > 0, `${rule.key} : ensemble vide`)
    assert.ok(pool.length <= 45, rule.key)
    // Toujours trié, sans doublon, dans les bornes.
    assert.deepEqual([...pool].sort((a, b) => a - b), pool, `${rule.key} : non trié`)
    assert.equal(new Set(pool).size, pool.length, `${rule.key} : doublon`)
    for (const n of pool) assert.ok(n >= 1 && n <= 45, `${rule.key} : ${n}`)
    if (rule.size && rule.key !== 'pattern') {
      assert.equal(pool.length, 14, `${rule.key} : taille`)
    }
  }
})

test('MARCHE AVANT — l’ensemble ne voit jamais le 회차 qu’il prédit', () => {
  const draws = synthetic()
  // On compose au 회차 300 en ne connaissant que 300 tirages, puis on
  // recompose la même chose sur un historique tronqué à 300. Identique.
  const short = fromRows(Array.from({ length: 300 }, (_, i) => ({
    rang: draws.rangs[i],
    date: '2020-01-01',
    numbers: [...draws.numbersAt(i)],
    bonus: draws.bonus[i],
  })))
  for (const rule of ['hot', 'cold', 'freq', 'rare', 'total', 'carry', 'pattern']) {
    assert.deepEqual(
      buildPool(draws, 300, { rule, size: 14, window: 30 }),
      buildPool(short, 300, { rule, size: 14, window: 30 }),
      `${rule} : l’ensemble dépend de tirages postérieurs`,
    )
  }
})

test('un ensemble fixe rend exactement ce qu’on lui donne', () => {
  const draws = synthetic()
  const mine = [3, 17, 17, 42, 0, 46, 8]
  assert.deepEqual(buildPool(draws, 200, { rule: 'mine', numbers: mine }),
    [3, 8, 17, 42])
})

test('la répartition attendue somme à un', () => {
  for (const T of [1, 7, 14, 22, 45]) {
    const d = hyperDist(T)
    assert.ok(Math.abs(d.reduce((a, b) => a + b, 0) - 1) < 1e-9, `T = ${T}`)
    // La moyenne de la loi est T × 6/45 — le repère de tout l’écran.
    const mean = d.reduce((a, v, k) => a + v * k, 0)
    assert.ok(Math.abs(mean - T * BASE_RATE) < 1e-9, `T = ${T} : moyenne`)
  }
})

test('LA VARIANCE porte la correction de population finie', () => {
  const draws = synthetic()
  // À T = 45 l’ensemble contient tout : il attrape les six à chaque fois,
  // sans la moindre variation. La variance doit être nulle, et le z aussi —
  // sans la correction (45−T)/44 elle vaudrait 45 × p(1−p) et le z exploserait.
  const r = poolCapture(draws, { rule: 'mine', numbers: Array.from({ length: 45 }, (_, i) => i + 1) })
  assert.ok(r.ok)
  assert.equal(r.whole.caught, r.whole.draws * 6)
  assert.ok(Math.abs(r.whole.variance) < 1e-9, `variance ${r.whole.variance}`)
  assert.equal(r.whole.z, null)
})

test('les deux moitiés se recomposent en la période entière', () => {
  const draws = synthetic()
  const r = poolCapture(draws, { rule: 'cold', size: 14 })
  assert.equal(r.first.draws + r.second.draws, r.whole.draws)
  assert.equal(r.first.caught + r.second.caught, r.whole.caught)
  assert.ok(Math.abs(r.first.expected + r.second.expected - r.whole.expected) < 1e-9)
})

test('LE CONTROLE — sur des tirages sans mémoire, rien ne ressort', () => {
  // Vingt historiques synthétiques, vingt règles réelles : la proportion de
  // verdicts « signal » doit rester au niveau du bruit. Si l’écran criait au
  // signal ici, il crierait sur n’importe quoi.
  let signal = 0
  let total = 0
  for (let s = 0; s < 20; s++) {
    const draws = synthetic(400, 100 + s * 13)
    for (const rule of ['hot', 'cold', 'freq', 'rare', 'total', 'carry', 'random']) {
      const r = poolCapture(draws, { rule, size: 14, window: 30, seed: 1000 + s })
      if (!r.ok) continue
      total++
      if (poolVerdict(r).key === 'signal') signal++
    }
  }
  assert.ok(total >= 100, `${total} mesures`)
  assert.ok(signal / total <= 0.05, `${signal}/${total} verdicts « signal »`)
})

test('le verdict distingue le solide du fragile', () => {
  assert.equal(poolVerdict({ ok: false, why: 'x' }).key, 'none')
  const mk = (z, z1, z2) => ({
    ok: true, whole: { z }, first: { z: z1 }, second: { z: z2 },
  })
  assert.equal(poolVerdict(mk(0.4, 0.5, 0.2)).key, 'chance')
  assert.equal(poolVerdict(mk(2.4, 2.9, -0.1)).key, 'fragile')
  assert.equal(poolVerdict(mk(2.4, 1.6, 1.8)).key, 'signal')
  assert.equal(poolVerdict(mk(-2.4, -1.6, -1.8)).label, '우연보다 못합니다')
})

test('les métadonnées des règles se tiennent', () => {
  assert.equal(POOL_RULES.length, new Set(POOL_RULES.map((r) => r.key)).size)
  for (const r of POOL_RULES) {
    assert.ok(r.label && r.gloss, r.key)
    assert.equal(poolRule(r.key), r)
  }
  assert.equal(poolRule('n’existe pas'), null)
  assert.ok(MIN_HISTORY >= 30)
})

// ─────────────────────────────────────────────── sur les vrais tirages

test('sur l’historique réel, aucune règle ne bat le hasard', { skip: !existsSync(DEFAULT_PATH) }, () => {
  const db = open(DEFAULT_PATH, { readOnly: true })
  const draws = fromRows(getDraws(db))
  db.close()

  for (const rule of ['hot', 'cold', 'freq', 'rare', 'total', 'carry', 'pattern']) {
    const r = poolCapture(draws, { rule, size: 14, window: 30, from: 200 })
    assert.ok(r.ok, rule)
    const v = poolVerdict(r)
    assert.notEqual(v.key, 'signal',
      `${rule} : verdict « signal » — z ${r.whole.z.toFixed(2)}` +
      ` (moitiés ${r.first.z.toFixed(2)} / ${r.second.z.toFixed(2)})`)
    // Le taux mesuré doit rester dans un mouchoir autour de 13,333 %.
    assert.ok(Math.abs(r.whole.rate - BASE_RATE) < 0.02,
      `${rule} : ${(r.whole.rate * 100).toFixed(2)}%`)
  }
})
