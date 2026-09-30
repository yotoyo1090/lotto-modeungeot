// Le serveur MCP.
//
// Deux choses à prouver, et elles ne sont pas de même nature.
//
// La première est la sécurité : le serveur ouvre la base en lecture seule et
// `sql` refuse tout ce qui n'est pas une lecture. Un assistant se trompe ;
// il ne doit pas pouvoir abîmer les données en se trompant. C'est la partie
// qu'il faut attaquer, pas seulement vérifier.
//
// La seconde est la cohérence : ce que le serveur répond doit être ce que le
// site affiche, parce que les deux appellent le même noyau. Un test qui
// compare les deux sorties attrape le jour où quelqu'un recopie un calcul.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

import { TOOLS, call, handle } from '../src/mcp/server.js'
import { fromRows } from '../src/core/draws.js'
import * as analysis from '../src/core/analysis.js'
import * as metrics from '../src/core/metrics.js'
import { getDraws, open } from '../src/node/db.js'

const PATH = process.env.LOTTO_DB ?? 'data/lotto.sqlite'
const skip = !existsSync(PATH) && 'data/lotto.sqlite absent'

const withDb = (work) => {
  const db = open(PATH, { readOnly: true })
  try { return work(db) } finally { db.close() }
}

const parse = (text) => JSON.parse(text)

// ------------------------------------------------------------- protocole

test('la poignée de main annonce le serveur et ses capacités', () => {
  const reply = handle(null, { jsonrpc: '2.0', id: 1, method: 'initialize' })
  assert.equal(reply.result.serverInfo.name, 'lotto')
  assert.ok(reply.result.capabilities.tools)
  assert.match(reply.result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/)
})

test('une notification ne reçoit pas de réponse', () => {
  // `notifications/initialized` n'a pas d'identifiant : y répondre romprait
  // le protocole côté client.
  assert.equal(handle(null, { jsonrpc: '2.0', method: 'notifications/initialized' }), null)
})

test('une méthode inconnue rend une erreur de protocole', () => {
  const reply = handle(null, { jsonrpc: '2.0', id: 2, method: 'inventé' })
  assert.equal(reply.error.code, -32601)
})

test('chaque outil déclare un schéma utilisable', () => {
  assert.deepEqual(TOOLS.map((t) => t.name), [
    // Les données, puis les écrans du site — dans l'ordre du menu.
    'status', 'draw', 'analysis', 'generate', 'sql',
    'board', 'list', 'section', 'filter', 'hotcold', 'hl',
    'table', 'pattern', 'excluded', 'pension', 'machine', 'order', 'watch',
  ])
  for (const tool of TOOLS) {
    assert.ok(tool.description.length > 30, `${tool.name} : description trop courte`)
    assert.equal(tool.inputSchema.type, 'object', tool.name)
    for (const required of tool.inputSchema.required ?? []) {
      assert.ok(tool.inputSchema.properties[required],
        `${tool.name} : ${required} est requis mais non décrit`)
    }
  }
})

test('une erreur d\'outil revient dans le résultat, pas en erreur de protocole',
  { skip }, () => {
    // L'assistant doit pouvoir lire ce qui n'allait pas et recommencer.
    // Une erreur JSON-RPC, elle, ne lui dit rien d'exploitable.
    withDb((db) => {
      const reply = handle(db, {
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: 'analysis', arguments: { kind: 'flow' } },
      })
      assert.equal(reply.error, undefined)
      assert.equal(reply.result.isError, true)
      assert.match(reply.result.content[0].text, /number/)
    })
  })

// --------------------------------------------------------------- lecture

test('la base est ouverte en lecture seule', { skip }, () => {
  const db = open(PATH, { readOnly: true })
  assert.throws(() => db.exec('DELETE FROM draws'), /readonly|read-only/i)
  assert.throws(() => db.exec('CREATE TABLE essai (a INT)'), /readonly|read-only/i)
  db.close()
})

test('`sql` refuse tout ce qui n\'est pas une lecture', { skip }, () => {
  withDb((db) => {
    const attacks = [
      'DELETE FROM draws',
      'DROP TABLE draws',
      'UPDATE draws SET bonus = 1',
      'INSERT INTO draws VALUES (1)',
      'ATTACH DATABASE \'/tmp/x.db\' AS x',
      'PRAGMA journal_mode = DELETE',
      'VACUUM',
      'SELECT 1; DROP TABLE draws',
      'WITH x AS (SELECT 1) DELETE FROM draws',
      '  select 1; delete from draws  ',
    ]
    for (const query of attacks) {
      const text = call(db, 'sql', { query })
      assert.ok(!text.startsWith('{'), `passé : ${query}`)
      assert.match(text, /읽기 전용|SELECT|한 번에/, query)
    }
  })
})

