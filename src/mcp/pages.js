// Les pages du site, telles que l'assistant peut les lire.
//
// Le serveur ne recalcule rien : chaque fonction d'ici appelle **le module
// que la page Svelte appelle**, et se contente de mettre en forme. C'est la
// seule garantie qui vaille — si un jour quelqu'un recopie un calcul au lieu
// de l'appeler, les tests de parité tombent.
//
// Ce qui change entre l'écran et ici, c'est la **taille**. Une page dessine
// une matrice de 1 238 × 45 ; un assistant ne peut pas la lire, et n'en a pas
// besoin. On rend donc :
//
//   — l'état complet du 회차 demandé (c'est là qu'on regarde),
//   — les agrégats de toute la tranche (c'est là qu'on compare),
//   — les dernières lignes, pour situer.
//
// Les clés sont en coréen, comme les colonnes de l'écran et de l'ancienne
// base : un assistant qui lit « 미래위치 » ne peut pas le confondre avec autre
// chose, alors que « future » invite à la paraphrase.

import { BANDS, cells as boardCells, repeats, temperatureRow } from '../core/board.js'
import { LIST_FAMILIES, listSeries } from '../core/lists.js'
import { SECTION_FAMILIES, sectionSeries } from '../core/sections.js'
import { INDICATORS, POPULATIONS, filterSeries } from '../core/filters.js'
import { FIRST_VIEWS, multipleSeries, paritySeries, recentSeries } from '../core/first.js'
import {
  HOTCOLD_FAMILIES, familyNumbers, hotColdRow, hotColdSeries,
} from '../core/hotcold.js'
import { hlBoard, hlCells, hlHistory, hlLineStats } from '../core/hl.js'
import { allCells, tableListStats } from '../core/tablelist.js'
import { deletedTallies } from '../core/deleted.js'
import {
  PATTERN_POSITIONS, bucketNumbers, lineTally, patternDigest, patternLines,
  patternTally,
} from '../core/table.js'
import {
  EXCLUDED_WINDOW, commonHistogram, excluded, excludedHitRate, expectedCommon,
  patternColumns, patternTable,
} from '../core/patterns.js'
import * as pension from '../core/pension.js'
import {
  PENSION_BANDS, PENSION_LIST_FAMILIES, PENSION_SECTION_LABELS, pensionCells,
  pensionListSeries, pensionSectionOf, pensionTemperature,
} from '../core/pension-analysis.js'
import {
  PENSION_PAGES, PLACE_WORDS, digitFrequency, distribution, hitIntervals,
  pageWindowFrequency, pensionPage, repeatTokens, sourceDigits,
} from '../core/pension-pages.js'

// ────────────────────────────────────────────────────────────── outillage

/** Les clés d'un catalogue, pour les messages d'erreur et les schémas. */
export const keys = (families) => families.map((f) => f.key)

const labelOf = (families, key) =>
  families.find((f) => f.key === key)?.label ?? key

/** Le 회차 visé — le dernier de la tranche si rien n'est demandé. */
function target(draws, rang) {
  const wanted = rang ?? draws.rangs[draws.n - 1]
  const i = draws.indexOf(wanted)          // lève si le 회차 n'existe pas
  return { rang: wanted, i }
}

/** La tranche lue, annoncée avec chaque réponse. */
export const scopeOf = (draws) => ({
  기준: `${draws.rangs[0]}–${draws.rangs[draws.n - 1]}회`,
  회차수: draws.n,
})

const head = (rows, n) => rows.slice(0, Math.max(0, n))

/** Un objet compté, tronqué à ses `n` premières entrées. */
function headObject(object, n) {
  const entries = Object.entries(object)
  if (entries.length <= n) return object
  return {
    ...Object.fromEntries(entries.slice(0, n)),
    '…': `${entries.length - n}개 생략`,
  }
}

const pick = (family, families, what) => {
  if (!families.some((f) => f.key === family)) {
    throw new RangeError(`${what} ${family} 는 없습니다 — ${keys(families).join(', ')}`)
  }
  return family
}

// ───────────────────────────────────────────────────────── 흐름 · 차뜨

