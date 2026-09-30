// Les huit modes de mise à jour, en une seule commande.
//
// L'ancien écran d'administration avait huit boutons, chacun câblé à sa
// propre vue Django, chacune avec sa copie de la logique de téléchargement.
// Ce sont ici huit valeurs d'un même argument, au-dessus du même code.
//
//   node --experimental-sqlite tools/crawl.js <mode> [options]
//
//   latest              le dernier 회차 publié
//   since               tout ce qui manque depuis le dernier en base
//   one <n>             un 회차 précis
//   range <a> <b>       un intervalle, bornes incluses
//   missing             les trous entre 1 et le dernier en base
//   all                 tout depuis le 회차 1
//   recheck <n> [m]     retélécharge et affiche, sans écrire
//   verify [n]          compare n tirages connus à leur page d'aujourd'hui
//   probe [n]           essaie plusieurs adresses et dit laquelle répond
//   hogi                les étiquettes 추첨기, 262회 → aujourd'hui (site tiers)
//   order               l'ordre de sortie des boules, 468회 → aujourd'hui (site tiers)
//
//   --product lotto|pension     (défaut : lotto)
//   --pause <ms>                (défaut : 1000)
//   --db <chemin>
//   --no-archive

import { pathToFileURL } from 'node:url'

import { collect, known, probe, read, verify } from '../src/node/crawl.js'
import {
  DEFAULT_PATH, LABELS, PRODUCTS, gaps, logCrawl, open, status,
} from '../src/node/db.js'
import { collectHogi } from '../src/node/hogi.js'
import { collectOrder } from '../src/node/order.js'

const MODES = ['latest', 'since', 'one', 'range', 'missing', 'all',
               'recheck', 'verify', 'probe', 'hogi', 'order']

export function parseArgs(argv) {
  const positional = []
  const options = { product: 'lotto', pause: 1000, db: DEFAULT_PATH, archive: true }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--no-archive') { options.archive = false; continue }
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const value = argv[++i]
      if (key === 'pause') options.pause = Number(value)
      else if (key === 'product') options.product = value
      else if (key === 'db') options.db = value
      else throw new Error(`알 수 없는 옵션 : ${arg}`)
      continue
    }
    positional.push(arg)
  }

  const [mode, ...rest] = positional
  if (!MODES.includes(mode)) {
    throw new Error(`모드는 ${MODES.join(' | ')} 중 하나여야 합니다`)
  }
  if (!PRODUCTS.includes(options.product)) {
    throw new Error(`제품은 ${PRODUCTS.join(' | ')} 중 하나여야 합니다`)
  }
  return { mode, rest: rest.map(Number), options }
}

/**
 * Les 회차 que le mode demande — sans rien télécharger.
 *
 * Cette fonction est pure : on peut lui demander ce qu'un mode ferait avant
 * de le lancer, et c'est ce que `--dry` affiche.
 */
export function plan(mode, rest, db, product) {
  const rows = known(db, product)
  const last = rows.size ? Math.max(...rows.keys()) : 0

  switch (mode) {
    case 'latest':
      return [last + 1]
    case 'one':
      if (!Number.isInteger(rest[0])) throw new Error('회차를 지정하세요')
      return [rest[0]]
    case 'range': {
      const [a, b] = rest
      if (!Number.isInteger(a) || !Number.isInteger(b) || a > b) {
        throw new Error('범위는 <시작> <끝> 형식이며 시작 ≤ 끝이어야 합니다')
      }
      return series(a, b)
    }
    case 'missing':
      return gaps(db, product)
    case 'all':
      return series(1, Math.max(last, 1))
    case 'since': {
      // Jusqu'où aller ? La question s'est d'abord réglée par un calendrier
      // codé en dur pour le 6/45, et par `last + 1` pour le 연금복권 — c'est
      // à dire par rien du tout : `since` ne rapportait qu'un seul tirage,
      // alors qu'il en manquait une centaine.
      //
      // Le repère est maintenant pris **dans la base elle-même** : le dernier
      // 회차 connu, sa date, et un tirage par semaine. Aucun produit n'a de
      // date d'origine à retenir, et les deux se comportent pareil.
      const reachable = expectedRang(rows.get(last), last)
      return last >= reachable ? [] : series(last + 1, reachable)
    }
    case 'recheck': {
      const [a, b] = rest
      if (!Number.isInteger(a)) throw new Error('회차를 지정하세요')
      return Number.isInteger(b) ? series(a, b) : [a]
    }
    case 'probe': {
      // Un seul 회차 suffit : on cherche la bonne forme d'adresse, pas des
      // données. Le plus récent, parce que c'est celui qui existe à coup sûr.
      return [Number.isInteger(rest[0]) ? rest[0] : last]
    }
    case 'verify': {
      const count = Number.isInteger(rest[0]) ? rest[0] : 5
      const all = [...rows.keys()].sort((x, y) => y - x)
      // Les plus récents d'abord : ce sont les pages dont la mise en forme
      // a le plus de chances d'avoir changé.
      return all.slice(0, count)
    }
    default:
      throw new Error(`모드 ${mode}`)
  }
}