test('`sql` lit vraiment, et tronque poliment', { skip }, () => {
  withDb((db) => {
    const one = parse(call(db, 'sql', { query: 'SELECT COUNT(*) AS n FROM draws' }))
    assert.ok(one.결과[0].n > 1000)

    // Les vues du schéma sont là pour ça : compter sans écrire de jointure.
    const seven = parse(call(db, 'sql', {
      query: 'SELECT COUNT(*) AS n FROM draw_numbers WHERE number = 7 AND position <= 6',
    }))
    assert.ok(seven.결과[0].n > 100)

    const capped = parse(call(db, 'sql', {
      query: 'SELECT rang FROM draws ORDER BY rang', limit: 5,
    }))
    assert.equal(capped.표시, 5)
    assert.ok(capped.행수 > 5)
    assert.match(capped.안내, /생략/)
  })
})

// ------------------------------------------------------------- cohérence

test('le serveur rend les mêmes chiffres que le noyau', { skip }, () => {
  withDb((db) => {
    const draws = fromRows(getDraws(db))
    const m = metrics.compute(draws)
    const i = draws.n - 1

    const drawn = parse(call(db, 'draw', {}))
    assert.equal(drawn.회차, draws.rangs[i])
    assert.deepEqual(drawn.당첨번호, [...draws.numbersAt(i)])
    assert.equal(drawn.보너스, draws.bonus[i])
    assert.equal(drawn.총합, m.total[i])
    assert.equal(drawn['AC값'], m.ac[i])
    assert.equal(drawn.저고, m.lowHigh(i))
    assert.equal(drawn.홀짝, m.oddEven(i))

    const flow = parse(call(db, 'analysis', { kind: 'flow', number: 7 }))
    const reference = analysis.flowSummary(draws, 7)
    assert.equal(flow.출현, reference.hits)
    assert.equal(flow.현재흐름, reference.currentGap)
    assert.equal(flow.평균간격, reference.gapMean)

    const frequency = parse(call(db, 'analysis', { kind: 'frequency' }))
    const counts = analysis.frequency(draws)
    for (const row of frequency.번호별) {
      assert.equal(row.출현, counts[row.번호], `번호 ${row.번호}`)
    }
  })
})

test('les analyses portent leur point de comparaison', { skip }, () => {
  withDb((db) => {
    // C'est la règle du projet : un chiffre sans son attendu ressemble à un
    // signal. Le serveur ne doit jamais en rendre un tout seul.
    const frequency = parse(call(db, 'analysis', { kind: 'frequency' }))
    assert.ok(frequency.기대값 > 0)
    assert.ok('차이' in frequency.번호별[0])

    const companions = parse(call(db, 'analysis', { kind: 'companions', number: 7 }))
    assert.ok(companions.기대값 > 0)

    const winners = parse(call(db, 'analysis', { kind: 'winners' }))
    for (const row of winners.구간별) assert.ok(row.기대, row.구간)
    assert.match(winners.주의, /기대/)

    const flow = parse(call(db, 'analysis', { kind: 'flow', number: 7 }))
    assert.ok(flow.이론간격 > 0)
  })
})

test('la fenêtre de 회차 restreint bien l\'analyse', { skip }, () => {
  withDb((db) => {
    const window = parse(call(db, 'analysis',
      { kind: 'frequency', start: 1000, end: 1100 }))
    assert.equal(window.회차수, 101)
    assert.equal(window.기준, '1000–1100회')

    const recent = parse(call(db, 'analysis', { kind: 'frequency', last: 50 }))
    assert.equal(recent.회차수, 50)
  })
})

test('le générateur passe par le même moteur que le site', { skip }, () => {
  withDb((db) => {
    const result = parse(call(db, 'generate',
      { total: [120, 140], ac: [8, 10], include: [7], sample: 5, seed: 99 }))
    assert.equal(result.조합.length, 5)
    for (const row of result.조합) {
      assert.ok(row.includes(7), '고정수 7 이 빠졌습니다')
      const sum = row.reduce((a, b) => a + b, 0)
      assert.ok(sum >= 120 && sum <= 140, `총합 ${sum}`)
    }
    // La même graine doit rendre les mêmes grilles, ici comme dans le worker.
    const again = parse(call(db, 'generate',
      { total: [120, 140], ac: [8, 10], include: [7], sample: 5, seed: 99 }))
    assert.deepEqual(again.조합, result.조합)
    assert.match(result.주의, /확률/)
  })
})

test('un 회차 absent ne fait pas tomber le serveur', { skip }, () => {
  withDb((db) => {
    assert.match(call(db, 'draw', { rang: 999_999 }), /없습니다/)
    assert.throws(() => call(db, 'inventé', {}), /알 수 없는 도구/)
  })
})