/**
 * 흐름·차뜨 — l'état des quarante-cinq numéros à un 회차.
 *
 * `흐름` porte la valeur de la case telle que l'ancienne table la stockait :
 * un nombre pour l'attente, ou 당첨 / 이월 / (n)이월 pour un numéro sorti.
 */
export function board(draws, { rang = null } = {}) {
  const { rang: at, i } = target(draws, rang)
  const rows = boardCells(draws, at)
  const t = temperatureRow(rows)
  const r = repeats(rows)

  return {
    ...scopeOf(draws),
    회차: at,
    추첨일: draws.dates[i],
    당첨번호: [...draws.fullAt(i)],
    차뜨: t.spans.map((s) => ({
      구간: s.label,
      범위: s.max === Infinity ? `${s.min}+` : `${s.min}–${s.max}`,
      개수: s.count,
      번호: t.cells.filter((c) => c.band === s.key).map((c) => c.number),
    })),
    흐름: Object.fromEntries(rows.map((c) => [`${c.number}번`, c.flag ?? c.gap])),
    반복수: {
      당첨: r.won,
      이월: r.carried,
      간격별: Object.fromEntries(r.gaps.map(([g, n]) => [String(g), n])),
    },
    주의: '흐름은 마지막 출현 이후 지난 회차 수입니다. 당첨·이월은 이번 회차에 나온 번호입니다.',
  }
}

// ───────────────────────────────────────────────────────────────── 리스트

export const LIST_KEYS = keys(LIST_FAMILIES)

export function list(draws, { family = 'double', last = 10, top = 12 } = {}) {
  const key = pick(family, LIST_FAMILIES, '리스트')
  const s = listSeries(draws, key)

  return {
    ...scopeOf(draws),
    리스트: labelOf(LIST_FAMILIES, key),
    최근: head(s.rows, last).map((r) => ({
      회차: r.rang, 번호: r.numbers, 숫자수: r.count, 숫자합: r.sum,
    })),
    번호별: s.members,
    숫자수: s.counts,
    숫자합: headObject(s.sums, 40),
    조합_상위: head(s.combos, top).map((c) => ({ 조합: c.label, 횟수: c.count })),
    조합_가짓수: s.combos.length,
  }
}

// ────────────────────────────────────────────────────────────────── 구간

export const SECTION_KEYS = keys(SECTION_FAMILIES)

export function section(draws, { family = 'winner', last = 10, top = 12 } = {}) {
  const key = pick(family, SECTION_FAMILIES, '구간')
  const s = sectionSeries(draws, key)

  return {
    ...scopeOf(draws),
    구간: labelOf(SECTION_FAMILIES, key),
    칸: ['일', '십', '이십', '삼십', '사십'],
    최근: head(s.rows, last).map((r) => ({
      회차: r.rang, 칸별: r.cells, 상태: r.flags, 점멸: r.off,
    })),
    신호별: head(s.patterns, top).map((p) => ({ 상태: p.flags.join(' '), 횟수: p.count })),
    점멸횟수: s.blanks,
    점멸개수별: s.byCount,
  }
}

// ────────────────────────────────────────────────────────────────── 필터

export const FILTER_VIEWS = ['filter', ...keys(FIRST_VIEWS)]
export const POPULATION_KEYS = keys(POPULATIONS)
export const INDICATOR_KEYS = keys(INDICATORS)

