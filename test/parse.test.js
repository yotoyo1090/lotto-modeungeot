// Le lecteur de pages.
//
// Un avertissement d'abord, parce qu'il compte plus que les tests qui
// suivent : **ces tests ne prouvent pas que le crawler lit correctement le
// vrai site.** Ils prouvent que le lecteur relit les exemples qu'on lui
// fabrique. C'est utile — les régressions se voient — mais ce n'est pas la
// même chose.
//
// La seule preuve qui vaut est `npm run crawl -- verify` : elle
// retélécharge des tirages déjà en base et compare. Si la mise en forme du
// site a changé, ou si la signature de forme choisie ici est trop faible,
// c'est là que ça se verra, et nulle part ailleurs.
//
// Ce que ces tests vérifient réellement, alors : que la reconnaissance par
// **forme** tient face aux pièges qu'une vraie page tend — un balisage
// différent, des entités, du bruit numérique autour, des montants qui
// ressemblent à des numéros.

import test from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const HERE = dirname(fileURLToPath(import.meta.url))

import { decode, integers, runs, soleInteger } from '../src/node/html.js'
import {
  ParseError, findDate, findDigits, findGroup, findNumbers, findPrizes, findRang,
  parseLotto, parsePension,
} from '../src/node/parse.js'

// ------------------------------------------------------------------ pages

/** Une page 6/45 plausible — le balisage exact importe peu, c'est le sujet. */
function lottoPage({
  rang = 1134, date = '2024년 08월 24일',
  numbers = [3, 7, 9, 13, 19, 24], bonus = 23, wrapper = 'span',
} = {}) {
  const balls = numbers.map((n) => `<${wrapper} class="ball">${n}</${wrapper}>`).join('')
  return `<!doctype html><html><head><title>당첨결과</title>
    <script>var drwNo = ${rang};</script></head><body>
    <div class="win_result"><h4>제${rang}회 당첨결과</h4>
    <p class="desc">(${date} 추첨)</p>
    <div class="num win">${balls}</div>
    <div class="num bonus"><${wrapper}>${bonus}</${wrapper}></div></div>
    <table class="tbl_data"><tbody>
      <tr><td>1등</td><td>14</td><td>1,755,682,750원</td></tr>
      <tr><td>2등</td><td>97</td><td>42,232,594원</td></tr>
      <tr><td>3등</td><td>3,961</td><td>1,034,721원</td></tr>
      <tr><td>4등</td><td>180,353</td><td>50,000원</td></tr>
      <tr><td>5등</td><td>2,807,905</td><td>5,000원</td></tr>
    </tbody></table></body></html>`
}

function pensionPage({
  rang = 225, group = 3, digits = [2, 4, 5, 9, 1, 4],
  bonus = [2, 5, 6, 3, 4, 7], date = '2024년 08월 22일',
} = {}) {
  const cells = (list) => list.map((d) => `<span class="digit">${d}</span>`).join('')
  return `<!doctype html><html><body>
    <h3>${rang}회 당첨번호</h3><p>${date} 추첨</p>
    <div class="win"><span class="group">${group}조</span>${cells(digits)}</div>
    <div class="second"><strong>2등</strong>${cells(bonus)}</div>
    </body></html>`
}

// -------------------------------------------------------------------- html

test('le balisage est réduit à des fragments de texte', () => {
  assert.deepEqual(runs('<p>a</p><p>b</p>'), ['a', 'b'])
  // Chaque balise coupe : deux nombres collés par du balisage restent deux.
  assert.deepEqual(runs('<span>7</span><span>13</span>'), ['7', '13'])
  // Une date écrite d'un trait reste d'un trait : découper sur les espaces
  // la casserait en trois, et plus aucune expression ne la reconnaîtrait.
  assert.deepEqual(runs('<p>2024년 08월 24일</p>'), ['2024년 08월 24일'])
  assert.deepEqual(runs('<script>var n = 7;</script><p>ok</p>'), ['ok'])
  assert.deepEqual(runs('<style>.a{color:red}</style><p>ok</p>'), ['ok'])
  assert.deepEqual(runs('<!-- 7 --><p>ok</p>'), ['ok'])
})

