// Les carnets 조합, et la reprise de l'ancienne base.
//
// Deux choses à prouver, de nature différente.
//
// La première est la **conversion** : les vingt-quatre champs de l'ancien
// formulaire doivent retomber sur les dix-neuf du nouveau, sans qu'un
// filtre glisse d'une case. C'est mécanique, et ça se vérifie sur des
// lignes construites à la main, dont on connaît la réponse.
//
// La seconde est le **carnet** lui-même : il vit dans `localStorage`, qui
// n'existe pas ici. On en pose un faux, ce qui suffit — la logique est dans
// le module, pas dans le navigateur — et on vérifie surtout ce qui casse
// pour de vrai : un fichier du mauvais genre, un stockage qui refuse
// d'écrire, et deux imports de suite qui ne doivent pas s'effacer.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

import {
  autoEntry, convert, fixedOf, manualEntry, presetOf, pyNumbers, pyPairs, report,
} from '../tools/import-combos.js'
import {
  AUTO_FIELDS, AUTO_KIND, BUNDLE, GRID_SOURCES, MANUAL_KIND, carnet, emptyForm,
  PENSION_GRIDS_KIND, PENSION_RANKS, expectedHits, pensionExpected, rankOf,
  scoreGrid, scoreTicket, sourceLabel, sourceOf, tailMatch,
} from '../src/core/combos.js'
import { describeTicket } from '../src/core/pension.js'
import { PRESETS, buildPool } from '../src/core/criteria.js'
import { LOTTO_RULES, PENSION_RULES } from '../src/core/rules.js'

const LEGACY = process.env.LEGACY_DB ?? '/root/core/db.sqlite3'
const noLegacy = !existsSync(LEGACY) && 'ancienne base absente'

// ─────────────────────────────────────────────────────── la lecture du vieux

test('une liste Python en texte se lit sans être évaluée', () => {
  assert.deepEqual(pyNumbers("['1', '2', '4', '5']"), [1, 2, 4, 5])
  assert.deepEqual(pyNumbers('[]'), [])
  assert.deepEqual(pyNumbers(null), [])
  // Ce champ est du texte libre venu d'une base qu'on ne contrôle plus.
  // Il ne doit jamais rien exécuter — on n'en extrait que des entiers.
  assert.deepEqual(pyNumbers("['1', __import__('os').system('rm -rf /')]"), [1])
})

test('les paires « n : m » redonnent le premier terme', () => {
  assert.deepEqual(pyPairs("['6 : 0', '1 : 5']"), [6, 1])
  assert.deepEqual(pyPairs("['4 : 2']"), [4])
  // Une paire qui ne totalise pas six ne vient pas de ce formulaire.
  assert.deepEqual(pyPairs("['3 : 9']"), [])
})

test('chaque étiquette de liste retrouve son 리스트추천 — faute comprise', () => {
  assert.equal(presetOf('삼의배수 - 3,6,9'), 'mult3')
  assert.equal(presetOf('모든수 - 1,2,3'), 'all')
  assert.equal(presetOf('소수 - 2,3,5'), 'primes')
  assert.equal(presetOf('합성수 - 4,6,8'), 'composites')
  // L'ancien menu écrivait 함성수. Sans cette ligne, ces recherches
  // repartiraient sur « 모든수 » — un vivier de 45 au lieu de 24, en silence.
  assert.equal(presetOf('함성수 - 4,6,8'), 'composites')
  assert.equal(presetOf('inconnu - 1'), 'all')
  // Toutes les clés rendues existent bien dans le nouveau formulaire.
  for (const label of ['모든수', '이의배수', '소수', '합성수']) {
    const key = presetOf(`${label} - 1`)
    assert.ok(PRESETS.some((p) => p.key === key), label)
  }
})

