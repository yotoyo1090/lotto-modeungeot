// 분배 — réajuster SHARING_MODEL sur l'historique, avec ou sans dilution.
//
//   node --experimental-sqlite tools/fit-sharing.js [--target total|manual] [--db chemin]
//
// Le modèle de `core/sharing.js` est une régression de Poisson : gagnants
// du 1등 expliqués par la forme de la grille, avec le volume en offset.
// Ses coefficients sont des constantes ; ce fichier est ce qui les
// produit, et il sait le faire de deux façons :
//
//   total    ce que sharing.js fait aujourd'hui — tous les gagnants,
//            offset log(5등 / 182 780). Sert de témoin : doit redonner les
//            constantes actuelles à la troisième décimale.
//   manual   les gagnants 수동 seuls, offset log(gagnants 자동). Les 자동 ne
//            dépendent pas des numéros, ils mesurent le volume ; diviser
//            par eux enlève les deux tiers de gagnants qui ne portaient
//            aucune information. Demande `win_types` rempli (backfill).
//
// Mêmes trois facteurs, mêmes niveaux, même correction de surdispersion
// (φ = χ² de Pearson / df) que le modèle en place. Rien de neuf dans la
// méthode : seulement ce qu'on met au numérateur et au dénominateur.
//
// L'outil imprime les coefficients avec leur p, puis la calibration par
// bande sous le modèle qu'il vient d'ajuster, pour comparer à l'ancien.
// Il n'écrit rien : recopier les constantes dans SHARING_MODEL est un
// geste qu'on fait en lisant, pas un effet de bord.

import { fromRows } from '../src/core/draws.js'
import {
  EXPECTED_PER_FIFTH, SHARING_BANDS, SMALL_MAX, TIGHT_SPREAD, sharingFactors,
} from '../src/core/sharing.js'
import { DEFAULT_PATH, open } from '../src/node/db.js'

const level = (v) => (v === 0 ? 0 : v <= 2 ? 1 : 2)

/** Les cinq indicatrices du modèle, dans l'ordre de SHARING_MODEL. */
export function design(numbers) {
  const f = sharingFactors(numbers)
  const r = level(f.runs)
  const s = level(f.small)
  return [1, r === 1, r === 2, s === 1, s === 2, f.spread > TIGHT_SPREAD].map(Number)
}

/**
 * Poisson avec offset, par moindres carrés repondérés (IRLS). `rows` :
 * { x: [6], y, offset }. Rend β, les écarts-types corrigés de φ, et φ.
 */
export function poissonFit(rows, { iterations = 25 } = {}) {
  const k = rows[0].x.length
  let beta = new Array(k).fill(0)
  for (let it = 0; it < iterations; it++) {
    // Système normal XᵀWX β = XᵀW z, avec W = μ et z = η + (y − μ)/μ.
    const A = Array.from({ length: k }, () => new Array(k).fill(0))
    const b = new Array(k).fill(0)
    for (const { x, y, offset } of rows) {
      const eta = offset + x.reduce((s, v, j) => s + v * beta[j], 0)
      const mu = Math.exp(eta)
      const z = (eta - offset) + (y - mu) / mu
      for (let i = 0; i < k; i++) {
        b[i] += x[i] * mu * z
        for (let j = 0; j < k; j++) A[i][j] += x[i] * mu * x[j]
      }
    }
    const next = solve(A, b)
    const delta = Math.max(...next.map((v, j) => Math.abs(v - beta[j])))
    beta = next
    if (delta < 1e-9) break
  }
  // Surdispersion et écarts-types.
  let pearson = 0
  const A = Array.from({ length: k }, () => new Array(k).fill(0))
  for (const { x, y, offset } of rows) {
    const mu = Math.exp(offset + x.reduce((s, v, j) => s + v * beta[j], 0))
    pearson += (y - mu) ** 2 / mu
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) A[i][j] += x[i] * mu * x[j]
  }
  const phi = pearson / (rows.length - k)
  const cov = invert(A)
  const se = cov.map((row, j) => Math.sqrt(row[j] * phi))
  return { beta, se, phi, n: rows.length }
}

