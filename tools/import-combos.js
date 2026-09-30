// Les 조합 de l'ancienne base, repris dans les carnets du navigateur.
//
//   node --experimental-sqlite tools/import-combos.js [db.sqlite3] [sortie.json]
//
// Par défaut il écrit dans `web/public/data/combos.json`, que le site charge
// au tout premier lancement pour remplir les carnets. C'est ce qui évite
// d'avoir à importer un fichier à la main : la reprise est faite une fois,
// toute seule, et un témoin dans le navigateur empêche qu'elle recommence.
//
// L'ancien Django gardait deux choses, et deux seulement :
//
//   `combinaison_combinasionmanuelle`  les grilles saisies au 수동조합,
//                                      dans un champ `tabledata` en JSON
//   `combinaison_combinasion`          le **formulaire** du 자동조합 — le
//                                      vivier et les quatorze filtres. Pas
//                                      une seule combinaison : `totalcombinasion`
//                                      vaut « 0 » sur presque toutes les lignes.
//
// Le fichier produit se charge dans les deux onglets : chacun y prend sa
// part et ignore le reste.
//
// Une chose ne peut pas être reprise à l'identique, et il faut la dire.
// L'ancien formulaire câblait les cinq filtres 배수/합성수 **un cran à côté**
// de leur étiquette (`combinaison/views.py` L796–800) : cocher « 합성수 2개 »
// comptait en fait les multiples de 2. Le nouveau site fait ce que dit
// l'étiquette. Une recherche reprise donnera donc les combinaisons que le
// formulaire **annonçait**, pas celles que l'ancien code rendait — sauf si
// aucun de ces cinq filtres n'est coché, auquel cas les deux coïncident.
// Le champ `shifted` de chaque entrée dit lesquelles sont concernées.

import { DatabaseSync } from 'node:sqlite'
import { writeFileSync } from 'node:fs'

import { BUNDLE, BUNDLE_VERSION } from '../src/core/combos.js'
import { NMAX } from '../src/core/draws.js'

const PICK = 6

/** L'étiquette de la liste choisie → la clé du nouveau 리스트추천. */
const PRESET_BY_LABEL = new Map([
  ['모든수', 'all'],
  ['이의배수', 'mult2'],
  ['삼의배수', 'mult3'],
  ['사의배수', 'mult4'],
  ['오의배수', 'mult5'],
  ['합성수', 'composites'],
  // L'ancien menu l'écrivait avec une faute — 함성수 pour 합성수. On accepte
  // les deux, sinon soixante lignes se rangeraient sous « 모든수 » en silence.
  ['함성수', 'composites'],
  ['소수', 'primes'],
])

/** Les cinq cases dont l'étiquette et l'effet ne coïncidaient pas. */
const SHIFTED = ['composites', 'mult2', 'mult3', 'mult4', 'mult5']

/**
 * Une liste Python en texte — `"['1', '2', '4']"` — rendue en nombres.
 *
 * L'ancien stockait la valeur `str()` d'une liste, pas du JSON. On ne
 * l'évalue évidemment pas : on en extrait les entiers, ce qui suffit et ne
 * peut rien exécuter.
 */
export function pyNumbers(text) {
  const out = []
  for (const m of String(text ?? '').matchAll(/-?\d+/g)) out.push(Number(m[0]))
  return out
}

/** Une liste de paires — `"['6 : 0', '1 : 5']"` — rendue en 저 (ou 홀). */
export function pyPairs(text) {
  const out = []
  for (const m of String(text ?? '').matchAll(/(\d+)\s*:\s*(\d+)/g)) {
    const a = Number(m[1])
    const b = Number(m[2])
    // Une paire qui ne totalise pas six ne vient pas de ce formulaire.
    if (a + b === PICK) out.push(a)
  }
  return out
}

export function presetOf(text) {
  const label = String(text ?? '').split('-')[0].trim()
  return PRESET_BY_LABEL.get(label) ?? 'all'
}

/** Les cinq 고정번호, dont la valeur « non choisi » est une phrase. */
export function fixedOf(row) {
  const out = []
  for (const key of ['un', 'deux', 'trois', 'quatre', 'cinq']) {
    const n = Number(row[`fixenumber${key}`])
    if (Number.isInteger(n) && n >= 1 && n <= NMAX && !out.includes(n)) out.push(n)
  }
  return out.sort((a, b) => a - b)
}

const bounded = (text, lo, hi) =>
  pyNumbers(text).filter((n) => n >= lo && n <= hi)