test('les entités sont décodées', () => {
  assert.equal(decode('&amp;'), '&')
  assert.equal(decode('&#54924;'), '회')
  assert.equal(decode('&#x1F600;'), '\u{1F600}')
  assert.equal(decode('&inconnue;'), '&inconnue;')
})

test('les entiers se lisent avec ou sans séparateur', () => {
  assert.deepEqual(integers('1,755,682,750원'), [1755682750])
  assert.deepEqual(integers('14명 · 97명'), [14, 97])
  assert.equal(soleInteger('  42 '), 42)
  assert.equal(soleInteger('42원'), null, 'un entier accompagné n\'est pas seul')
  assert.equal(soleInteger('4 2'), null)
})

// ------------------------------------------------------------------- 6/45

test('un tirage 6/45 se lit dans une page ordinaire', () => {
  const row = parseLotto(lottoPage(), { expect: 1134 })
  assert.equal(row.rang, 1134)
  assert.equal(row.date, '2024-08-24')
  assert.deepEqual(row.numbers, [3, 7, 9, 13, 19, 24])
  assert.equal(row.bonus, 23)
  assert.equal(row.prizes[1].winners, 14)
  assert.equal(row.prizes[1].amount, 1_755_682_750)
  assert.equal(row.prizes[5].winners, 2_807_905)
  assert.equal(row.prizes[5].amount, 5000)
})

test('le lecteur ne dépend pas du nom des balises', () => {
  // C'est tout l'intérêt de la reconnaissance par forme : changer `span` en
  // `li` casserait n'importe quel sélecteur CSS, et ne change rien ici.
  for (const wrapper of ['span', 'li', 'strong', 'div']) {
    const row = parseLotto(lottoPage({ wrapper }))
    assert.deepEqual(row.numbers, [3, 7, 9, 13, 19, 24], wrapper)
    assert.equal(row.bonus, 23, wrapper)
  }
})

test('les gains se lisent dans l\'ordre des colonnes, pas par grandeur', () => {
  // Aux rangs 4 et 5, il y a plus de gagnants que de wons par gagnant.
  // Trier par ordre de grandeur — ce que faisait l'ancien code — inversait
  // les deux colonnes sur ces deux lignes exactement.
  const prizes = parseLotto(lottoPage()).prizes
  assert.ok(prizes[4].winners > prizes[4].amount, 'rang 4 : plus de gagnants que de wons')
  assert.equal(prizes[4].winners, 180_353)
  assert.equal(prizes[4].amount, 50_000)
  assert.equal(prizes[5].winners, 2_807_905)
  assert.equal(prizes[5].amount, 5000)
})

test('les montants ne peuvent pas être pris pour des numéros', () => {
  const row = parseLotto(lottoPage())
  // 14, 97 et 5 000 traînent dans le tableau des gains ; aucun ne doit
  // entrer dans la grille, parce qu'aucun ne forme une suite de sept.
  assert.deepEqual(row.numbers, [3, 7, 9, 13, 19, 24])
})

test('une suite non croissante n\'est pas un tirage', () => {
  const fragments = ['9', '7', '3', '13', '19', '24', '23']
  assert.equal(findNumbers(fragments), null)
})

test('un doublon n\'est pas un tirage', () => {
  assert.equal(findNumbers(['3', '7', '9', '13', '19', '24', '19']), null)
})

test('un numéro hors de 1..45 coupe la suite', () => {
  assert.equal(findNumbers(['3', '7', '9', '13', '19', '46', '24', '23']), null)
})