test('les 고정번호 non choisis sont une phrase, pas un vide', () => {
  const row = {
    fixenumberun: '2', fixenumberdeux: '고정번호 선택하기',
    fixenumbertrois: '고정번호 선택하기', fixenumberquatre: '45',
    fixenumbercinq: '2',
  }
  // 45 est gardé, la phrase ignorée, et le 2 en double ne compte qu'une fois.
  assert.deepEqual(fixedOf(row), [2, 45])
  assert.deepEqual(fixedOf({ fixenumberun: '0', fixenumberdeux: '46' }), [])
})

// ──────────────────────────────────────────── les vingt-quatre champs → dix-neuf

const LEGACY_ROW = {
  id: 7, rang: '1088', owner_id: 1,
  create_date: '2024-01-16 15:45:34.240054',
  listrecommandefroms: '삼의배수 - 3,6,9,12,15,18,21,24,27,30,33,36,39,42,45',
  addnumber: "['1', '2']", delnumber: "['3']", delsection: "['30', '40']",
  start_all_sum: '100', end_all_sum: '180',
  fixenumberun: '6', fixenumberdeux: '고정번호 선택하기',
  fixenumbertrois: '고정번호 선택하기', fixenumberquatre: '고정번호 선택하기',
  fixenumbercinq: '고정번호 선택하기',
  impairpair: "['4 : 2']", lowhighlistfrom: "['3 : 3']",
  acfrom: "['8', '9']", frontlistfrom: "['12']", backlistfrom: "['25']",
  oldwinnerlistfrom: "['1']",
  sosulistfrom: "['2']", combinaisonlistfrom: "['3']",
  deuxlistfrom: "['4']", troislistfrom: "['5']",
  quatrelistfrom: "['1']", cinqlistfrom: "['0']",
}

test('une recherche de l\'ancienne base retombe sur le bon champ', () => {
  const entry = autoEntry(LEGACY_ROW, 1)
  const f = entry.form

  assert.equal(entry.rang, 1088)
  assert.equal(f.preset, 'mult3')
  assert.deepEqual(f.add, [1, 2])
  assert.deepEqual(f.remove, [3])
  assert.deepEqual(f.sections, [30, 40])
  assert.deepEqual(f.fix, [6])
  assert.equal(f.sumStart, '100')
  assert.equal(f.sumEnd, '180')
  assert.deepEqual(f.odd, [4])        // impairpair → 홀짝
  assert.deepEqual(f.low, [3])        // lowhighlistfrom → 저고
  assert.deepEqual(f.ac, [8, 9])
  assert.deepEqual(f.headSum, [12])   // frontlistfrom → 앞자리수합
  assert.deepEqual(f.tailSum, [25])   // backlistfrom → 끝자리수합
  assert.deepEqual(f.carry, [1])      // oldwinnerlistfrom → 전회차이월번호수

  // Les six comptages, dans l'ordre exact du formulaire d'origine —
  // c'est là qu'un décalage passerait inaperçu, alors on les épingle un
  // par un contre les noms de colonnes de la base.
  assert.deepEqual(f.primes, [2])     // sosulistfrom      → 소수 당첨수
  assert.deepEqual(f.composites, [3]) // combinaisonlistfrom → 합성수 당첨수
  assert.deepEqual(f.mult2, [4])      // deuxlistfrom      → 이의배수 당첨수
  assert.deepEqual(f.mult3, [5])      // troislistfrom     → 삼의배수 당첨수
  assert.deepEqual(f.mult4, [1])      // quatrelistfrom    → 사의배수 당첨수
  assert.deepEqual(f.mult5, [0])      // cinqlistfrom      → 오의배수 당첨수

  // Le formulaire converti a exactement les champs du formulaire vivant.
  assert.deepEqual(Object.keys(f).sort(), AUTO_FIELDS.slice().sort())
  assert.deepEqual(Object.keys(f).sort(), Object.keys(emptyForm()).sort())

  // Une case décalée est cochée : la recherche ne rendra pas ce que
  // l'ancien code rendait, et l'entrée doit le dire.
  assert.equal(entry.shifted, true)
  assert.equal(autoEntry({ ...LEGACY_ROW,
    combinaisonlistfrom: '[]', deuxlistfrom: '[]', troislistfrom: '[]',
    quatrelistfrom: '[]', cinqlistfrom: '[]' }, 1).shifted, false)
})