export function filter(draws, base, {
  view = 'filter', population = 'first', indicator = 'total', last = 10,
} = {}) {
  const scope = scopeOf(draws)

  if (view === 'filter') {
    pick(population, POPULATIONS, '모집단')
    pick(indicator, INDICATORS, '지표')
    const s = filterSeries(draws, population, indicator)
    const total = s.series.length
    const mean = total
      ? s.series.reduce((a, x) => a + x.value, 0) / total : 0
    return {
      ...scope,
      모집단: labelOf(POPULATIONS, population),
      지표: labelOf(INDICATORS, indicator),
      그리드수: total,
      최소: s.min,
      최대: s.max,
      평균: Number(mean.toFixed(2)),
      분포: s.counts,
      최근: head(s.series, last).map((x) => ({ 회차: x.rang, 값: x.label, 번호: x.numbers })),
    }
  }

  if (view === 'multiples') {
    const s = multipleSeries(draws)
    return {
      ...scope,
      화면: '배수분석',
      이삼사오_합: s.all,
      삼사오_합: s.odd,
      삼사_합: s.pair,
      최근: head([...s.rows].reverse(), last).map((r) => ({
        회차: r.rang, 번호: r.numbers, 배수별: r.counts, AC값: r.ac,
      })),
    }
  }

  if (view === 'recent') {
    const s = recentSeries(base, draws)
    return {
      ...scope,
      화면: '10회차1등',
      주의: '이름은 10회차지만 옛 코드가 실제로 읽던 것은 14회차입니다 — 숫자를 맞추려고 14를 그대로 씁니다.',
      당첨수_분포: s.counts,
      최근: head(s.rows, last).map((r) => ({
        회차: r.rang, 번호: r.numbers, 앞회차에_있던_번호수: r.wonCount,
        소수: r.primeCount, 합성수: r.compositeCount,
      })),
    }
  }

  if (view === 'parity') {
    const s = paritySeries(draws)
    return {
      ...scope,
      화면: '홀짝저고AC',
      쌍_분포: headObject(s.counts, 45),
      최근: head(s.rows, last).map((r) => ({
        회차: r.rang, 홀짝: r.odd, 저고: r.low, AC값: r.ac,
      })),
    }
  }

  throw new RangeError(`화면 ${view} 는 없습니다 — ${FILTER_VIEWS.join(', ')}`)
}

// ─────────────────────────────────────── 차가운번호 / 뜨거운번호

export const HOTCOLD_KEYS = keys(HOTCOLD_FAMILIES)

export function hotcold(draws, { family = 'all', rang = null } = {}) {
  const key = pick(family, HOTCOLD_FAMILIES, '가족')
  const { rang: at, i } = target(draws, rang)
  const rows = allCells(draws)
  const next = i + 1 < draws.n ? draws.fullAt(i + 1) : null
  const row = hotColdRow(rows[i], key, next)
  const s = hotColdSeries(draws, key, rows)

  return {
    ...scopeOf(draws),
    가족: labelOf(HOTCOLD_FAMILIES, key),
    번호수: familyNumbers(key).length,
    회차: at,
    표: row.groups.map((g) => ({
      구간: g.label,
      범위: g.range,
      나온번호수: g.drawn,
      번호: g.entries.map((e) => ({
        번호: e.number, 흐름: e.gap, 당첨여부: e.flag ?? null,
        ...(next ? { 다음회차: e.hit } : {}),
      })),
    })),
    라인통계: s.lines.map((l) => ({
      번호: l.number, 당첨: l.won, 이월: l.carried, 꽝: l.blank,
    })),
    구간별: s.bands.map((b) => ({ 구간: b.label, 범위: b.range, 분포: b.counts })),
    주의: '저수는 1–22, 고수는 23–45입니다 — 이 페이지들만 23을 고로 셉니다.',
  }
}

// ──────────────────────────────────────────────── 테이블리스트 HL

export function hl(draws, { rang = null, kind = 'board' } = {}) {
  const cells = hlCells(draws)

  if (kind === 'stats') {
    return {
      ...scopeOf(draws),
      화면: '테이블리스트 통계',
      HL: hlLineStats(draws, cells),
      테이블리스트: (() => {
        const s = tableListStats(draws)
        return { up: s.up, down: s.down, start: s.start, middle: s.middle, end: s.end }
      })(),
      주의: 'up 은 같은 값을 가진 번호 중 앞에서 세 번째까지, down 은 그 뒤입니다.',
    }
  }

  const { rang: at, i } = target(draws, rang)
  const history = hlHistory(cells)
  const next = i + 1 < draws.n ? draws.fullAt(i + 1) : null
  const b = hlBoard(cells, i, history, next)

  return {
    ...scopeOf(draws),
    화면: '테이블리스트 HL',
    회차: at,
    당첨번호: [...draws.fullAt(i)],
    열: b.columns.map((c) => ({
      머리: c.label,
      칸: c.entries.map((e) => ({
        번호: e.number,
        흐름: e.gap,
        값: e.value,
        당첨여부: e.flag ?? null,
        미래위치: e.digits.future,
        위치합: { 당첨: e.digits.won, 이월: e.digits.carry, 꽝: e.digits.blank },
        누적: { 당첨: e.digits.wonTotal, 이월: e.digits.carryTotal, 꽝: e.digits.blankTotal },
        ...(e.mark ? { 표시: e.mark === 'low' ? '가장낮음' : '가장높음' } : {}),
        ...(next ? { 다음회차: e.hit } : {}),
      })),
    })),
    주의: '같은 미래위치를 가진 칸들 중 위치합이 가장 낮은 것과 가장 높은 것에 표시가 붙습니다 — '
      + '그것이 이 페이지가 말하려던 전부입니다.',
  }
}