// ─────────────────────────────────────────────────────── les écrans du site

// Ce qui suit ne vérifie pas que les chiffres sont justes — ils le sont parce
// qu'ils viennent des mêmes fonctions que les pages, et ce sont les tests de
// ces fonctions qui le prouvent. Ce qui se vérifie ici est plus étroit et
// plus fragile : que le serveur appelle bien **la** fonction, et qu'il ne
// recopie rien au passage. Un test qui compare les deux sorties attrape le
// jour où quelqu'un « simplifie » un des deux côtés.

import * as pages from '../src/mcp/pages.js'
import { cells as boardCells, legacyValue } from '../src/core/board.js'
import { listSeries } from '../src/core/lists.js'
import { hotColdSeries } from '../src/core/hotcold.js'
import { hlCells, hlHistory, hlBoard } from '../src/core/hl.js'
import { excludedHitRate } from '../src/core/patterns.js'
import { expectedCommon } from '../src/core/patterns.js'
import { fromRows as pensionRows } from '../src/core/pension.js'
import { pensionListSeries } from '../src/core/pension-analysis.js'
import { getPension } from '../src/node/db.js'

const SCREENS = ['board', 'list', 'section', 'filter', 'hotcold', 'hl',
                 'table', 'pattern', 'excluded', 'pension', 'machine', 'order', 'watch']

test('chaque écran du site a son outil, décrit et schématisé', () => {
  for (const name of SCREENS) {
    const tool = TOOLS.find((t) => t.name === name)
    assert.ok(tool, `l'outil ${name} manque`)
    assert.ok(tool.description.length > 40, `${name} : description trop maigre`)
    assert.equal(tool.inputSchema.type, 'object')
  }
  // Les listes d'énumérations sortent des catalogues du noyau : si une
  // famille est ajoutée au site, elle apparaît ici sans qu'on y touche.
  const enumOf = (n, p) => TOOLS.find((t) => t.name === n).inputSchema.properties[p].enum
  assert.deepEqual(enumOf('list', 'family'), pages.LIST_KEYS)
  assert.deepEqual(enumOf('section', 'family'), pages.SECTION_KEYS)
  assert.deepEqual(enumOf('hotcold', 'family'), pages.HOTCOLD_KEYS)
  assert.deepEqual(enumOf('pension', 'page'), pages.PENSION_PAGE_KEYS)
  assert.equal(pages.PENSION_PAGE_KEYS.length, 20)
})

test('toutes les valeurs annoncées répondent, et aucune ne déborde', { skip }, () => {
  withDb((db) => {
    // 40 Ko : un écran doit tenir dans une réponse qu'un assistant peut lire
    // en entier. Le jour où l'un dépasse, c'est qu'il rend une matrice.
    const CAP = 40_000
    let calls = 0
    const run = (name, args) => {
      const out = call(db, name, args)
      calls++
      assert.ok(!out.startsWith('오류'), `${name} ${JSON.stringify(args)} → ${out.slice(0, 120)}`)
      assert.ok(out.length < CAP, `${name} ${JSON.stringify(args)} : ${out.length} caractères`)
      return parse(out)
    }

    for (const f of pages.LIST_KEYS) run('list', { family: f })
    for (const f of pages.SECTION_KEYS) run('section', { family: f })
    for (const f of pages.HOTCOLD_KEYS) run('hotcold', { family: f })
    for (const v of pages.FILTER_VIEWS) run('filter', { view: v })
    for (const p of pages.POPULATION_KEYS) {
      for (const i of pages.INDICATOR_KEYS) run('filter', { population: p, indicator: i })
    }
    for (let k = 0; k < 7; k++) { run('table', { position: k }); run('pattern', { position: k }) }
    for (const k of pages.PENSION_PAGE_KEYS) run('pension', { kind: 'page', page: k })
    for (const f of pages.PENSION_LIST_KEYS) run('pension', { kind: 'list', family: f })
    for (let q = 0; q < 6; q++) run('pension', { kind: 'flow', place: q })
    run('board', {}); run('hl', {}); run('hl', { kind: 'stats' })
    run('excluded', {}); run('pension', { kind: 'home' })

    assert.ok(calls > 100, `seulement ${calls} appels`)
  })
})

test('le 흐름 rendu est celui que la page dessine', { skip }, () => {
  withDb((db) => {
    const draws = fromRows(getDraws(db))
    const rang = draws.rangs[draws.n - 1]
    const mine = parse(call(db, 'board', {}))
    assert.equal(mine.회차, rang)

    for (const cell of boardCells(draws, rang)) {
      const value = mine.흐름[`${cell.number}번`]
      assert.equal(String(value), legacyValue(cell), `${cell.number}번`)
    }
    // Les sept numéros sortis sont comptés sous 당첨 et 이월, pas sous leur
    // écart : les entrées numériques totalisent donc 38.
    const gaps = Object.values(mine.반복수.간격별).reduce((a, b) => a + b, 0)
    assert.equal(gaps + mine.반복수.당첨 + mine.반복수.이월, 45)
    assert.equal(mine.당첨번호.length, 7)
  })
})