test('le vivier converti se construit sans lever', () => {
  const f = autoEntry(LEGACY_ROW, 1).form
  const pool = buildPool({ preset: f.preset, add: f.add, remove: f.remove,
                           sections: f.sections })
  // 삼의배수 moins les dizaines 30 et 40, plus 1 et 2, moins 3.
  assert.deepEqual(pool, [1, 2, 6, 9, 12, 15, 18, 21, 24, 27])
})

test('une saisie 수동 ne garde que les six numéros, et jette la ligne vide', () => {
  const row = {
    id: 51, rang: '1084', create_date: '2024-01-18 05:38:45.355687',
    listrecommandefroms: '삼의배수 - 3,6,9',
    tabledata: JSON.stringify([
      { 회차: '1084', 일: '3', 이: '9', 삼: '12', 사: '6', 오: '21', 육: '15',
        'AC값': '7', 저고: '4:2' },
      // La ligne vide que l'ancien formulaire gardait toujours en bas.
      { 회차: '1084', 일: '', 이: '', 삼: '', 사: '', 오: '', 육: '' },
      // Un doublon : six cases remplies, mais cinq numéros distincts.
      { 회차: '1084', 일: '3', 이: '3', 삼: '12', 사: '6', 오: '21', 육: '15' },
    ]),
  }
  const entry = manualEntry(row, 1)
  // Rangés, et sans les indicateurs recopiés : tout se recalcule.
  assert.deepEqual(entry.grids, [[3, 6, 9, 12, 15, 21]])
  assert.equal(entry.dropped, 2)
  assert.equal(entry.rang, 1084)

  // Un `tabledata` illisible ne fait pas tomber la conversion.
  assert.deepEqual(manualEntry({ id: 1, rang: '1', tabledata: '{{{' }, 1).grids, [])
})

// ───────────────────────────────────────────────── sur la vraie ancienne base

test('les 257 lignes de l\'ancienne base se convertissent', { skip: noLegacy }, () => {
  const bundle = convert(LEGACY)
  const r = report(bundle)

  assert.equal(bundle.kind, BUNDLE)
  assert.equal(r.자동, 248)
  assert.equal(r.수동, 9)
  assert.equal(r.수동_조합, 88)

  // Exactement une ligne écartée par enregistrement : la ligne vide du bas.
  // Si ce chiffre bouge, c'est qu'on jette autre chose, et il faut regarder.
  assert.equal(r.수동_버린_줄, bundle.manual.length)
  for (const e of bundle.manual) assert.equal(e.dropped, 1, `${e.rang}회`)

  // Aucune grille invalide n'a survécu au tri.
  for (const e of bundle.manual) {
    for (const grid of e.grids) {
      assert.equal(grid.length, 6)
      assert.equal(new Set(grid).size, 6)
      for (const n of grid) assert.ok(n >= 1 && n <= 45)
      assert.deepEqual(grid, [...grid].sort((a, b) => a - b))
    }
  }

  // Chaque recherche a un formulaire complet et un vivier constructible.
  for (const e of bundle.auto) {
    assert.deepEqual(Object.keys(e.form).sort(), AUTO_FIELDS.slice().sort(), e.name)
    assert.ok(buildPool({ preset: e.form.preset, add: e.form.add,
                          remove: e.form.remove, sections: e.form.sections }).length >= 0)
  }

  // Le décalage 배수 ne touche qu'une poignée de recherches : les autres
  // rendront exactement ce que l'ancien site rendait.
  assert.ok(r.자동_배수필터_있음 < bundle.auto.length / 2)
})

// ────────────────────────────────────────────────────────────── les carnets

/** Un `localStorage` de laboratoire — le vrai n'existe pas sous Node. */
function fakeStorage({ refuse = false } = {}) {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (refuse) throw new Error('QuotaExceededError')
      map.set(k, String(v))
    },
    removeItem: (k) => { map.delete(k) },
  }
}