test('le 회차 annoncé doit être celui qu\'on a demandé', () => {
  assert.throws(() => parseLotto(lottoPage({ rang: 1133 }), { expect: 1134 }),
    (error) => error instanceof ParseError && error.found === 1133)
})

test('une page sans tirage donne une erreur nommée, pas une ligne creuse', () => {
  assert.throws(() => parseLotto('<html><body><p>점검 중입니다</p></body></html>'),
    /회차/)
  assert.throws(() => parseLotto('<h4>제1134회</h4><p>준비 중</p>'),
    /일곱 개/)
  assert.throws(() => parseLotto(
    '<h4>제9회</h4><span>3</span><span>7</span><span>9</span>' +
    '<span>13</span><span>19</span><span>24</span><span>23</span>'),
  /추첨일/)
})

test('le 회차 et la date se lisent sous plusieurs écritures', () => {
  assert.equal(findRang(['제1,134회 당첨결과']), 1134)
  assert.equal(findRang(['1134회']), 1134)
  assert.equal(findDate(['2024년 8월 4일']), '2024-08-04')
  assert.equal(findDate(['2024-08-24']), '2024-08-24')
  assert.equal(findDate(['2024.08.24']), '2024-08-24')
  assert.equal(findDate(['추첨 없음']), null)
})

// --------------------------------------------------------------- 연금복권

test('un tirage 연금복권 se lit avec son 조 et ses deux nombres', () => {
  const row = parsePension(pensionPage(), { expect: 225 })
  assert.equal(row.rang, 225)
  assert.equal(row.group, 3)
  assert.deepEqual(row.digits, [2, 4, 5, 9, 1, 4])
  assert.deepEqual(row.bonus, [2, 5, 6, 3, 4, 7])
  assert.equal(row.date, '2024-08-22')
})

test('les chiffres 연금복권 peuvent se répéter — le 6/45 ne le permet pas', () => {
  const row = parsePension(pensionPage({ digits: [7, 7, 7, 7, 7, 7] }))
  assert.deepEqual(row.digits, [7, 7, 7, 7, 7, 7])
})

test('seuls les fragments d\'un seul caractère comptent comme chiffres', () => {
  // « 12 » n'est pas un chiffre : sans cette règle, un nombre à deux
  // chiffres se ferait lire comme deux positions.
  assert.equal(findDigits(['1', '2', '3', '45', '5', '6', '7']), null)
  assert.deepEqual(findDigits(['1', '2', '3', '4', '5', '6']).digits, [1, 2, 3, 4, 5, 6])
})

test('le second nombre se cherche après le premier', () => {
  const fragments = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '1', '2']
  const first = findDigits(fragments)
  const second = findDigits(fragments, { after: first.at + 6 })
  assert.deepEqual(first.digits, [1, 2, 3, 4, 5, 6])
  assert.deepEqual(second.digits, [7, 8, 9, 0, 1, 2])
})

test('le 조 doit être entre 1 et 5', () => {
  assert.equal(findGroup(['3조']), 3)
  assert.equal(findGroup(['제 5 조']), 5)
  assert.equal(findGroup(['비고']), null)
  assert.throws(() => parsePension(pensionPage({ group: 9 })), /조/)
})

test('une page 연금복권 incomplète donne une erreur nommée', () => {
  assert.throws(() => parsePension('<p>점검 중</p>'), /회차/)
  assert.throws(() => parsePension('<h3>225회</h3><p>준비 중</p>'), /조/)
  assert.throws(() => parsePension('<h3>225회</h3><span>3조</span><span>1</span>'),
    /여섯 자리/)
})

// -------------------------------------------------------- ce qui suit après

test('les lignes lues sont acceptables par la validation de la base', async () => {
  const { validateDraw, validatePension } = await import('../src/node/db.js')
  // Le lecteur ne valide rien lui-même : c'est `db.js` qui décide. Ce test
  // vérifie que ce qu'il produit a la forme que la base attend, faute de
  // quoi chaque tirage lu serait rejeté à l'écriture.
  const lotto = parseLotto(lottoPage())
  assert.doesNotThrow(() => validateDraw(lotto))
  const pension = parsePension(pensionPage())
  assert.doesNotThrow(() => validatePension(pension))
})