function solve(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

function invert(A) {
  const n = A.length
  return Array.from({ length: n }, (_, j) =>
    solve(A, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0))))
    .reduce((inv, col, j) => { col.forEach((v, i) => { inv[i][j] = v }); return inv },
      Array.from({ length: n }, () => new Array(n).fill(0)))
}

/** p bilatéral d'un z normal. */
function pNormal(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp(-z * z / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return 2 * p
}

function main() {
  const args = process.argv.slice(2)
  const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback }
  const target = opt('--target', 'total')
  const db = open(opt('--db', DEFAULT_PATH), { readOnly: true })

  const draws = db.prepare(`
    SELECT d.rang, d.date, d.n1, d.n2, d.n3, d.n4, d.n5, d.n6, d.bonus,
           p1.winners AS first, p5.winners AS fifth,
           w.auto, w.manual, w.semi
      FROM draws d
      LEFT JOIN prizes p1 ON p1.rang = d.rang AND p1.rank = 1
      LEFT JOIN prizes p5 ON p5.rang = d.rang AND p5.rank = 5
      LEFT JOIN win_types w ON w.rang = d.rang
     ORDER BY d.rang`).all()
  db.close()

  const rows = []
  let skipped = 0
  for (const d of draws) {
    const numbers = [d.n1, d.n2, d.n3, d.n4, d.n5, d.n6]
    let y, offset
    if (target === 'total') {
      if (d.first == null || !d.fifth) { skipped++; continue }
      y = d.first; offset = Math.log(d.fifth / EXPECTED_PER_FIFTH)
    } else if (target === 'manual') {
      if (d.auto == null || d.auto === 0) { skipped++; continue }
      y = d.manual; offset = Math.log(d.auto)
    } else {
      console.error('--target total | manual'); process.exit(1)
    }
    rows.push({ rang: d.rang, numbers, x: design(numbers), y, offset })
  }
  if (rows.length < 50) {
    console.error(`${rows.length}개 회차뿐 — 너무 적습니다 (건너뜀 ${skipped})`)
    process.exit(1)
  }

  const fit = poissonFit(rows)
  const names = ['base', 'runs 1–2', 'runs 3+', 'small 1–2', 'small 3+', 'spread ≥ 21']
  console.log(`대상 ${target} · ${fit.n}회차 (건너뜀 ${skipped}) · φ = ${fit.phi.toFixed(2)}\n`)
  console.log('  계수          β        se       z        p')
  fit.beta.forEach((b, j) => {
    const z = b / fit.se[j]
    console.log(`  ${names[j].padEnd(12)} ${b.toFixed(4).padStart(8)} ${fit.se[j].toFixed(4).padStart(8)} ${z.toFixed(2).padStart(7)} ${pNormal(z).toFixed(4).padStart(8)}`)
  })

  // Calibration par bande sous le modèle ajusté. L'indice d'une grille est
  // exp(xβ) ramené à 1 en moyenne sur les 회차 ; les bandes gardent leurs
  // seuils actuels pour que l'ancien et le nouveau se lisent côte à côte.
  const idx = rows.map((r) => Math.exp(r.x.reduce((s, v, j) => s + v * fit.beta[j], 0)))
  const mean = idx.reduce((s, v) => s + v, 0) / idx.length
  const bands = SHARING_BANDS.map((b) => ({ ...b, draws: 0, y: 0, e: 0 }))
  rows.forEach((r, i) => {
    const v = idx[i] / mean
    const band = bands.find((b) => v < b.max) ?? bands.at(-1)
    band.draws++; band.y += r.y; band.e += Math.exp(r.offset) * mean
  })
  console.log(`\n  띠          회차   관측/기대`)
  for (const b of bands) {
    console.log(`  ${b.label.padEnd(9)} ${String(b.draws).padStart(5)}   ${b.e ? (b.y / b.e).toFixed(3) : '—'}`)
  }
  console.log('\n(아무것도 쓰지 않았습니다 — SHARING_MODEL 은 손으로 옮깁니다)')
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) main()