const series = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

const WEEK = 7 * 24 * 60 * 60 * 1000

/**
 * Combien de 회차 devraient exister aujourd'hui, d'après le dernier connu.
 *
 * Les deux produits tirent une fois par semaine — le samedi pour le 6/45, le
 * jeudi pour le 연금복권. Il suffit donc de compter les semaines écoulées
 * depuis le dernier tirage en base. Le nombre obtenu n'est qu'une borne
 * haute : c'est le site qui dira lesquels existent vraiment, et la collecte
 * s'arrête d'elle-même au premier absent.
 */
export function expectedRang(lastRow, lastRang, today = new Date()) {
  if (!lastRow?.date) return lastRang
  const elapsed = today - Date.parse(lastRow.date)
  if (!Number.isFinite(elapsed) || elapsed < 0) return lastRang
  return lastRang + Math.floor(elapsed / WEEK)
}

async function main() {
  let parsed
  try {
    parsed = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    console.error(`\n사용법 : node --experimental-sqlite tools/crawl.js <${MODES.join('|')}>`)
    process.exitCode = 1
    return
  }

  const { mode, rest, options } = parsed
  const db = open(options.db)
  const label = LABELS[options.product]

  // Les deux modes du site tiers ne planifient pas de 회차 : c'est toujours
  // la même page, du premier 회차 connu à aujourd'hui. Ils échouent seuls et
  // l'écrivent dans crawl_log — `npm run update` enchaîne les tirages avant
  // eux, qui ne dépendent jamais de ce site.
  if (mode === 'hogi' || mode === 'order') {
    const third = mode === 'hogi'
      ? { title: '추첨기 · hogi — 262회부터 전체', run: collectHogi }
      : { title: '공나온 순서 · order — 468회부터 전체', run: collectOrder }
    console.log(third.title)
    try {
      const r = await third.run(db, { keep: options.archive })
      logCrawl(db, { product: 'lotto', mode, added: r.added, updated: r.updated,
                     rejected: r.rejected ?? 0,
                     detail: `read ${r.read} · unchanged ${r.unchanged} · orphan ${r.orphan}` })
      console.log(`  읽음 ${r.read} · 저장 ${r.added} · 변경 ${r.updated} · 변화 없음 ${r.unchanged}` +
                  ` · 회차 없음 ${r.orphan}${r.rejected ? ` · 불일치 ${r.rejected}` : ''}`)
    } catch (error) {
      logCrawl(db, { product: 'lotto', mode, failed: 1, detail: error.message })
      // Pas de code de sortie : ce site tiers ne doit pas interrompre
      // `npm run update`. L'échec est dans crawl_log, `doctor` le montre.
      console.error(`  실패 — ${error.message}`)
    }
    db.close()
    return
  }

  let rangs
  try {
    rangs = plan(mode, rest, db, options.product)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
    db.close()
    return
  }

  if (!rangs.length) {
    console.log(`${label} — 받을 회차가 없습니다.`)
    report(db)
    db.close()
    return
  }

  console.log(`${label} · ${mode} — ${rangs.length}개 회차`)
  console.log(`  ${rangs.slice(0, 8).join(', ')}${rangs.length > 8 ? ` … ${rangs.at(-1)}` : ''}\n`)

  if (mode === 'probe') {
    const results = await probe(options.product, rangs[0], { pause: options.pause })
    console.log()
    let winner = null
    for (const row of results) {
      const head = row.ok ? '  성공' : '  실패'
      const kind = row.kind === 'json' ? ' [JSON]' : ''
      console.log(`${head}${kind}  ${row.url}`)
      if (row.ok) {
        winner ??= row
        console.log(`         ${JSON.stringify(row.row.numbers ?? row.row.digits)}` +
                    ` · ${row.row.date ?? '날짜 없음'}`)
      } else {
        console.log(`         ${row.reason}${row.bytes ? ` (${(row.bytes / 1024).toFixed(0)} Ko)` : ''}`)
      }
    }
    console.log()
    if (winner) {
      console.log(`작동하는 주소 : ${winner.url}`)
      console.log('이 줄을 그대로 보내주시면 크롤러에 고정하겠습니다.')
    } else {
      console.log('어떤 주소도 결과를 주지 않았습니다.')
      console.log('받은 페이지는 data/pages/ 에 probe-*.html 로 저장했습니다 — 하나 보내주세요.')
      process.exitCode = 1
    }
    db.close()
    return
  }

  if (mode === 'verify') {
    const results = await verify(db, options.product, rangs, { pause: options.pause })

    // Un verdict ne se prononce que sur ce qui a été **lu**. La version
    // précédente ne comptait que les divergences et concluait « tout va
    // bien » même quand les dix pages étaient illisibles : un feu vert qui
    // ne reposait sur rien, et qui aurait autorisé une mise à jour avec un
    // lecteur cassé. C'est le pire défaut qu'un outil de vérification
    // puisse avoir, et il n'a été vu qu'en le lançant pour de vrai.
    let identical = 0
    let divergent = 0
    let unreadable = 0

    for (const row of results) {
      if (row.status === 'identique') {
        identical++
        console.log(`  ${String(row.rang).padStart(5)}  일치`)
      } else if (row.status === 'divergent') {
        divergent++
        console.log(`  ${String(row.rang).padStart(5)}  불일치`)
        for (const d of row.differences) {
          console.log(`         ${d.field} : 저장 ${d.stored} / 페이지 ${d.page}`)
        }
      } else {
        unreadable++
        console.log(`  ${String(row.rang).padStart(5)}  ${row.status} ${row.reason ?? ''}`)
      }
    }

    console.log()
    if (unreadable) {
      console.log(`${unreadable}개 회차를 읽지 못했습니다 — 페이지 구조가 바뀌었거나 요청이 차단되었습니다.`)
      console.log('받은 페이지는 data/pages/ 에 저장되어 있습니다. 확인 후 읽기 방식을 고쳐야 합니다.')
      console.log('\n지금 상태로는 자동 갱신을 켜지 마세요.')
      process.exitCode = 1
    } else if (divergent) {
      console.log(`${divergent}개 회차가 불일치 — 읽기 방식이 틀렸거나 사이트가 바뀌었습니다.`)
      console.log('\n지금 상태로는 자동 갱신을 켜지 마세요.')
      process.exitCode = 1
    } else if (identical === 0) {
      console.log('비교할 회차가 없습니다 — 아무것도 확인되지 않았습니다.')
      process.exitCode = 1
    } else {
      console.log(`${identical}개 회차 모두 일치 — 읽기 방식이 실제 사이트와 맞습니다.`)
    }
    db.close()
    return
  }

  const dry = mode === 'recheck'
  const result = await collect(db, options.product, rangs, {
    mode,
    // `since` demande une fourchette calculée, donc généreuse. Le premier
    // 회차 que le site ne connaît pas encore met fin à la collecte : sans
    // ça, on irait frapper cent fois à une porte qui n'existe pas.
    stopWhenMissing: mode === 'since' || mode === 'all',
    pause: options.pause,
    keep: options.archive,
    dry,
    onStep: ({ rang, ok, index, total, reason }) => {
      const head = `  [${String(index + 1).padStart(String(total).length)}/${total}] ${rang}회`
      console.log(ok ? `${head}  ok` : `${head}  실패 — ${reason}`)
    },
  })

  console.log()
  if (dry) {
    for (const item of result.added) {
      console.log(`  ${item.rang}회  ${JSON.stringify(item.row)}`)
    }
    console.log('\n(recheck 모드 — 아무것도 저장하지 않았습니다)')
  } else {
    console.log(`저장 ${result.added.length} · 변화 없음 ${result.unchanged.length} · 실패 ${result.failed.length}`)
    if (result.stopped) {
      console.log(`${result.stopped}회는 아직 추첨되지 않았습니다 — 거기서 멈췄습니다.`)
    }
  }
  report(db)
  db.close()
}

function report(db) {
  console.log()
  for (const s of status(db)) {
    console.log(`  ${s.label.padEnd(14)} ${String(s.draws).padStart(5)}회 · 최신 ${s.lastRang || '—'}` +
                (s.gaps.length ? ` · 빠진 회차 ${s.gaps.length}개` : ''))
  }
}

// « Ce fichier est-il lancé directement ? » — en passant par pathToFileURL.
// Comparer à `file://${process.argv[1]}` marche sur Linux et jamais sur
// Windows. Et `process.argv[1]` est absent sous `node -e`, d'où la garde.
const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (import.meta.url === entry) main()