test('리스트 · 차가운번호 · 연금복권 리스트 sortent du même calcul que le site', { skip }, () => {
  withDb((db) => {
    const draws = fromRows(getDraws(db))

    const mine = parse(call(db, 'list', { family: 'prime' }))
    assert.deepEqual(mine.번호별, listSeries(draws, 'prime').members)

    const hot = parse(call(db, 'hotcold', { family: 'quad' }))
    const series = hotColdSeries(draws, 'quad')
    assert.deepEqual(
      hot.라인통계,
      series.lines.map((l) => ({ 번호: l.number, 당첨: l.won, 이월: l.carried, 꽝: l.blank })))

    const p = pensionRows(getPension(db))
    const list = parse(call(db, 'pension', { kind: 'list', family: 'even' }))
    assert.deepEqual(list.숫자별, pensionListSeries(p, 'even').members)
  })
})

test('la carte HL porte le 미래위치 et le 위치합 de la page', { skip }, () => {
  withDb((db) => {
    const draws = fromRows(getDraws(db))
    const cells = hlCells(draws)
    const i = draws.n - 1
    const board = hlBoard(cells, i, hlHistory(cells), null)
    const mine = parse(call(db, 'hl', {}))

    assert.equal(mine.열.length, board.columns.length)
    for (let c = 0; c < board.columns.length; c++) {
      const column = board.columns[c]
      assert.equal(mine.열[c].머리, column.label)
      for (let k = 0; k < column.entries.length; k++) {
        const e = column.entries[k]
        const got = mine.열[c].칸[k]
        assert.equal(got.번호, e.number)
        assert.equal(got.미래위치, e.digits.future)
        assert.equal(got.위치합.당첨, e.digits.won)
        assert.equal(got.위치합.이월, e.digits.carry)
        assert.equal(got.위치합.꽝, e.digits.blank)
      }
    }
    // La colonne 당첨 vient en tête, et elle tient les sept numéros sortis.
    assert.equal(mine.열[0].머리, '당첨')
    assert.equal(mine.열[0].칸.length, 7)
  })
})

test('les écrans qui prétendent trouver un signal portent leur démenti', { skip }, () => {
  withDb((db) => {
    // 제외번호 et 패턴 sont les deux pages de l'ancien site qui ressemblaient
    // le plus à une découverte. Le serveur ne doit jamais rendre leur chiffre
    // sans celui auquel il faut le comparer.
    const draws = fromRows(getDraws(db))

    const ex = parse(call(db, 'excluded', {}))
    const rate = excludedHitRate(draws)
    assert.equal(ex.검증.제외후보에서_나온_수, rate.hits)
    assert.equal(ex.검증.실제비율, `${(rate.rate * 100).toFixed(2)}%`)
    assert.ok(ex.검증.기대비율, '기대비율 manquant')

    const pat = parse(call(db, 'pattern', { position: 0 }))
    const expected = expectedCommon()
    assert.equal(pat.기대_비율['0개'], `${(expected[0] * 100).toFixed(2)}%`)
    assert.ok(pat.실제_비율['1개'])
    assert.match(pat.주의, /무작위/)
  })
})

test('une demande hors catalogue est refusée avec la liste des possibles', { skip }, () => {
  withDb((db) => {
    assert.throws(() => call(db, 'list', { family: 'inventée' }), /리스트/)
    assert.throws(() => call(db, 'table', { position: 9 }), /위치/)
    assert.throws(() => call(db, 'pension', { kind: 'flow', place: 9 }), /자리/)
    assert.throws(() => call(db, 'pension', { kind: 'inventé' }), /kind/)
    // Un 회차 qui n'existe pas remonte comme erreur d'outil, pas de protocole.
    const reply = handle(db, {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'board', arguments: { rang: 999_999 } },
    })
    assert.ok(reply.result.isError)
  })
})

test('les écrans ne peuvent rien écrire, même en insistant', { skip }, () => {
  withDb((db) => {
    // La base est ouverte en lecture seule : aucun écran, aucun argument, ne
    // doit pouvoir la modifier. On vérifie la garantie à la source.
    assert.throws(() => db.prepare('DELETE FROM draws').run())
    for (const name of SCREENS) {
      const out = call(db, name, {})
      assert.ok(typeof out === 'string' && out.length > 0, name)
    }
  })
})