// ------------------------------------------------- la page qui n'en est pas

test('une coquille sans résultat est reconnue comme telle', async () => {
  // Cette fixture est une **vraie** page reçue du site le 26 août 2026, à
  // l'ancienne adresse `gameResult.do?method=byWin&drwNo=1238`. Elle fait
  // 105 Ko, répond HTTP 200, porte toute la navigation du site — et ne
  // contient aucun tirage. Le site avait changé d'adresses.
  //
  // Sans ce test, l'échec remontait sous la forme « 회차를 찾지 못했습니다 »,
  // ce qui accusait le lecteur alors que le problème était la page. Un
  // diagnostic qui désigne le mauvais coupable coûte plus cher qu'une
  // absence de diagnostic — d'où cette fixture, gardée telle quelle.
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { looksEmpty } = await import('../src/node/crawl.js')

  const html = readFileSync(join(HERE, 'fixtures', 'shell-page.html'), 'utf8')
  const verdict = looksEmpty(html)
  assert.ok(verdict, 'la coquille doit être détectée')
  assert.match(verdict, /대기|차단|결과가 없는/)

  // Et le lecteur, lui, échoue bien — mais ce n'est plus lui qu'on interroge.
  assert.throws(() => parseLotto(html, { expect: 1238 }), /회차/)
})

test('une vraie page de résultat n\'est pas prise pour une coquille', async () => {
  const { looksEmpty } = await import('../src/node/crawl.js')
  assert.equal(looksEmpty(lottoPage()), null)
  assert.equal(looksEmpty(pensionPage()), null)
  // Même une page portant le calque d'attente passe si le résultat est là :
  // le calque est présent sur toutes les pages du site, affiché ou non.
  const withOverlay = `<div id="waitPage">서비스 접근 대기 중입니다.</div>${lottoPage()}`
  assert.equal(looksEmpty(withOverlay), null)
})

// ------------------------------------------------------- la réponse JSON

test('le tirage se lit dans la réponse que la page demande', async () => {
  const { parseLottoJson, normalizeDate } = await import('../src/node/json.js')

  // La forme exacte observée sur le site en août 2026 : une liste de
  // plusieurs 회차 — le sélecteur en affiche un carrousel — dont il faut
  // extraire celui qu'on a demandé.
  const payload = { code: '0000', data: { list: [
    { ltEpsd: '1237', tm1WnNo: 1, tm2WnNo: 2, tm3WnNo: 3,
      tm4WnNo: 4, tm5WnNo: 5, tm6WnNo: 6, bnsWnNo: 7 },
    { ltEpsd: '1238', ltRflYmd: '20260822',
      tm1WnNo: 24, tm2WnNo: 3, tm3WnNo: 19, tm4WnNo: 7, tm5WnNo: 13, tm6WnNo: 9,
      bnsWnNo: 23,
      rnk1WnNope: '14', rnk1WnAmt: '1,755,682,750',
      rnk5WnNope: '2,807,905', rnk5WnAmt: '5,000' },
  ] } }

  const row = parseLottoJson(payload, { expect: 1238 })
  assert.equal(row.rang, 1238)
  assert.equal(row.date, '2026-08-22')
  // Le site ne les rend pas triés ; la base l'exige.
  assert.deepEqual(row.numbers, [3, 7, 9, 13, 19, 24])
  assert.equal(row.bonus, 23)
  assert.equal(row.prizes[1].amount, 1_755_682_750)
  assert.equal(row.prizes[5].winners, 2_807_905)

  assert.equal(normalizeDate('20260822'), '2026-08-22')
  assert.equal(normalizeDate('2026-8-2'), '2026-08-02')
  assert.equal(normalizeDate('2026.08.22'), '2026-08-22')
  assert.equal(normalizeDate(''), null)
})