/**
 * Les deux carnets du site, montés sur un stockage de laboratoire.
 *
 * Les clés et les genres sont ceux de `web/src/lib/store.js` — ce fichier-là
 * ne fait plus que les brancher sur `localStorage`, et un test qui l'importe
 * exigerait un navigateur pour rien.
 */
const carnets = (storage) => ({
  manual: carnet({ key: 'lotto.manual.v1', kind: MANUAL_KIND, slot: 'manual',
                   storage: () => storage }),
  auto: carnet({ key: 'lotto.auto.v1', kind: AUTO_KIND, slot: 'auto',
                 storage: () => storage }),
})

const withStorage = (storage, work) => work(carnets(storage))

test('les deux carnets ne se mélangent pas', () => {
  withStorage(fakeStorage(), ({ auto, manual }) => {
    assert.notEqual(auto.key, manual.key)

    manual.save({ name: '내 조합', rang: 1238, grids: [[1, 2, 3, 4, 5, 6]], pool: [] })
    auto.save({ name: '내 검색', rang: 1239, form: emptyForm(), filters: 0 })

    assert.equal(manual.load().length, 1)
    assert.equal(auto.load().length, 1)
    assert.equal(manual.load()[0].name, '내 조합')
    assert.equal(auto.load()[0].name, '내 검색')

    // Un export du 수동 chargé dans le 자동 doit être refusé : sans quoi on
    // remplirait le carnet des recherches de grilles sans formulaire.
    assert.throws(() => auto.fromFile(manual.toFile()), /저장 파일이 아닙니다/)
    assert.throws(() => manual.fromFile(auto.toFile()), /저장 파일이 아닙니다/)
  })
})

