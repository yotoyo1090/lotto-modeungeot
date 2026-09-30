// L'état de santé, en une commande.
//
//   node --experimental-sqlite tools/doctor.js
//
// Trois questions, dans l'ordre où elles comptent :
//
//   1. Les données sont-elles **complètes** ? Un trou dans l'historique
//      fausse les écarts et les moyennes sans qu'aucun test ne s'en aperçoive.
//   2. Sont-elles **à jour** ? Un tirage manquant depuis trois semaines veut
//      dire que la tâche planifiée ne tourne plus.
//   3. La dernière mise à jour s'est-elle **bien passée** ? Le journal des
//      passages le dit, sans avoir à en relancer un.
//
// Chaque défaut est accompagné de la commande qui le répare. Un diagnostic
// qui laisse chercher la solution n'a fait que la moitié du travail.

import { existsSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { DEFAULT_PATH, PRODUCTS, lastCrawls, open, status } from '../src/node/db.js'
import { OUT } from './build.js'

const OK = '  ok  '
const WARN = ' 확인 '
const BAD = ' 문제 '

export function diagnose(db, { today = new Date(), out = OUT } = {}) {
  const findings = []
  const note = (level, title, detail, fix = null) =>
    findings.push({ level, title, detail, fix })

  for (const s of status(db, today)) {
    if (s.draws === 0) {
      note(BAD, `${s.label} — 데이터 없음`, '한 회차도 저장되어 있지 않습니다',
        `npm run crawl -- all --product ${s.product}`)
      continue
    }

    note(OK, `${s.label} — ${s.draws}회`,
      `최신 ${s.lastRang}회 (${s.lastDate})`)

    if (s.gaps.length) {
      const shown = s.gaps.slice(0, 10).join(', ')
      note(BAD, `${s.label} — 빠진 회차 ${s.gaps.length}개`,
        `${shown}${s.gaps.length > 10 ? ' …' : ''}`,
        `npm run crawl -- missing --product ${s.product}`)
    }

    // Le 6/45 sort chaque samedi, le 연금복권 chaque jeudi : au-delà de deux
    // semaines sans nouveau tirage, ce n'est plus un retard, c'est une panne.
    if (s.staleWeeks !== null && s.staleWeeks >= 2) {
      note(s.staleWeeks >= 4 ? BAD : WARN,
        `${s.label} — ${s.staleWeeks}주째 갱신 없음`,
        `마지막 추첨일 ${s.lastDate}`,
        `npm run crawl -- since --product ${s.product}`)
    }
  }

  // Le journal des passages : ce qui s'est réellement produit la dernière
  // fois, y compris les échecs silencieux d'une tâche planifiée.
  const passes = lastCrawls(db, 5)
  if (!passes.length) {
    note(WARN, '수집 기록 없음',
      '아직 한 번도 수집을 실행하지 않았습니다 (가져오기만 했다면 정상)')
  } else {
    const latest = passes[0]
    const when = latest.at.slice(0, 16).replace('T', ' ')
    if (latest.failed > 0) {
      note(BAD, '마지막 수집에 실패가 있었습니다',
        `${when} · ${latest.product} · 실패 ${latest.failed}건${latest.detail ? ` — ${latest.detail}` : ''}`,
        `npm run crawl -- missing --product ${latest.product}`)
    } else {
      note(OK, '마지막 수집',
        `${when} · ${latest.product} · 저장 ${latest.added}건`)
    }
  }

  // Les fichiers du site : régénérés par `build:data`, et donc capables
  // d'être en retard sur la base sans que rien ne le signale.
  const meta = `${out}/meta.json`
  if (!existsSync(meta)) {
    note(WARN, '사이트 데이터 파일 없음',
      '웹 화면이 데이터를 불러오지 못합니다', 'npm run build:data')
  } else {
    const built = statSync(meta).mtime
    const dbTime = existsSync(DEFAULT_PATH) ? statSync(DEFAULT_PATH).mtime : null
    if (dbTime && built < dbTime) {
      note(WARN, '사이트 데이터가 오래되었습니다',
        `데이터베이스가 ${dbTime.toISOString().slice(0, 16).replace('T', ' ')}에 더 최신입니다`,
        'npm run build:data')
    } else {
      note(OK, '사이트 데이터',
        `${built.toISOString().slice(0, 16).replace('T', ' ')} 생성`)
    }
  }

  return findings
}

function main() {
  const path = process.argv[2] ?? DEFAULT_PATH
  if (!existsSync(path)) {
    console.error(`데이터베이스가 없습니다 : ${path}`)
    console.error('  npm run import -- <옛 db.sqlite3 경로>')
    process.exitCode = 1
    return
  }

  const db = open(path)
  const findings = diagnose(db)
  db.close()

  console.log()
  for (const f of findings) {
    console.log(`[${f.level}] ${f.title}`)
    if (f.detail) console.log(`        ${f.detail}`)
    if (f.fix) console.log(`        → ${f.fix}`)
  }

  const bad = findings.filter((f) => f.level === BAD).length
  const warn = findings.filter((f) => f.level === WARN).length
  console.log()
  if (bad) {
    console.log(`문제 ${bad}건${warn ? ` · 확인 ${warn}건` : ''} — 위의 명령을 실행하세요.`)
    process.exitCode = 1
  } else if (warn) {
    console.log(`확인 ${warn}건 — 치명적이지는 않습니다.`)
  } else {
    console.log('모두 정상입니다.')
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (import.meta.url === entry) main()