/** Une ligne de `combinaison_combinasion` → une entrée du carnet 자동. */
export function autoEntry(row, id) {
  const form = {
    preset: presetOf(row.listrecommandefroms),
    add: pyNumbers(row.addnumber).filter((n) => n >= 1 && n <= NMAX),
    remove: pyNumbers(row.delnumber).filter((n) => n >= 1 && n <= NMAX),
    // Les 제외구간 sont les clés 1 · 10 · 20 · 30 · 40.
    sections: pyNumbers(row.delsection).filter((n) => [1, 10, 20, 30, 40].includes(n)),
    fix: fixedOf(row),
    sumStart: String(row.start_all_sum ?? '').trim(),
    sumEnd: String(row.end_all_sum ?? '').trim(),
    low: pyPairs(row.lowhighlistfrom),
    odd: pyPairs(row.impairpair),
    ac: bounded(row.acfrom, 0, 10),
    headSum: bounded(row.frontlistfrom, 0, 100),
    tailSum: bounded(row.backlistfrom, 0, 100),
    carry: bounded(row.oldwinnerlistfrom, 0, PICK),
    primes: bounded(row.sosulistfrom, 0, PICK),
    composites: bounded(row.combinaisonlistfrom, 0, PICK),
    mult2: bounded(row.deuxlistfrom, 0, PICK),
    mult3: bounded(row.troislistfrom, 0, PICK),
    mult4: bounded(row.quatrelistfrom, 0, PICK),
    mult5: bounded(row.cinqlistfrom, 0, PICK),
  }

  const filters = [
    form.sumStart && form.sumEnd, form.low.length, form.odd.length, form.ac.length,
    form.headSum.length, form.tailSum.length, form.carry.length,
    form.primes.length, form.composites.length,
    form.mult2.length, form.mult3.length, form.mult4.length, form.mult5.length,
  ].filter(Boolean).length

  return {
    id,
    name: `${row.rang}회 · 옛 검색 ${row.id}`,
    rang: Number(row.rang),
    form,
    filters,
    // Vrai si au moins une des cinq cases décalées est cochée : cette
    // recherche ne rendra pas ce que l'ancien code rendait.
    shifted: SHIFTED.some((k) => form[k].length > 0),
    owner: row.owner_id,
    savedAt: isoOf(row.create_date),
    from: 'combinaison_combinasion',
  }
}

/**
 * Une ligne de `combinaison_combinasionmanuelle` → une entrée du carnet 수동.
 *
 * `tabledata` porte une ligne par grille, avec ses indicateurs. Seuls les
 * six numéros sont repris : tout le reste se recalcule, et un chiffre
 * recopié est un chiffre qui peut mentir.
 */
export function manualEntry(row, id) {
  let rows = []
  try {
    rows = JSON.parse(row.tabledata ?? '[]')
  } catch {
    rows = []
  }

  const grids = []
  let dropped = 0
  for (const line of Array.isArray(rows) ? rows : []) {
    const numbers = ['일', '이', '삼', '사', '오', '육'].map((k) => Number(line[k]))
    const ok = numbers.length === PICK
      && numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= NMAX)
      && new Set(numbers).size === PICK
    if (ok) grids.push([...numbers].sort((a, b) => a - b))
    else dropped++
  }

  return {
    id,
    name: `${row.rang}회 · 옛 조합 ${row.id}`,
    rang: Number(row.rang),
    // L'ancien n'avait qu'un écran qui enregistrait : le 수동조합.
    source: 'manual',
    grids,
    pool: [],
    preset: presetOf(row.listrecommandefroms),
    // Les lignes écartées. Sur cette base il y en a exactement une par
    // enregistrement, et c'est toujours la même : la ligne vide que
    // l'ancien formulaire gardait en bas du tableau et sauvegardait avec
    // le reste. Rien de saisi n'est perdu — mais on compte plutôt que de
    // se taire, parce qu'une autre base pourrait en cacher de vraies.
    dropped,
    savedAt: isoOf(row.create_date),
    from: 'combinaison_combinasionmanuelle',
  }
}

function isoOf(text) {
  const date = new Date(String(text ?? '').replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

/** Lit l'ancienne base et rend le fichier des deux carnets. */
export function convert(path) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const autos = db.prepare(
      'SELECT * FROM combinaison_combinasion ORDER BY id').all()
    const manuals = db.prepare(
      'SELECT * FROM combinaison_combinasionmanuelle ORDER BY id').all()

    return {
      kind: BUNDLE,
      version: BUNDLE_VERSION,
      // Le plus récent en tête : c'est l'ordre des carnets.
      auto: autos.map((r, k) => autoEntry(r, k + 1)).reverse(),
      manual: manuals.map((r, k) => manualEntry(r, k + 1)).reverse(),
    }
  } finally {
    db.close()
  }
}

/** Ce qu'il y a à dire sur ce qu'on vient de convertir. */
export function report(bundle) {
  const grids = bundle.manual.reduce((a, e) => a + e.grids.length, 0)
  const dropped = bundle.manual.reduce((a, e) => a + e.dropped, 0)
  const owners = new Map()
  for (const e of bundle.auto) owners.set(e.owner, (owners.get(e.owner) ?? 0) + 1)

  return {
    자동: bundle.auto.length,
    자동_소유자별: Object.fromEntries(owners),
    자동_배수필터_있음: bundle.auto.filter((e) => e.shifted).length,
    수동: bundle.manual.length,
    수동_조합: grids,
    수동_버린_줄: dropped,
  }
}

function main() {
  const path = process.argv[2] ?? 'db.sqlite3'
  const out = process.argv[3] ?? 'web/public/data/combos.json'
  const bundle = convert(path)
  writeFileSync(out, JSON.stringify(bundle, null, 1))
  console.log(out)
  for (const [key, value] of Object.entries(report(bundle))) {
    console.log(` ${key} :`, typeof value === 'object' ? JSON.stringify(value) : value)
  }
}

if (process.argv[1]?.endsWith('import-combos.js')) main()
