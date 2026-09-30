// L'écran d'administration — la page Update.
//
// Rien ici ne touche au réseau : on teste ce qui décide (les huit actions,
// la validation des vingt-trois champs, les routes) et pas ce qui télécharge,
// qui est déjà couvert par `crawl.test.js`. Le serveur tourne sur une copie
// jetable de la base, jamais sur `data/lotto.sqlite`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ACTIONS, PAGE, PUBLIC_DATA, manualRow, numbers, serve, snapshot, table,
} from '../tools/admin.js'
import { ValidationError, getDraws, open } from '../src/node/db.js'

const LEGACY = process.env.LOTTO_DB
  ?? join(import.meta.dirname, '..', 'data', 'lotto.sqlite')
const skip = !existsSync(LEGACY) && 'data/lotto.sqlite absent'

/** Une copie jetable : aucun test n'écrit dans la base du projet. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'lotto-admin-'))
  const path = join(dir, 'copy.sqlite')
  copyFileSync(LEGACY, path)
  // `out` est le dossier où la régénération écrit. Sans lui, un test qui
  // enregistre un 회차 réécrirait `web/public/data` — les fichiers du vrai
  // site — avec le contenu d'une base jetable.
  return {
    path,
    out: join(dir, 'data'),
    clean: () => rmSync(dir, { recursive: true, force: true }),
  }
}

async function withServer({ path, out }, work) {
  const server = await serve({ port: 0, dbPath: path, out })
  const base = `http://127.0.0.1:${server.address().port}`
  try { return await work(base) } finally { server.close() }
}

const post = (base, path, body) => fetch(base + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

// ------------------------------------------------------------- les actions

test('les huit boutons de l\'ancienne page sont tous là', () => {
  // 자동 로또, 자동 복권, 하나만, 여러 개 — plus 빠진 회차 et 검증, que
  // l'ancien n'avait pas. 직접 입력 passe par sa propre route.
  for (const key of ['lotto_all', 'lotto_since', 'pension_all', 'pension_since',
                     'lotto_one', 'lotto_range']) {
    assert.ok(ACTIONS[key], key)
  }
  for (const [key, a] of Object.entries(ACTIONS)) {
    assert.ok(['lotto', 'pension'].includes(a.product), key)
    assert.ok(a.label, key)
    assert.ok(['all', 'since', 'one', 'range', 'missing', 'verify'].includes(a.mode), key)
  }
})

test('un champ vide ne devient pas le 회차 0', () => {
  // `Number('')` vaut 0, et `Number.isInteger(0)` est vrai : sans la borne
  // basse, un clic sur un formulaire vide irait chercher le 회차 0.
  assert.throws(() => numbers({ rang: '' }, ['rang']), ValidationError)
  assert.throws(() => numbers({ rang: '0' }, ['rang']), ValidationError)
  assert.throws(() => numbers({ rang: 'abc' }, ['rang']), ValidationError)
  assert.throws(() => numbers({ rang: '1.5' }, ['rang']), ValidationError)
  assert.deepEqual(numbers({ rang: '1238' }, ['rang']), [1238])
})

// -------------------------------------------------------------- 직접 입력

const FORM = {
  rang: '9001', date: '2026-08-29',
  n1: '3', n2: '7', n3: '9', n4: '13', n5: '19', n6: '24', bonus: '23',
  w1: '14', a1: '1755689384', w2: '', a2: '', w3: '', a3: '',
  w4: '', a4: '', w5: '', a5: '',
  notes: '1등, 자동8, 수동4',
}

test('직접 입력 — les vingt-trois champs deviennent un tirage', () => {
  const row = manualRow(FORM)
  assert.equal(row.rang, 9001)
  assert.deepEqual(row.numbers, [3, 7, 9, 13, 19, 24])
  assert.equal(row.bonus, 23)
  assert.deepEqual(row.prizes, { 1: { winners: 14, amount: 1755689384 } })
  assert.deepEqual(row.notes, ['1등', '자동8', '수동4'])

  // Un rang de gain laissé vide n'est pas un rang à zéro gagnant : il est
  // absent. L'ancien formulaire écrivait 0, ce qui n'est pas la même chose.
  assert.equal(Object.keys(manualRow(FORM).prizes).length, 1)

  // Une date vide se déduit du 회차, comme partout ailleurs.
  const auto = manualRow({ ...FORM, date: '' })
  assert.equal(auto.date, undefined)
})

test('직접 입력 refuse ce que l\'ancien formulaire écrivait sans regarder', { skip }, async () => {
  const box = scratch()
  const { path, clean } = box
  try {
    await withServer(box, async (base) => {
      const bad = (over) => post(base, '/api/manual', { ...FORM, ...over })

      for (const [over, part] of [
        [{ n2: '3' }, 'double'],                    // deux fois le même numéro
        [{ bonus: '9' }, 'bonus'],                  // le bonus est déjà tiré
        [{ n6: '99' }, '1..45'],                    // hors du tableau
        [{ rang: '' }, '숫자'],                      // 회차 absent
        [{ w1: '-3' }, '당첨자수'],                   // un compte négatif
      ]) {
        const res = await bad(over)
        assert.equal(res.status, 400, JSON.stringify(over))
        const { error } = await res.json()
        assert.ok(error.includes(part), `${JSON.stringify(over)} → ${error}`)
      }

      // Et rien de tout cela n'a été écrit.
      const db = open(path, { readOnly: true })
      assert.equal(getDraws(db).filter((r) => r.rang >= 9000).length, 0)
      db.close()
    })
  } finally { clean() }
})

test('직접 입력 écrit, puis se relit', { skip }, async () => {
  const box = scratch()
  const { path, clean } = box
  try {
    await withServer(box, async (base) => {
      const res = await post(base, '/api/manual', FORM)
      assert.equal(res.status, 200)
      const out = await res.json()
      assert.equal(out.ok, true)
      assert.equal(out.meta.lotto.rang, 9001)

      const db = open(path, { readOnly: true })
      const rows = table(db, 5)
      assert.equal(rows[0].rang, 9001)
      assert.deepEqual(rows[0].numbers, [3, 7, 9, 13, 19, 24])
      assert.equal(rows[0].bonus, 23)
      assert.equal(rows[0].prizes[1].winners, 14)
      assert.deepEqual(rows[0].notes, ['1등', '자동8', '수동4'])
      db.close()

      // La régénération a écrit dans le dossier jetable, et nulle part
      // ailleurs : les fichiers du vrai site sont intacts.
      assert.deepEqual(out.written.length, 1)
      const fresh = JSON.parse(readFileSync(join(box.out, 'meta.json'), 'utf8'))
      assert.equal(fresh.lotto.rang, 9001)
      if (existsSync(PUBLIC_DATA)) {
        const real = JSON.parse(readFileSync(join(PUBLIC_DATA, 'meta.json'), 'utf8'))
        assert.notEqual(real.lotto.rang, 9001, 'web/public/data a été écrasé')
      }
    })
  } finally { clean() }
})

// ---------------------------------------------------------------- l'état

test('현재 상태 dit ce qu\'il y a en base', { skip }, () => {
  const db = open(LEGACY, { readOnly: true })
  const s = snapshot(db)
  assert.match(s.fingerprint, /^[0-9a-f]{8}$/)
  assert.equal(s.products.length, 2)
  for (const p of s.products) {
    assert.ok(p.draws > 0, p.label)
    assert.equal(p.gapCount, p.gaps.length >= 40 ? p.gapCount : p.gaps.length)
    assert.ok(p.lastRang >= p.draws - p.gapCount)
  }
  db.close()
})

test('Tables rend les 회차 du plus récent au plus ancien', { skip }, () => {
  const db = open(LEGACY, { readOnly: true })
  const rows = table(db, 12)
  assert.equal(rows.length, 12)
  const rangs = rows.map((r) => r.rang)
  assert.deepEqual(rangs, [...rangs].sort((a, b) => b - a))
  for (const r of rows) {
    assert.equal(r.numbers.length, 6)
    assert.ok(r.bonus >= 1 && r.bonus <= 45)
    assert.deepEqual(r.numbers, [...r.numbers].sort((a, b) => a - b))
  }
  db.close()
})

// --------------------------------------------------------------- les routes

test('le serveur répond, et refuse ce qu\'il ne connaît pas', { skip }, async () => {
  const box = scratch()
  const { path, clean } = box
  try {
    await withServer(box, async (base) => {
      const page = await fetch(base + '/')
      assert.equal(page.status, 200)
      const html = await page.text()
      assert.ok(html.includes('자동 로또 업데이트'))
      assert.ok(html.includes('직접 입력'))
      assert.ok(html.includes('127.0.0.1'))

      assert.equal((await fetch(base + '/api/status')).status, 200)
      assert.equal((await fetch(base + '/api/table?limit=3')).status, 200)
      assert.equal((await fetch(base + '/api/rien')).status, 404)

      // Une action inconnue ne casse pas le flux : elle rend une ligne
      // d'erreur, comme n'importe quel autre événement.
      const res = await post(base, '/api/run', { action: 'inconnu' })
      assert.equal(res.status, 200)
      const first = JSON.parse((await res.text()).trim().split('\n')[0])
      assert.equal(first.type, 'error')

      // Et les modes qui demandent un 회차 le disent, sans rien télécharger.
      for (const action of ['lotto_one', 'lotto_range']) {
        const r = await post(base, '/api/run', { action })
        const line = JSON.parse((await r.text()).trim().split('\n')[0])
        assert.equal(line.type, 'error', action)
        assert.match(line.message, /회차/)
      }
    })
  } finally { clean() }
})

test('la page est un seul fichier, sans dépendance extérieure', () => {
  const html = readFileSync(PAGE, 'utf8')
  // Rien qui parte chercher un script, une police ou une feuille de style
  // ailleurs : l'écran doit s'ouvrir sans réseau.
  assert.ok(!/<script[^>]+src=/.test(html), 'script externe')
  assert.ok(!/<link[^>]+href=/.test(html), 'feuille externe')
  assert.ok(!/https?:\/\/(?!127\.0\.0\.1)/.test(html.replace(/<!--[\s\S]*?-->/g, '')),
    'adresse extérieure')
})