test('le fichier d\'ensemble se charge des deux côtés', () => {
  const bundle = JSON.stringify({
    kind: BUNDLE, version: 1,
    manual: [{ id: 1, name: 'a', rang: 1000, grids: [[1, 2, 3, 4, 5, 6]] }],
    auto: [{ id: 1, name: 'b', rang: 1001, form: emptyForm() },
           { id: 2, name: 'c', rang: 1002, form: emptyForm() }],
  })

  withStorage(fakeStorage(), ({ auto, manual }) => {
    assert.equal(manual.fromFile(bundle), 1)
    assert.equal(auto.fromFile(bundle), 2)
    assert.equal(manual.load()[0].name, 'a')

    // Importer deux fois ajoute, n'efface pas — et les identifiants restent
    // distincts, sinon la suppression d'un enregistrement en emporterait deux.
    assert.equal(auto.fromFile(bundle), 2)
    const ids = auto.load().map((e) => e.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.equal(auto.load().length, 4)

    // Et la suppression ne prend bien qu'une ligne.
    auto.remove(ids[0])
    assert.equal(auto.load().length, 3)
  })
})

test('un stockage qui refuse d\'écrire ne fait pas tomber la page', () => {
  withStorage(fakeStorage({ refuse: true }), ({ auto }) => {
    assert.equal(auto.available(), false)
    // `save` rend null — l'écran affiche un avertissement, il ne plante pas.
    assert.equal(auto.save({ name: 'x', rang: 1, form: emptyForm() }), null)
    assert.deepEqual(auto.load(), [])
    assert.throws(() => auto.fromFile(JSON.stringify({
      kind: BUNDLE, version: 1, auto: [{ id: 1, name: 'y', rang: 1 }],
    })), /거부/)
  })
})

test('le vrai fichier de reprise se charge dans les carnets', { skip: noLegacy }, () => {
  const text = JSON.stringify(convert(LEGACY))
  withStorage(fakeStorage(), ({ auto, manual }) => {
    assert.equal(auto.fromFile(text), 248)
    assert.equal(manual.fromFile(text), 9)
    // Le plus récent en tête, comme dans le carnet.
    assert.equal(auto.load()[0].rang, 1088)
    assert.ok(manual.load()[0].grids.length > 0)
  })
})

// ──────────────────────────────────────────── ce qu'une grille a fait

test('le rang d\'une grille suit les règles du jeu', () => {
  assert.equal(rankOf(6), 1)
  assert.equal(rankOf(5, true), 2)
  assert.equal(rankOf(5, false), 3)
  assert.equal(rankOf(4), 4)
  assert.equal(rankOf(4, true), 4)   // le bonus ne compte qu'au 2등
  assert.equal(rankOf(3), 5)
  assert.equal(rankOf(2), null)
  assert.equal(rankOf(0), null)
})

test('une grille se note contre le tirage complet', () => {
  // Six numéros puis le bonus, comme `sequenceAt` les rend.
  const draw = [1, 2, 3, 4, 5, 6, 7]

  assert.deepEqual(scoreGrid([1, 2, 3, 4, 5, 6], draw),
    { hits: [1, 2, 3, 4, 5, 6], matched: 6, bonus: false, rank: 1 })

  const second = scoreGrid([1, 2, 3, 4, 5, 7], draw)
  assert.equal(second.matched, 5)
  assert.equal(second.bonus, true)
  assert.equal(second.rank, 2)

  // Cinq numéros sans le bonus : 3등, pas 2등.
  assert.equal(scoreGrid([1, 2, 3, 4, 5, 9], draw).rank, 3)
  assert.equal(scoreGrid([1, 2, 3, 40, 41, 42], draw).rank, 5)
  assert.equal(scoreGrid([1, 2, 40, 41, 42, 43], draw).rank, null)

  // Un 회차 pas encore tiré n'a pas de note — et surtout pas un zéro, qui
  // se confondrait avec « aucun numéro trouvé ».
  assert.equal(scoreGrid([1, 2, 3, 4, 5, 6], null), null)
})

test('la distribution attendue est celle du hasard, et elle somme à un', () => {
  const p = expectedHits()
  assert.equal(p.length, 7)
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-12)

  // Le vrai contrôle : cette distribution doit redonner les cotes publiées
  // que porte `rules.js`, qui les tient de 동행복권. Deux fichiers écrits
  // séparément, un seul jeu de chiffres — si l'un dérive, ceci tombe.
  const odds = Object.fromEntries(
    LOTTO_RULES.ranks.map((r) => [r.label, r.odds]))

  assert.ok(Math.abs(1 / p[6] - odds['1등']) < 1e-6, `1등 : 1/${1 / p[6]}`)
  assert.ok(Math.abs(1 / p[4] - odds['4등']) < 1, `4등 : 1/${1 / p[4]}`)
  assert.ok(Math.abs(1 / p[3] - odds['5등']) < 1, `5등 : 1/${1 / p[3]}`)

  // Cinq numéros se partagent entre le 2등 (avec le bonus) et le 3등 :
  // les deux cotes doivent se rassembler exactement sur la case 5.
  const five = 1 / odds['2등'] + 1 / odds['3등']
  assert.ok(Math.abs(p[5] - five) / five < 1e-4, `${p[5]} vs ${five}`)
  // La distribution décroît : c'est ce qui rend l'histogramme lisible.
  for (let k = 1; k < 6; k++) assert.ok(p[k] > p[k + 1], `${k}`)
})

test('les grilles reprises portent leur provenance', { skip: noLegacy }, () => {
  const bundle = convert(LEGACY)
  for (const e of bundle.manual) assert.equal(sourceOf(e), 'manual')
  // Une entrée d'avant ce champ reste du 수동 : c'était le seul écran qui
  // savait enregistrer, et une grille ne doit pas changer de section.
  assert.equal(sourceOf({ grids: [] }), 'manual')
  assert.equal(sourceOf({ source: 'auto' }), 'auto')
  assert.equal(sourceLabel('general'), '일반조합')
  assert.deepEqual(GRID_SOURCES.map((s) => s.key), ['general', 'auto', 'manual'])
})