test('un 회차 absent de la réponse n\'est pas remplacé par le premier venu', async () => {
  const { parseLottoJson } = await import('../src/node/json.js')
  // Prendre `list[0]` serait une erreur silencieuse : on écrirait le tirage
  // d'un autre 회차 sous le numéro demandé, et rien ne s'en apercevrait.
  const payload = { data: { list: [
    { ltEpsd: '1237', tm1WnNo: 1, tm2WnNo: 2, tm3WnNo: 3,
      tm4WnNo: 4, tm5WnNo: 5, tm6WnNo: 6, bnsWnNo: 7 },
  ] } }
  assert.throws(() => parseLottoJson(payload, { expect: 1238 }), /1238회가 응답에 없습니다/)
  assert.throws(() => parseLottoJson({ data: { list: [] } }, { expect: 1238 }),
    /회차 목록이 없습니다/)
})

test('la réponse JSON subit les mêmes contrôles que le HTML', async () => {
  const { parseLottoJson } = await import('../src/node/json.js')
  const make = (over) => ({ data: { list: [{
    ltEpsd: '1238', ltRflYmd: '20260822',
    tm1WnNo: 3, tm2WnNo: 7, tm3WnNo: 9, tm4WnNo: 13, tm5WnNo: 19, tm6WnNo: 24,
    bnsWnNo: 23, ...over,
  }] } })

  assert.throws(() => parseLottoJson(make({ tm1WnNo: 46 }), { expect: 1238 }), /1\.\.45/)
  assert.throws(() => parseLottoJson(make({ tm1WnNo: 0 }), { expect: 1238 }), /1\.\.45/)
  assert.throws(() => parseLottoJson(make({ bnsWnNo: 24 }), { expect: 1238 }), /중복/)
  assert.throws(() => parseLottoJson(make({ tm3WnNo: null }), { expect: 1238 }), /tm3WnNo/)
})

// Une **vraie** réponse du site, reçue le 26 août 2026 pour le 225회. Elle
// porte onze 회차 — la fenêtre du carrousel — et huit lignes chacun.
function pensionWindow() {
  const { readFileSync } = require('node:fs')
  return JSON.parse(readFileSync(
    join(HERE, 'fixtures', 'pension-window.json'), 'utf8'))
}

test('연금복권 : le tirage se lit dans la vraie réponse du site', async () => {
  const { parsePensionJson } = await import('../src/node/json.js')
  const payload = pensionWindow()

  const row = parsePensionJson(payload, { expect: 225 })
  assert.equal(row.rang, 225)
  assert.equal(row.group, 3)
  assert.equal(row.date, '2024-08-22')
  assert.deepEqual(row.digits, [2, 4, 5, 9, 1, 4])
  assert.deepEqual(row.bonus, [2, 5, 6, 3, 4, 7])
})

test('연금복권 : le numéro tronqué des rangs inférieurs n\'est jamais lu', async () => {
  const { parsePensionJson } = await import('../src/node/json.js')
  const payload = pensionWindow()

  // Le site donne huit lignes par 회차, une par rang, et tronque le numéro à
  // mesure qu'on descend : 245914 → 45914 → 5914 → 914 → 14 → 4, parce que
  // gagner au 3등 ne demande que les cinq derniers chiffres. Lire la mauvaise
  // ligne donnerait un tirage amputé qui aurait l'air valide.
  const rows = payload.data.result.filter((r) => Number(r.psltEpsd) === 225)
  assert.equal(rows.length, 8, 'huit rangs par 회차')
  assert.deepEqual(rows.map((r) => String(r.wnRnkVl).length).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 6, 6])

  // Seule la ligne wnSqNo 1 porte le 조 ; toutes les autres l'ont à null.
  assert.equal(rows.filter((r) => r.wnBndNo !== null).length, 1)

  assert.equal(parsePensionJson(payload, { expect: 225 }).digits.length, 6)
})