// ───────────────────────────────────────────────────────────────── 테이블

export const POSITION_KEYS = PATTERN_POSITIONS.map((p) => p.key)

export function table(draws, { position = 0, rang = null, last = 30 } = {}) {
  if (!POSITION_KEYS.includes(position)) {
    throw new RangeError(`위치는 0..${POSITION_KEYS.length - 1} 입니다 (6 = 보너스)`)
  }
  const { rang: at, i } = target(draws, rang)
  const digest = patternDigest(draws, position)
  const lines = patternLines(draws, i, position)

  return {
    ...scopeOf(draws),
    화면: '테이블',
    위치: PATTERN_POSITIONS[position].label,
    회차: at,
    번호: draws.sequenceAt(i)[position],
    줄수: lines.length,
    당첨여부_전체: patternTally(digest),
    라인통계: head(lineTally(digest, i), last).map((l) => ({
      라인: l.line, 당첨여부별: l.counts, 합계: l.total,
    })),
    묶음: bucketNumbers(lines).map((b) => ({
      당첨여부: b.label,
      서로다른번호: b.distinct,
      상위: head(b.numbers, 10).map((x) => ({ 번호: x.number, 횟수: x.count })),
    })),
    주의: '당첨여부는 이 줄의 일곱 번호 중 몇 개가 **다음** 회차에 다시 나왔는지입니다. '
      + '마지막 회차에는 다음이 없으므로 모두 0입니다.',
  }
}

// ───────────────────────────────────────────────────────────────── 패턴

export function pattern(draws, { position = 0, rang = null, columns = 15 } = {}) {
  if (!POSITION_KEYS.includes(position)) {
    throw new RangeError(`위치는 0..${POSITION_KEYS.length - 1} 입니다 (6 = 보너스)`)
  }
  const { rang: at } = target(draws, rang)
  const t = patternTable(draws, position)
  const hist = commonHistogram(t)
  const expected = expectedCommon()
  const total = [...hist].reduce((a, b) => a + b, 0) || 1

  return {
    ...scopeOf(draws),
    화면: '패턴',
    위치: PATTERN_POSITIONS[position].label,
    회차: at,
    공통번호_분포: Object.fromEntries([...hist].map((n, k) => [`${k}개`, n])),
    실제_비율: Object.fromEntries(
      [...hist].map((n, k) => [`${k}개`, `${((n / total) * 100).toFixed(2)}%`])),
    // Le seul chiffre de cet écran qui dise quelque chose.
    기대_비율: Object.fromEntries(
      expected.map((p, k) => [`${k}개`, `${(p * 100).toFixed(2)}%`])),
    열별: head(patternColumns(t, at), columns).map((c) => ({
      열: c.column,
      분포: Object.fromEntries([...c.counts].map((n, k) => [`${k}개`, n])),
    })),
    주의: '실제 비율과 기대 비율이 거의 같다면, 이 화면은 무작위 추첨이 만드는 모양을 보여주는 것입니다.',
  }
}

// ─────────────────────────────────────────────────────────────── 제외번호