test('la reprise ne se fait qu\'une fois', () => {
  const storage = fakeStorage()
  const bundle = {
    kind: BUNDLE, version: 1,
    manual: [{ id: 1, name: 'a', rang: 1000, grids: [[1, 2, 3, 4, 5, 6]] }],
    auto: [{ id: 1, name: 'b', rang: 1001, form: emptyForm() }],
  }
  const { manual, auto } = carnets(storage)
  const SEED = 'lotto.seed.v1'

  // Ce que fait `seed` dans le navigateur, reproduit ici : semer, poser le
  // témoin, et ne jamais recommencer — sinon une entrée supprimée
  // reviendrait au rechargement suivant.
  const sow = () => {
    if (storage.getItem(SEED) !== null) return null
    const text = JSON.stringify(bundle)
    const out = { grids: manual.fromFile(text), auto: auto.fromFile(text) }
    storage.setItem(SEED, 'fait')
    return out
  }

  assert.deepEqual(sow(), { grids: 1, auto: 1 })
  assert.equal(sow(), null)
  assert.equal(manual.load().length, 1)

  // Et une suppression tient : le témoin est déjà posé.
  manual.remove(manual.load()[0].id)
  assert.equal(sow(), null)
  assert.equal(manual.load().length, 0)
})

// ────────────────────────────────────────── 연금복권 : le rang d'un billet

test('les huit rangs du 연금복권 se lisent sur la queue du numéro', () => {
  const draw = { group: 4, digits: [1, 2, 5, 9, 0, 5], bonus: [4, 9, 3, 8, 0, 0] }
  const at = (group, digits) => scoreTicket({ group, digits }, draw)?.rank?.label ?? '꽝'

  assert.equal(at(4, [1, 2, 5, 9, 0, 5]), '1등')   // 조 + les six chiffres
  assert.equal(at(2, [1, 2, 5, 9, 0, 5]), '2등')   // les six, un autre 조
  assert.equal(at(1, [4, 9, 3, 8, 0, 0]), '보너스') // le tirage bonus, 조 ignoré
  assert.equal(at(1, [7, 2, 5, 9, 0, 5]), '3등')   // les cinq derniers
  assert.equal(at(1, [7, 7, 5, 9, 0, 5]), '4등')
  assert.equal(at(1, [7, 7, 7, 9, 0, 5]), '5등')
  assert.equal(at(1, [7, 7, 7, 7, 0, 5]), '6등')
  assert.equal(at(1, [7, 7, 7, 7, 7, 5]), '7등')
  assert.equal(at(1, [7, 7, 7, 7, 7, 7]), '꽝')

  // La tête ne compte pour rien en dessous du 2등 : seule la queue décide.
  // Attention au piège : le 회차 a un 9 en quatrième position, donc un
  // billet en …9 0 5 fait trois chiffres de queue, pas deux.
  assert.equal(at(3, [9, 9, 9, 9, 0, 5]), '5등')
  assert.equal(tailMatch([9, 9, 9, 9, 0, 5], draw.digits), 3)
  assert.equal(at(3, [9, 9, 9, 8, 0, 5]), '6등')
  assert.equal(tailMatch([9, 9, 9, 8, 0, 5], draw.digits), 2)

  // Un 회차 pas encore tiré ne donne pas de note — et surtout pas « 꽝 ».
  assert.equal(scoreTicket({ group: 1, digits: [0, 0, 0, 0, 0, 0] }, null), null)
})

test('le 보너스 passe avant le 3등 — on gagne le meilleur lot', () => {
  // Un billet qui coïncide avec tout le tirage bonus **et** avec la queue du
  // 당첨번호. Le bonus vaut 1,2억 en rente, le 3등 cent mille wons : c'est le
  // bonus qu'on garde.
  const draw = { group: 1, digits: [7, 7, 4, 5, 6, 7], bonus: [1, 2, 3, 4, 5, 6] }
  const s = scoreTicket({ group: 2, digits: [1, 2, 3, 4, 5, 6] }, draw)
  assert.equal(s.rank.label, '보너스')
  assert.ok(s.bonus)
})

