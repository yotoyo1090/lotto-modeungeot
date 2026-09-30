// Le chargement des données.
//
// Cinq fichiers écrits par `tools/build.js`. Deux sont chargés d'emblée —
// les tirages, 50 Ko à eux deux ; trois à la demande — les gains et les 비고,
// qui ne servent que lorsqu'on ouvre un tirage précis.
//
// Le format est colonnaire et à plat : `numbers` est un seul tableau de
// 6 × N entiers, pas N tableaux de six. Sur 1 238 tirages cela retire une
// quinzaine de kilo-octets de crochets et de virgules.

import { fromRows } from '@core/draws.js'
import { fromRows as pensionFromRows } from '@core/pension.js'

const BASE = `${import.meta.env.BASE_URL}data/`

async function json(name) {
  // `no-cache` : après une mise à jour depuis l'onglet 업데이트, le
  // navigateur doit revalider et non rendre l'ancienne copie.
  const response = await fetch(`${BASE}${name}`, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`${name} 파일을 찾을 수 없습니다 (${response.status}) — \`npm run build:data\`를 실행했나요?`)
  }
  return response.json()
}

/** La tranche i d'un tableau à plat de pas 6. */
const six = (flat, i) => flat.slice(i * 6, i * 6 + 6)

export async function load() {
  const [lotto, pension, meta] = await Promise.all([
    json('lotto.json'), json('pension.json'), json('meta.json'),
  ])

  const drawRows = []
  for (let i = 0; i < lotto.n; i++) {
    drawRows.push({
      rang: lotto.rangs[i],
      date: lotto.dates[i],
      numbers: six(lotto.numbers, i),
      bonus: lotto.bonus[i],
    })
  }

  const pensionRows = []
  for (let i = 0; i < pension.n; i++) {
    pensionRows.push({
      rang: pension.rangs[i],
      date: pension.dates[i],
      group: pension.groups[i],
      digits: six(pension.digits, i),
      bonus: six(pension.bonus, i),
    })
  }

  return {
    draws: fromRows(drawRows),
    pension: pensionFromRows(pensionRows),
    meta,
  }
}

// Chargés une seule fois, à la première demande.
let prizesCache = null
let notesCache = null

export async function prizes() {
  prizesCache ??= json('prizes.json')
  return prizesCache
}

export async function notes() {
  notesCache ??= json('notes.json')
  return notesCache
}

// Les étiquettes 추첨기 — 회차 → 1 | 2 | 3. Le fichier existe toujours
// (build.js l'émet), mais il est vide tant que l'import n'a pas tourné.
let hogiCache = null

export async function hogi() {
  hogiCache ??= json('hogi.json')
  return hogiCache
}

// L'ordre de sortie des boules — 회차 → [o1…o6].
let orderCache = null

export async function order() {
  orderCache ??= json('order.json')
  return orderCache
}

/**
 * Le fichier de reprise des 조합 de l'ancienne base.
 *
 * Le seul fichier facultatif du lot : une installation neuve n'a pas
 * d'ancienne base à reprendre, et son absence ne doit rien casser. On rend
 * `null` plutôt que de lever.
 */
export async function combos() {
  try {
    return await json('combos.json')
  } catch {
    return null
  }
}