export function excludedPage(draws, { rang = null, window = EXCLUDED_WINDOW } = {}) {
  const { rang: at, i } = target(draws, rang)
  const rows = excluded(draws, at, { window })
  if (!rows) return { ...scopeOf(draws), 회차: at, 안내: `${window}회차 이전 자료가 부족합니다.` }

  const rate = excludedHitRate(draws, { window })
  const pool = rows.filter((r) => r.count > 0)
  const winners = rows.filter((r) => r.won)

  return {
    ...scopeOf(draws),
    화면: '제외번호',
    회차: at,
    창: `${window}회차`,
    당첨번호: [...draws.fullAt(i)],
    번호별_출현: Object.fromEntries(rows.map((r) => [`${r.number}번`, r.count])),
    제외후보: pool.length,
    당첨번호중_제외후보였던_수: winners.filter((r) => r.count > 0).length,
    검증: {
      회차수: rate.rounds,
      당첨칸수: rate.total,
      제외후보에서_나온_수: rate.hits,
      기대: Number(rate.expected.toFixed(1)),
      실제비율: `${(rate.rate * 100).toFixed(2)}%`,
      기대비율: `${(rate.expectedRate * 100).toFixed(2)}%`,
    },
    십회차_출현횟수_분포: deletedTallies(draws),
    주의: '실제비율이 기대비율과 같다면 「최근 나온 번호를 뺀다」는 규칙에는 근거가 없습니다.',
  }
}

// ──────────────────────────────────────────────────────────── 연금복권

export const PENSION_KINDS = ['home', 'flow', 'list', 'page']
export const PENSION_LIST_KEYS = keys(PENSION_LIST_FAMILIES)
export const PENSION_PAGE_KEYS = PENSION_PAGES.map((p) => p.key)

const pensionScope = (p) => ({
  기준: `${p.rangs[0]}–${p.rangs[p.n - 1]}회`,
  회차수: p.n,
})

export function pensionPages(p, {
  kind = 'home', place = 0, family = 'mult2', page = 'base',
  source = 'digits', last = 10, top = 30,
} = {}) {
  const scope = pensionScope(p)
  const i = p.n - 1

  if (kind === 'home') {
    const m = pension.compute(p)
    const sections = [0, 0, 0]
    for (let k = 0; k < p.n; k++) {
      for (const d of p.digitsAt(k)) sections[pensionSectionOf(d)]++
    }
    const places = []
    for (let q = 0; q < 6; q++) {
      const row = pensionCells(p, q)[i]
      const hit = row.find((c) => c.drawn)
      const coldest = [...row].sort((a, b) => b.gap - a.gap)[0]
      places.push({
        자리: PLACE_WORDS[q],
        나온숫자: hit.digit, 기다림: hit.gap, 당첨여부: hit.flag,
        가장오래: coldest.digit, 그기다림: coldest.gap,
      })
    }
    return {
      ...scope,
      화면: '연금복권 분석',
      회차: p.rangs[i],
      추첨일: p.dates[i],
      조: p.groups[i],
      당첨번호: [...p.digitsAt(i)],
      보너스: [...p.bonusAt(i)],
      지표: {
        총합: m.total[i], AC값: m.ac[i], 저고: m.lowHigh(i), 홀짝: m.oddEven(i),
        서로다른숫자: m.distinct[i], 이월: m.carry.values[i] ?? [],
      },
      자리별: places,
      숫자통계: digitFrequency(p, 'digits'),
      구간: Object.fromEntries(PENSION_SECTION_LABELS.map((l, k) => [l, sections[k]])),
      주의: '기대 간격은 10회입니다 — 자리마다 숫자가 열 개이기 때문입니다.',
    }
  }

  if (kind === 'flow') {
    if (!Number.isInteger(place) || place < 0 || place > 5) {
      throw new RangeError('자리는 0..5 입니다 (0 = 일)')
    }
    const cells = pensionCells(p, place, { source })
    const row = cells[i]
    return {
      ...scope,
      화면: `연금복권 흐름·차뜨 — ${PLACE_WORDS[place]} 자리`,
      회차: p.rangs[i],
      나온숫자: row.find((c) => c.drawn)?.digit,
      흐름: Object.fromEntries(row.map((c) => [`${c.digit}번`, c.flag ?? c.gap])),
      차뜨: pensionTemperature(row).map((b) => ({
        구간: b.label,
        범위: b.max === Infinity ? `${b.min}+` : `${b.min}–${b.max}`,
        숫자: b.entries.map((c) => ({ 숫자: c.digit, 흐름: c.gap })),
      })),
    }
  }

  if (kind === 'list') {
    const key = pick(family, PENSION_LIST_FAMILIES, '리스트')
    const s = pensionListSeries(p, key, { source })
    return {
      ...scope,
      화면: '연금복권 리스트',
      리스트: labelOf(PENSION_LIST_FAMILIES, key),
      최근: head(s.rows, last).map((r) => ({
        회차: r.rang, 숫자: r.digits, 숫자수: r.count, 숫자합: r.sum,
      })),
      숫자별: s.members,
      숫자수: s.counts,
      숫자합: headObject(s.sums, 40),
      조합_상위: head(s.combos, 12).map((c) => ({ 조합: c.label, 횟수: c.count })),
      주의: '0은 배수에서 빠지고 짝수에는 들어갑니다 — 앞은 셈의 약속, 뒤는 사실입니다.',
    }
  }

  if (kind === 'page') {
    const def = pensionPage(page)
    return { ...scope, ...onePage(p, def, { top, last }) }
  }

  throw new RangeError(`kind ${kind} 는 없습니다 — ${PENSION_KINDS.join(', ')}`)
}