test('les cotes du 연금복권 se recalculent, et redonnent celles publiées', () => {
  const p = pensionExpected()
  const odds = Object.fromEntries(PENSION_RULES.ranks.map((r) => [r.label, r.odds]))

  // Les rangs de queue : un chiffre vaut 1/10, et s'arrêter **exactement**
  // là demande que le suivant tombe à côté — d'où le 9/10.
  const tail = { 7: 1, 6: 2, 5: 3, 4: 4, 3: 5 }
  for (const [rank, k] of Object.entries(tail)) {
    const computed = 9 / 10 ** (k + 1)
    // Les cotes publiées sont arrondies — 1/111 111 pour 1/111 111,11 — donc
    // la comparaison se fait sur l'entier, comme le fait 동행복권.
    assert.equal(Math.round(1 / p[rank]), Math.round(1 / computed), `${rank}등`)
    assert.equal(Math.round(1 / computed), odds[`${rank}등`], `${rank}등`)
  }

  // Le haut du tableau : six chiffres font 1/10⁶, et le 조 partage ce
  // million en cinq — un cinquième pour le 1등, quatre pour le 2등.
  assert.ok(Math.abs(p['1'] - 1 / 5e6) < 1e-15)
  assert.ok(Math.abs(p['2'] - 4 / 5e6) < 1e-15)
  assert.ok(Math.abs(p.B - 1 / 1e6) < 1e-15)
  assert.equal(1 / p['1'], odds['1등'])
  assert.equal(1 / p.B, odds['보너스'])

  // Et chaque rang du tableau porte bien un lot.
  for (const r of PENSION_RANKS) assert.ok(r.prize > 0, r.label)
})

test('les carnets du 연금복권 ne se mélangent pas avec ceux du 로또', () => {
  const storage = fakeStorage()
  const lotto = carnet({ key: 'lotto.manual.v1', kind: MANUAL_KIND, slot: 'manual',
                         storage: () => storage })
  const pension = carnet({ key: 'pension.grids.v1', kind: PENSION_GRIDS_KIND,
                           slot: 'pensionGrids', storage: () => storage })

  assert.notEqual(lotto.key, pension.key)
  lotto.save({ name: '내 조합', rang: 1238, grids: [[1, 2, 3, 4, 5, 6]] })
  pension.save({ name: '내 표', rang: 331, source: 'manual',
                 tickets: [{ group: 3, digits: [1, 2, 3, 4, 5, 6] }] })

  assert.equal(lotto.load().length, 1)
  assert.equal(pension.load().length, 1)
  // Un billet chargé dans le carnet du 6/45 n'aurait aucun sens — le genre
  // du fichier l'interdit.
  assert.throws(() => lotto.fromFile(pension.toFile()), /저장 파일이 아닙니다/)
  assert.throws(() => pension.fromFile(lotto.toFile()), /저장 파일이 아닙니다/)
})

test('la fiche d\'un billet dit ce que le site affiche', () => {
  // Le 330회 : 조 4, 1 2 5 9 0 5 — les chiffres lus sur la page 분석.
  const t = describeTicket([1, 2, 5, 9, 0, 5], { group: 4, reference: [2, 5, 5] })
  assert.equal(t.total, 22)
  assert.equal(t.ac, 4)
  assert.equal(t.lowLabel, '3 : 3')
  assert.equal(t.oddLabel, '4 : 2')
  assert.equal(t.distinct, 5)
  assert.equal(t.repeats, 2)          // le 5, deux fois
  assert.deepEqual(t.carried, [2, 5, 5])
  // 0 est écarté des 배수 mais compté dans 짝수 — l'asymétrie du produit.
  assert.deepEqual(t.multiples[2], [2])
  assert.equal(t.even, 2)

  assert.throws(() => describeTicket([1, 2, 3]), /숫자 6개/)
  assert.throws(() => describeTicket([1, 2, 3, 4, 5, 10]), /범위 밖/)
})