test('연금복권 : les zéros de tête survivent, sur des données réelles', async () => {
  const { parsePensionJson } = await import('../src/node/json.js')
  const payload = pensionWindow()
  // 227회 est sorti « 068516 ». Passé par Number(), il deviendrait 68516.
  assert.deepEqual(parsePensionJson(payload, { expect: 227 }).digits,
    [0, 6, 8, 5, 1, 6])
  // 222회 : « 058627 ».
  assert.deepEqual(parsePensionJson(payload, { expect: 222 }).digits,
    [0, 5, 8, 6, 2, 7])
})

test('연금복권 : un 회차 hors de la fenêtre est refusé, pas remplacé', async () => {
  const { parsePensionJson } = await import('../src/node/json.js')
  assert.throws(() => parsePensionJson(pensionWindow(), { expect: 219 }),
    /219회가 응답에 없습니다/)
})

test('la réponse 연금복권 est contrôlée avant d\'être crue', async () => {
  const { parsePensionJson, splitDigits } = await import('../src/node/json.js')
  const rows = (over = {}) => ({ data: { result: [{
    psltEpsd: 225, psltSn: 1, wnSqNo: 1, psltRflYmd: '20240822',
    wnBndNo: '3', wnRnkVl: '245914', ...over,
  }, {
    psltEpsd: 225, psltSn: 8, wnSqNo: 21, psltRflYmd: '20240822',
    wnBndNo: null, wnRnkVl: '256347',
  }] } })

  assert.throws(() => parsePensionJson(rows({ wnBndNo: '9' }), { expect: 225 }), /조/)
  assert.throws(() => parsePensionJson(rows({ wnRnkVl: '2459' }), { expect: 225 }), /6자리/)
  assert.throws(() => parsePensionJson(rows({ wnRnkVl: '24591a' }), { expect: 225 }),
    /숫자 문자열/)
  assert.throws(() => parsePensionJson({ data: { result: [] } }, { expect: 225 }),
    /결과가 없습니다/)
  assert.throws(() => splitDigits(null, 'x'), /숫자 문자열/)

  // Une fenêtre sans la ligne du 1등 : refusée plutôt que devinée — c'est la
  // seule qui porte le 조 et le numéro complet.
  assert.throws(() => parsePensionJson({ data: { result: [
    { psltEpsd: 225, wnSqNo: 3, wnRnkVl: '45914' },
  ] } }, { expect: 225 }), /1등 행/)
})

// ------------------------------------------------------- jusqu'où aller

test('`since` déduit sa fourchette de la base, pas d\'un calendrier codé', async () => {
  const { expectedRang } = await import('../tools/crawl.js')

  // Le repère est le dernier tirage connu et sa date. Aucun produit n'a
  // d'origine à retenir, et les deux se comportent pareil — ce qui n'était
  // pas le cas avant : le 연금복권 renvoyait `last + 1`, donc toujours un
  // seul 회차, alors qu'il en manquait une centaine.
  const at = (iso) => new Date(`${iso}T12:00:00Z`)

  assert.equal(expectedRang({ date: '2024-08-22' }, 225, at('2026-08-26')), 329)
  assert.equal(expectedRang({ date: '2026-08-22' }, 1238, at('2026-08-26')), 1238)
  assert.equal(expectedRang({ date: '2026-08-22' }, 1238, at('2026-08-30')), 1239)

  // Sans date, ou avec une date future, on ne réclame rien : mieux vaut ne
  // pas descendre que descendre au hasard.
  assert.equal(expectedRang({ date: null }, 500, at('2026-08-26')), 500)
  assert.equal(expectedRang(undefined, 500, at('2026-08-26')), 500)
  assert.equal(expectedRang({ date: '2027-01-01' }, 500, at('2026-08-26')), 500)
})