/** Une des vingt pages 당첨번호, selon son `kind`. */
function onePage(p, def, { top, last }) {
  const src = def.source
  const label = `${def.groupLabel} › ${def.label}`
  const i = p.n - 1

  switch (def.kind) {
    case 'base':
      return {
        화면: label,
        숫자통계: digitFrequency(p, src),
        최근: lastDigits(p, src, last),
      }

    case 'positions': {
      const out = []
      for (let q = 0; q < 6; q++) {
        const counts = {}
        for (let d = 0; d < 10; d++) counts[d] = 0
        for (let k = 0; k < p.n; k++) counts[p.sourceAt(k, src)[q]]++
        out.push({ 자리: PLACE_WORDS[q], 숫자별: counts })
      }
      return { 화면: label, 자리별: out }
    }

    case 'windows':
      return {
        화면: label,
        창: `${def.size}자리`,
        상위: headObject(pageWindowFrequency(p, def.size, src), top),
      }

    case 'multiples': {
      const out = {}
      for (const key of ['mult2', 'mult3', 'mult4', 'mult5']) {
        const s = pensionListSeries(p, key, { source: src })
        out[labelOf(PENSION_LIST_FAMILIES, key)] = { 숫자수: s.counts, 숫자합: headObject(s.sums, 30) }
      }
      return { 화면: label, 배수별: out, 주의: '0은 배수에서 제외합니다.' }
    }

    case 'indicators': {
      const m = pension.compute(p)
      return {
        화면: label,
        총합: distribution(m.total),
        AC값: distribution(m.ac),
        저수: distribution(m.lowCount),
        홀수: distribution(m.oddCount),
        소수: distribution(m.primeCount),
        이월: distribution(m.carryCount.subarray(1)),
      }
    }

    case 'repeats': {
      const r = repeatTokens(p, { source: src })
      return {
        화면: label,
        반복: headObject(r.tally, top),
        반복없는회차: r.clean,
        주의: '「3:2」는 숫자 3이 한 회차에 두 번 나왔다는 뜻입니다.',
      }
    }

    case 'line':
      return {
        화면: label,
        자리: PLACE_WORDS[def.place],
        숫자별: hitIntervals(p, def.place, { source: src }).map((e) => ({
          숫자: e.digit, 출현: e.hits,
          평균간격: Number(e.mean.toFixed(2)),
          현재기다림: e.since,
          간격분포: headObject(e.counts, 20),
        })),
      }

    default:
      throw new RangeError(`page kind ${def.kind}`)
  }
}

function lastDigits(p, source, last) {
  const out = []
  for (let k = p.n - 1; k >= 0 && out.length < last; k--) {
    out.push({ 회차: p.rangs[k], 숫자: sourceDigits(p, k, source) })
  }
  return out
}

export { BANDS, PENSION_BANDS }
