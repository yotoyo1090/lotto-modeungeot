// Le serveur MCP.
//
// Il donne à un assistant l'accès aux mêmes calculs que le site — pas à une
// copie. `analysis`, `generate` et `draw` appellent `src/core/`, les
// fonctions vérifiées par les tests. Une divergence entre ce que dit le
// site et ce que dit l'assistant est donc impossible par construction.
//
// Le protocole est du JSON-RPC 2.0 en lignes, sur l'entrée et la sortie
// standard. Trois méthodes suffisent : `initialize`, `tools/list`,
// `tools/call`. Écrire ces trois-là à la main évite une dépendance, et
// surtout rend lisible ce qui se passe quand quelque chose ne marche pas.
//
// Une règle traverse tout le fichier : **rien n'écrit**. Le serveur ouvre la
// base en lecture seule et `sql` refuse tout ce qui n'est pas une lecture.
// Un assistant peut se tromper ; il ne doit pas pouvoir abîmer les données.

import { createInterface } from 'node:readline'

import { NMAX, PICK, fromRows } from '../core/draws.js'
import { MACHINES, machine, machineCounts } from '../core/machine.js'
import { orderAll, orderEach, orderTable } from '../core/order.js'
import { ACCUMULATORS, watch } from '../core/watch.js'
import { fromRows as pensionRows } from '../core/pension.js'
import * as analysis from '../core/analysis.js'
import * as metrics from '../core/metrics.js'
import * as pension from '../core/pension.js'
import * as generator from '../core/generator.js'
import * as pensionGenerator from '../core/pension-generator.js'
import { popularity, sharingBand, sharingIndex } from '../core/sharing.js'
import * as pages from './pages.js'
import {
  DEFAULT_PATH, getDraws, getMachines, getNotes, getOrder, getPension, getPrizes, getWinTypes,
  open, status,
} from '../node/db.js'

export const NAME = 'lotto'
export const VERSION = '0.1.0'
const PROTOCOL = '2024-11-05'

// ------------------------------------------------------------------ outils

const bounds = { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 }

// 분배 n'est pas un compte de numéros : ses bornes sont des réels.
const realBounds = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }

// Les écrans se lisent sur tout l'historique par défaut. `start`/`end` les
// restreignent à une tranche — le sélecteur de période du site. `last`, dans
// ces outils-là, ne coupe pas l'historique : il dit combien de lignes montrer.
const SLICE = {
  start: { type: 'integer', description: '시작 회차 (생략하면 처음부터)' },
  end: { type: 'integer', description: '끝 회차 (생략하면 마지막까지)' },
}

export const TOOLS = [
  {
    name: 'status',
    description: '데이터 상태 — 회차 수, 최신 회차, 빠진 회차, 갱신 지연. '
      + 'Toujours commencer par là : les réponses n\'ont de sens qu\'à la lumière '
      + 'de ce que la base contient réellement.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'draw',
    description: '한 회차의 당첨번호와 지표 (총합, AC값, 저고, 홀짝, 이월, 소수, 구간). '
      + 'Sans `rang`, le dernier tirage.',
    inputSchema: {
      type: 'object',
      properties: {
        product: { type: 'string', enum: ['lotto', 'pension'], default: 'lotto' },
        rang: { type: 'integer', description: '회차. 생략하면 최신 회차.' },
      },
    },
  },
  {
    name: 'analysis',
    description: '분석 — frequency (번호별 출현), flow (번호별 흐름), companions (친구), '
      + 'sections (구간), temperature (차뜨), winners (당첨번호의 온도), '
      + 'overlap (중복), positions (위치), distribution (지표 분포). '
      + 'Les résultats portent leur point de comparaison quand il en existe un.',
    inputSchema: {
      type: 'object',
      required: ['kind'],
      properties: {
        kind: {
          type: 'string',
          enum: ['frequency', 'flow', 'companions', 'sections', 'temperature',
                 'winners', 'overlap', 'positions', 'distribution'],
        },
        number: { type: 'integer', description: 'flow · companions 용 번호 1–45' },
        indicator: {
          type: 'string',
          enum: ['total', 'ac', 'carry', 'low', 'odd', 'primes', 'headSum', 'tailSum'],
          description: 'distribution 용 지표',
        },
        window: { type: 'integer', description: 'overlap 용 창 크기 (기본 14)' },
        start: { type: 'integer', description: '시작 회차' },
        end: { type: 'integer', description: '끝 회차' },
        last: { type: 'integer', description: '최근 N회만' },
        top: { type: 'integer', description: '상위 몇 개 (기본 12)' },
      },
    },
  },
  {
    name: 'generate',
    description: '조건에 맞는 조합 찾기. 8 145 060개 전체를 훑습니다. '
      + '어떤 조건도 당첨 확률을 바꾸지 않습니다 — 조합의 범위만 좁힙니다. '
      + '`sharing` (분배) 만은 확률이 아니라 **분배**를 다룹니다 : 같은 조합을 '
      + '고른 사람 수의 지표입니다. 1 = 평균, 0.86 = 가장 적게 팔리는 형태.',
    inputSchema: {
      type: 'object',
      properties: {
        product: { type: 'string', enum: ['lotto', 'pension'], default: 'lotto' },
        total: bounds, ac: bounds, low: bounds, odd: bounds,
        primes: bounds, composites: bounds, headSum: bounds, tailSum: bounds,
        sharing: {
          ...realBounds,
          description: '분배 지표 [최소, 최대]. 0.857–1.848. '
            + '[0, 0.90] = 적게 팔린 형태만 (당첨 확률은 그대로, 분배만 유리)',
        },
        include: { type: 'array', items: { type: 'integer' }, description: '고정수' },
        exclude: { type: 'array', items: { type: 'integer' }, description: '제외수' },
        sample: { type: 'integer', description: '무작위로 몇 개 (기본 10)' },
        seed: { type: 'integer', description: '같은 시드는 같은 결과' },
      },
    },
  },
  {
    name: 'sql',
    description: '데이터베이스에 직접 SELECT. 읽기 전용 — 그 외는 거부됩니다. '
      + 'Vues utiles : draw_numbers, pension_digits (번호를 행으로 펼침). '
      + 'Tables : draws, pension, prizes, win_types (1등 자동·수동·반자동), draw_notes, '
      + 'machines (추첨기 호기, 262회~), ball_order (공나온 순서 o1…o6, 468회~), crawl_log.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'SELECT 또는 WITH 로 시작하는 문장' },
        limit: { type: 'integer', description: '최대 행 수 (기본 200)' },
      },
    },
  },

  // ── Les écrans du site. Chaque outil appelle le module que la page appelle,
  //    donc les chiffres sont ceux de l'écran, sans recalcul.

  {
    name: 'board',
    description: '흐름·차뜨 — 한 회차의 45개 번호 상태. 흐름 (마지막 출현 이후 회차 수), '
      + '차뜨 (뜨거운·중간·차가운·사망 네 구간), 반복 수. Sans `rang`, le dernier tirage.',
    inputSchema: {
      type: 'object',
      properties: {
        rang: { type: 'integer', description: '회차. 생략하면 최신 회차.' },
        ...SLICE,
      },
    },
  },
  {
    name: 'list',
    description: `리스트 — 열한 가족 (${pages.LIST_KEYS.join(' · ')}). `
      + '회차별 번호, 번호별 출현, 숫자수·숫자합 분포, 자주 나온 조합.',
    inputSchema: {
      type: 'object',
      properties: {
        family: { type: 'string', enum: pages.LIST_KEYS, default: 'double' },
        last: { type: 'integer', description: '최근 몇 회차를 보일지 (기본 10)' },
        top: { type: 'integer', description: '조합 상위 몇 개 (기본 12)' },
        ...SLICE,
      },
    },
  },
  {
    name: 'section',
    description: `구간 — 일·십·이십·삼십·사십 다섯 칸. 가족 (${pages.SECTION_KEYS.join(' · ')}) `
      + '별로 있음/점멸 신호, 칸별 점멸 횟수, 점멸 개수 분포.',
    inputSchema: {
      type: 'object',
      properties: {
        family: { type: 'string', enum: pages.SECTION_KEYS, default: 'winner' },
        last: { type: 'integer' }, top: { type: 'integer' },
        ...SLICE,
      },
    },
  },
  {
    name: 'filter',
    description: '필터 — 모집단 × 지표의 분포 (view=filter), 또는 배수분석 (multiples) · '
      + '10회차1등 (recent) · 홀짝저고AC (parity).',
    inputSchema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: pages.FILTER_VIEWS, default: 'filter' },
        population: { type: 'string', enum: pages.POPULATION_KEYS, default: 'first' },
        indicator: { type: 'string', enum: pages.INDICATOR_KEYS, default: 'total' },
        last: { type: 'integer' },
        ...SLICE,
      },
    },
  },
  {
    name: 'hotcold',
    description: `차가운번호/뜨거운번호 — 가족 (${pages.HOTCOLD_KEYS.join(' · ')}) 별로 `
      + '네 구간에 번호를 늘어놓은 표, 번호별 당첨·이월·꽝, 구간별 분포. '
      + '이 화면에서만 저수는 1–22, 고수는 23–45입니다.',
    inputSchema: {
      type: 'object',
      properties: {
        family: { type: 'string', enum: pages.HOTCOLD_KEYS, default: 'all' },
        rang: { type: 'integer' },
        ...SLICE,
      },
    },
  },
  {
    name: 'hl',
    description: '테이블리스트 HL — 한 회차의 카드 (kind=board) : 당첨 열과 흐름별 열, '
      + '칸마다 미래위치와 위치합, 같은 미래위치 안에서 가장 낮은/높은 칸의 표시. '
      + 'kind=stats 는 HL과 테이블리스트의 라인 통계.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['board', 'stats'], default: 'board' },
        rang: { type: 'integer' },
        ...SLICE,
      },
    },
  },
  {
    name: 'table',
    description: '테이블 — 한 위치 (0=일 … 5=육, 6=보너스) 의 번호를 담은 지난 회차들. '
      + '라인 통계, 당첨여부 분포, 0·1·2·3·>4 묶음별 번호.',
    inputSchema: {
      type: 'object',
      properties: {
        position: { type: 'integer', description: '0..6 (6 = 보너스)', default: 0 },
        rang: { type: 'integer' },
        last: { type: 'integer', description: '라인 몇 줄 (기본 30)' },
        ...SLICE,
      },
    },
  },
  {
    name: 'pattern',
    description: '패턴 — 공통 번호의 분포와 그 **기대 분포** (초기하분포). '
      + '둘이 같으면 이 화면은 무작위가 만드는 모양을 보여주는 것입니다.',
    inputSchema: {
      type: 'object',
      properties: {
        position: { type: 'integer', description: '0..6', default: 0 },
        rang: { type: 'integer' },
        columns: { type: 'integer', description: '열 몇 개 (기본 15)' },
        ...SLICE,
      },
    },
  },
  {
    name: 'excluded',
    description: '제외번호 — 최근 N회차에 나온 번호와, 그 규칙이 실제로 맞는지의 검증 '
      + '(실제 비율 대 기대 비율). 십회차 출현횟수 분포도 함께.',
    inputSchema: {
      type: 'object',
      properties: {
        rang: { type: 'integer' },
        window: { type: 'integer', description: '창 크기 (기본 10)' },
        ...SLICE,
      },
    },
  },
  {
    name: 'pension',
    description: '연금복권 720+ 의 화면들. kind=home (분석) · flow (자리별 흐름·차뜨) · '
      + `list (리스트 ${pages.PENSION_LIST_KEYS.length}가족) · page (당첨번호 20페이지). `
      + `page 키 : ${pages.PENSION_PAGE_KEYS.join(' · ')}`,
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: pages.PENSION_KINDS, default: 'home' },
        place: { type: 'integer', description: 'flow 용 자리 0..5 (0 = 일)' },
        family: { type: 'string', enum: pages.PENSION_LIST_KEYS, description: 'list 용 가족' },
        page: { type: 'string', enum: pages.PENSION_PAGE_KEYS, description: 'page 용 키' },
        source: { type: 'string', enum: ['digits', 'bonus', 'both'], default: 'digits' },
        last: { type: 'integer' }, top: { type: 'integer' },
      },
    },
  },
  {
    name: 'machine',
    description: '추첨기별 — 세 대의 비너스 추첨기(1·2·3호기, 262회부터)는 같은 우연인가. '
      + 'kind=counts (추첨기별 공나온수 : 호기 × 45개 번호) · uniform (호기별 45개 균등성 χ², 기준 0.05/3) · '
      + 'same (3×45 동질성) · guess (번호 6개로 호기 맞히기, walk-forward, 대조군은 최다 호기) · all (넷 다). '
      + 'Étiquettes hors données officielles — 회차 sans étiquette ignorés.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['all', 'counts', 'uniform', 'same', 'guess'], default: 'all' },
        ...SLICE,
      },
    },
  },
  {
    name: 'order',
    description: '공나온 순서 — 공이 너무 일찍, 또는 너무 늦게 나오는가 (468회부터, 정렬이 지우는 정보). '
      + 'kind=table (45개 번호 × 6자리 : 몇 번째로 나왔는지) · each (번호별 6자리 균등성 χ², df 5, 기준 0.05/45) · '
      + 'all (45개 χ²의 합, df 225 — 한 숫자로 된 질문) · full (셋 다). '
      + 'Hasard pur : chaque numéro sorti occupe chaque position avec 1/6. Le bonus n\'entre pas.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['full', 'table', 'each', 'all'], default: 'full' },
        top: { type: 'integer', description: 'each 용 — p가 가장 작은 번호 몇 개 (기본 전부)' },
        ...SLICE,
      },
    },
  },
  {
    name: 'watch',
    description: `감시 — 추첨기는 이번 주에도 제대로 뽑고 있는가. CUSUM 누적기 ${ACCUMULATORS}개 `
      + '(freq 번호 빈도 45 · order 공 나온 자리 45 · machine 추첨기별 빈도 135 · carry 이월 1), '
      + '전체 이력을 매번 다시 재생. 세 상태 : ok (세 절반 이하) · watch (절반 이상) · alarm (세 이상). '
      + 'h 는 10년에 거짓경보 1회 기준 — ×2 결함은 평균 2.5년, 공 자리 결함은 9년 뒤에 잡히는 느린 검출기. '
      + 'kind=summary (넷의 상태·최악 누적기) · freq · order · machine · carry (누적기별, 값 큰 순, `top`).',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['summary', 'freq', 'order', 'machine', 'carry'], default: 'summary' },
        top: { type: 'integer', description: '누적기 몇 개 (기본 10)' },
      },
    },
  },
]

// --------------------------------------------------------------- exécution

/** Ouvre la base et prépare les vues du noyau. Rien n'est mis en cache. */
function load(db, { start = null, end = null, last = null } = {}) {
  const draws = fromRows(getDraws(db, { start, end, limit: last }))
  return draws
}

const table = (rows) => JSON.stringify(rows, null, 1)

export function call(db, name, args = {}) {
  switch (name) {
    case 'status': {
      return table(status(db).map((s) => ({
        제품: s.label,
        회차수: s.draws,
        최신회차: s.lastRang,
        최신추첨일: s.lastDate,
        갱신지연_주: s.staleWeeks,
        빠진회차: s.gaps.length,
        빠진회차_목록: s.gaps.slice(0, 20),
      })))
    }

    case 'draw': {
      if ((args.product ?? 'lotto') === 'pension') return pensionDraw(db, args.rang)
      const rows = getDraws(db)
      if (!rows.length) return '데이터가 없습니다.'
      const rang = args.rang ?? rows.at(-1).rang
      const draws = fromRows(rows)
      let i
      try { i = draws.indexOf(rang) } catch { return `${rang}회는 없습니다.` }
      const m = metrics.compute(draws)
      return table({
        회차: rang,
        추첨일: draws.dates[i],
        당첨번호: [...draws.numbersAt(i)],
        보너스: draws.bonus[i],
        총합: m.total[i],
        AC값: m.ac[i],
        저고: m.lowHigh(i),
        홀짝: m.oddEven(i),
        이월번호: m.carry.numbers[i] ?? [],
        이월위치: m.carry.positions[i] ?? [],
        소수: { 개수: m.primeCount[i], 합: m.primeSum[i] },
        합성수: { 개수: m.compositeCount[i], 합: m.compositeSum[i] },
        앞자리수합: m.headSum[i],
        끝자리수합: m.tailSum[i],
        구간: m.sectionsAt(i),
        등수별: getPrizes(db, rang),
        일등_선택방식: getWinTypes(db, rang),
        추첨기: getMachines(db).get(rang) ?? null,
        공나온_순서: getOrder(db, { start: rang, end: rang }).get(rang) ?? null,
        비고: getNotes(db, rang),
      })
    }

    case 'analysis':
      return analyse(db, args)

    case 'generate':
      return build(args)

    case 'sql':
      return query(db, args)

    // Les écrans. `screen` charge la tranche une fois et passe la main au
    // module que la page Svelte utilise — aucun calcul ne vit ici.
    case 'board': case 'list': case 'section': case 'filter':
    case 'hotcold': case 'hl': case 'table': case 'pattern': case 'excluded':
      return screen(db, name, args)

    case 'pension':
      return pensionScreen(db, args)

    case 'machine':
      return machineScreen(db, args)

    case 'order':
      return orderScreen(db, args)

    case 'watch':
      return watchScreen(db, args)

    default:
      throw new Error(`알 수 없는 도구 : ${name}`)
  }
}

/**
 * Un écran du 6/45.
 *
 * `10회차1등` a besoin de l'historique **entier** en plus de la tranche : les
 * voisins d'un 회차 ne sont pas ceux de la tranche. Il est le seul, et c'est
 * pour lui qu'on charge `base`.
 */
function screen(db, name, args) {
  const { start = null, end = null } = args
  const draws = load(db, { start, end })
  if (draws.n === 0) return '해당 구간에 회차가 없습니다.'
  const base = start === null && end === null ? draws : load(db)

  switch (name) {
    case 'board': return table(pages.board(draws, args))
    case 'list': return table(pages.list(draws, args))
    case 'section': return table(pages.section(draws, args))
    case 'filter': return table(pages.filter(draws, base, args))
    case 'hotcold': return table(pages.hotcold(draws, args))
    case 'hl': return table(pages.hl(draws, args))
    case 'table': return table(pages.table(draws, args))
    case 'pattern': return table(pages.pattern(draws, args))
    case 'excluded': return table(pages.excludedPage(draws, args))
    default: throw new Error(`알 수 없는 화면 : ${name}`)
  }
}

/**
 * 추첨기별. Les étiquettes viennent de la table `machines` ; le calcul est
 * celui de la page Svelte (core/machine.js), rien n'est refait ici.
 * `counts` est la matière brute — 추첨기별 공나온수 — que les trois tests résument.
 */
function machineScreen(db, { kind = 'all', start = null, end = null } = {}) {
  const hogi = getMachines(db)
  if (!hogi.size) return '추첨기 정보가 없습니다 — npm run crawl -- hogi 를 먼저 실행하세요.'
  const draws = load(db, { start, end })
  if (draws.n === 0) return '해당 구간에 회차가 없습니다.'

  const labelled = draws.rangs.filter((r) => hogi.has(r))
  const out = {
    라벨_회차: labelled.length,
    라벨_범위: labelled.length ? [labelled[0], labelled.at(-1)] : [],
  }
  const wants = (k) => kind === 'all' || kind === k

  if (wants('counts')) {
    const counts = machineCounts(draws, hogi)
    out.추첨기별_공나온수 = MACHINES.map((m) => {
      const cell = counts.get(m)
      const 번호별 = {}
      for (let n = 1; n <= NMAX; n++) 번호별[n] = cell.numbers[n]
      return { 호기: m, 회차: cell.draws, 번호당_기대: +(cell.draws * PICK / NMAX).toFixed(1), 번호별 }
    })
  }
  if (kind !== 'counts') {
    const r = machine(draws, hogi)
    if (wants('uniform')) {
      out.호기별_균등성 = {
        기준: +(0.05 / MACHINES.length).toFixed(4),
        호기: r.uniform.map((u) => ({ 호기: u.machine, 회차: u.draws, chi2: +u.chi2.toFixed(1), df: u.df, p: +u.p.toFixed(4) })),
      }
    }
    if (wants('same')) {
      out.세_추첨기_동질성 = { chi2: +r.same.chi2.toFixed(1), df: r.same.df, p: +r.same.p.toFixed(4), 회차: r.same.draws }
    }
    if (wants('guess')) {
      out.호기_맞히기 = {
        시험: r.guess.tested, 적중: r.guess.hits,
        적중률: +r.guess.accuracy.toFixed(4), 대조군: +r.guess.baseline.toFixed(4), z: +r.guess.z.toFixed(2),
      }
    }
  }
  out.주의 = '이 화면은 아무것도 예측하지 않습니다 — 세 기계가 같은 우연인지를 묻는 검정입니다.'
  return table(out)
}

/**
 * 공나온 순서. La table `ball_order` seule suffit — core/order.js ne lit pas
 * `draws`. La tranche se fait dans la requête, pas après.
 */
function orderScreen(db, { kind = 'full', top = null, start = null, end = null } = {}) {
  const orderMap = getOrder(db, { start, end })
  if (!orderMap.size) {
    return start === null && end === null
      ? '공나온 순서 정보가 없습니다 — npm run crawl -- order 를 먼저 실행하세요.'
      : '해당 구간에 순서 정보가 없습니다.'
  }
  const t = orderTable(orderMap)
  const rangs = [...orderMap.keys()]
  const out = { 회차수: t.draws, 범위: [rangs[0], rangs.at(-1)] }
  const wants = (k) => kind === 'full' || kind === k

  if (wants('table')) {
    const 번호별 = {}
    for (let n = 1; n <= NMAX; n++) 번호별[n] = Array.from(t.positions[n].subarray(1))
    out.자리별_공나온수 = { 자리: '1번째…6번째', 번호별 }
  }
  if (wants('each')) {
    let rows = orderEach(t).map((r) => ({
      번호: r.number, 나온수: r.total, 평균자리: +r.mean.toFixed(2),
      chi2: +r.chi2.toFixed(1), df: r.df, p: +r.p.toFixed(4),
    }))
    if (top) rows = rows.sort((a, b) => a.p - b.p).slice(0, top)
    out.번호별_균등성 = { 기준: +(0.05 / NMAX).toFixed(4), 번호: rows }
  }
  if (wants('all')) {
    const a = orderAll(t)
    out.전체_균등성 = { chi2: +a.chi2.toFixed(1), df: a.df, p: +a.p.toFixed(4), 회차: a.draws }
  }
  out.주의 = '이 화면은 아무것도 예측하지 않습니다 — 공이 나온 자리가 무작위와 구별되는지를 묻는 검정입니다.'
  return table(out)
}

/**
 * 감시. Toujours l'historique entier — un CUSUM est un état rejoué depuis
 * le début, une tranche n'aurait pas de sens. Les courbes (`trail`) restent
 * à l'écran ; ici on rend l'état du jour.
 */
function watchScreen(db, { kind = 'summary', top = 10 } = {}) {
  const draws = load(db)
  if (draws.n === 0) return '데이터가 없습니다.'
  const w = watch(draws, { order: getOrder(db), hogi: getMachines(db) })
  const KEYS = ['freq', 'order', 'machine', 'carry']
  const STATE = { ok: '정상', watch: '주의', alarm: '경보' }
  const row = (r) => ({
    누적기: r.label, 값: +r.value.toFixed(2), 세_대비: +r.ratio.toFixed(2), 상태: STATE[r.state],
    위: +r.hi.toFixed(2), 아래: +r.lo.toFixed(2), 최고: +r.peak.toFixed(2), 최고_회차: r.peakAt,
  })
  const head = (s) => ({
    감시: s.label, 누적기수: s.rows.length, 세_h: +s.h.toFixed(2), 여유_k: +s.k.toFixed(3),
    평균_검출_주: Math.round(s.delay), 상태: STATE[s.state],
    주의: s.rows.filter((r) => r.state === 'watch').length,
    경보: s.rows.filter((r) => r.state === 'alarm').length,
  })

  if (kind === 'summary') {
    return table({
      최신회차: w.rangs.at(-1),
      누적기_총수: ACCUMULATORS,
      감시별: KEYS.map((k) => ({ ...head(w[k]), 최악: row(w[k].worst) })),
      주의: '10년에 거짓경보 1회로 보정된 느린 검출기입니다 — 정상은 「큰 결함 없음」이지 「결함 없음」이 아닙니다.',
    })
  }
  const s = w[kind]
  return table({ 최신회차: w.rangs.at(-1), ...head(s), 누적기: s.rows.slice(0, top).map(row) })
}

function pensionScreen(db, args) {
  const rows = getPension(db)
  if (!rows.length) return '연금복권 데이터가 없습니다.'
  return table(pages.pensionPages(pensionRows(rows), args))
}

function pensionDraw(db, wanted) {
  const rows = getPension(db)
  if (!rows.length) return '연금복권 데이터가 없습니다.'
  const p = pensionRows(rows)
  const rang = wanted ?? p.rangs[p.n - 1]
  let i
  try { i = p.indexOf(rang) } catch { return `${rang}회는 없습니다.` }
  const m = pension.compute(p)
  return table({
    회차: rang,
    추첨일: p.dates[i],
    조: p.groups[i],
    당첨번호: [...p.digitsAt(i)],
    '2등번호': [...p.bonusAt(i)],
    총합: m.total[i],
    AC값: m.ac[i],
    저고: m.lowHigh(i),
    홀짝: m.oddEven(i),
    이월: m.carry.values[i] ?? [],
    서로다른숫자: m.distinct[i],
    중복숫자: m.repeats[i],
  })
}

function analyse(db, args) {
  const draws = load(db, args)
  if (draws.n === 0) return '해당 구간에 회차가 없습니다.'
  const scope = { 기준: `${draws.rangs[0]}–${draws.rangs[draws.n - 1]}회`, 회차수: draws.n }

  switch (args.kind) {
    case 'frequency': {
      const counts = analysis.frequency(draws)
      // Le point de comparaison, systématiquement : un numéro devrait sortir
      // 6/45 des tirages. Sans lui, tout écart paraît remarquable.
      const expected = (draws.n * 6) / 45
      const rows = Object.entries(counts)
        .map(([n, c]) => ({ 번호: Number(n), 출현: c, 기대: Number(expected.toFixed(1)),
                            차이: Number((c - expected).toFixed(1)) }))
        .sort((a, b) => b.출현 - a.출현)
      return table({ ...scope, 기대값: Number(expected.toFixed(1)), 번호별: rows })
    }

    case 'flow': {
      if (!args.number) throw new Error('flow 에는 number 가 필요합니다')
      const s = analysis.flowSummary(draws, args.number)
      return table({ ...scope, 번호: s.number, 출현: s.hits, 현재흐름: s.currentGap,
                     평균간격: s.gapMean, 이론간격: Number((45 / 7).toFixed(2)),
                     최장간격: s.gapMax, 간격분포: s.gapHistogram })
    }

    case 'companions': {
      if (!args.number) throw new Error('companions 에는 number 가 필요합니다')
      const friends = analysis.companionsOf(draws, args.number, args.top ?? 12)
      const rows = friends.pairs.map((x) => ({
        번호: x.number,
        동반: x.together,
        비율: `${(x.share * 100).toFixed(1)}%`,
        차이: Number((x.together - friends.expected).toFixed(1)),
      }))
      return table({ ...scope, 번호: args.number, 출현: friends.hits,
                     기대값: Number(friends.expected.toFixed(1)), 친구: rows })
    }

    case 'sections':
      return table({ ...scope, 신호별빈도: analysis.sectionSignatures(draws) })

    case 'temperature': {
      const gaps = analysis.gaps(draws)
      const width = 46
      const base = (draws.n - 1) * width
      const rows = []
      for (let k = 1; k <= 45; k++) rows.push({ 번호: k, 흐름: gaps[base + k] })
      rows.sort((a, b) => a.흐름 - b.흐름)
      return table({ ...scope, 기준회차: draws.rangs[draws.n - 1], 번호별흐름: rows })
    }

    case 'winners': {
      const winners = analysis.temperatureOfWinners(draws)
      const bands = analysis.temperature(draws)
      const names = ['핫', '미들', '콜드', '데드']
      const got = [0, 0, 0, 0]
      const pool = [0, 0, 0, 0]
      for (let i = 1; i < draws.n; i++) {
        for (let b = 0; b < 4; b++) got[b] += winners[i * 4 + b]
        for (let k = 1; k <= 45; k++) {
          const band = bands[(i - 1) * 46 + k]
          if (band >= 0) pool[band]++
        }
      }
      const drawn = got.reduce((a, b) => a + b, 0) || 1
      const available = pool.reduce((a, b) => a + b, 0) || 1
      return table({
        ...scope,
        주의: '핫 번호가 당첨을 더 많이 내는 것은 핫 번호의 수가 더 많기 때문입니다. '
          + '비교해야 할 것은 「기대」 열입니다.',
        구간별: names.map((name, b) => ({
          구간: name,
          비중: `${((got[b] / drawn) * 100).toFixed(1)}%`,
          기대: `${((pool[b] / available) * 100).toFixed(1)}%`,
        })),
      })
    }

    case 'overlap': {
      const window = args.window ?? 14
      const values = analysis.overlap(draws, window)
      return table({ ...scope, 창: window,
                     평균: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)),
                     분포: analysis.distribution(values.subarray(1)) })
    }

    case 'positions':
      return table({ ...scope, 위치별: analysis.positions(draws) })

    case 'distribution': {
      const m = metrics.compute(draws)
      const columns = {
        total: m.total, ac: m.ac, carry: m.carryCount.subarray(1),
        low: m.lowCount, odd: m.oddCount, primes: m.primeCount,
        headSum: m.headSum, tailSum: m.tailSum,
      }
      const column = columns[args.indicator ?? 'total']
      if (!column) throw new Error(`지표 ${args.indicator} 는 없습니다`)
      return table({ ...scope, 지표: args.indicator ?? 'total',
                     분포: analysis.distribution(column) })
    }

    default:
      throw new Error(`분석 ${args.kind} 는 없습니다`)
  }
}

function build(args) {
  const { product = 'lotto', sample = 10, seed = 2026, ...rest } = args
  const isPension = product === 'pension'
  const engine = isPension ? pensionGenerator : generator
  const filters = {}
  for (const [key, value] of Object.entries(rest)) {
    if (value === null || value === undefined) continue
    // 분배 se lit sur six numéros parmi 45 : le 연금복권 tire des chiffres,
    // pas des numéros, et le modèle n'y veut rien dire. On l'écarte plutôt
    // que de le laisser filer vers un générateur qui l'ignorerait en silence.
    if (isPension && key === 'sharing') continue
    filters[key] = value
  }
  const result = engine.generate(filters, { sample, seed })
  const rows = isPension ? engine.toTickets(result) : engine.toArrays(result)
  return table({
    조건에_맞는_조합: result.kept,
    전체: result.candidates,
    비율: `${((result.kept / (result.candidates || 1)) * 100).toFixed(3)}%`,
    걸린시간_ms: Number(result.elapsedMs.toFixed(0)),
    제외된_조건: result.rejected,
    시드: seed,
    // `조합` garde sa forme — six numéros par ligne. L'indice va à côté, en
    // parallèle : ajouter une clé ne casse personne, changer la forme si.
    조합: rows,
    ...(isPension ? {} : {
      분배: rows.map((g) => ({
        지표: Number(sharingIndex(g).toFixed(3)),
        팔린정도: sharingBand(sharingIndex(g)).label,
        // Pourquoi : chez ceux qui choisissent leurs numéros (수동), cette
        // forme est cochée `인기도` fois plus qu'une grille moyenne.
        인기도_수동: Number(popularity(g).toFixed(2)),
      })),
    }),
    주의: '어떤 조건도 당첨 확률을 바꾸지 않습니다. '
      + '분배는 확률이 아니라 나눠 갖는 사람 수를 말합니다.',
  })
}

// Une lecture, et rien d'autre. Le point-virgule est refusé pour qu'une
// seconde instruction ne puisse pas se glisser derrière la première.
const READ_ONLY = /^\s*(select|with)\b/i
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum)\b/i

function query(db, { query: sql, limit = 200 }) {
  const text = String(sql ?? '').trim().replace(/;\s*$/, '')
  if (!READ_ONLY.test(text)) return 'SELECT 또는 WITH 로 시작하는 문장만 실행합니다.'
  if (FORBIDDEN.test(text)) return '읽기 전용입니다 — 데이터를 바꾸는 문장은 실행하지 않습니다.'
  if (text.includes(';')) return '한 번에 한 문장만 실행합니다.'

  const rows = db.prepare(text).all()
  const shown = rows.slice(0, limit)
  return table({
    행수: rows.length,
    표시: shown.length,
    결과: shown,
    ...(rows.length > shown.length ? { 안내: `${rows.length - shown.length}행 생략` } : {}),
  })
}

// ------------------------------------------------------------- le protocole

export function handle(db, message) {
  const { id, method, params } = message

  // Une notification n'attend pas de réponse : `initialized` en est une.
  if (id === undefined || id === null) return null

  const reply = (result) => ({ jsonrpc: '2.0', id, result })

  try {
    switch (method) {
      case 'initialize':
        return reply({
          protocolVersion: PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: { name: NAME, version: VERSION },
        })
      case 'ping':
        return reply({})
      case 'tools/list':
        return reply({ tools: TOOLS })
      case 'tools/call': {
        const text = call(db, params?.name, params?.arguments ?? {})
        return reply({ content: [{ type: 'text', text }] })
      }
      default:
        return {
          jsonrpc: '2.0', id,
          error: { code: -32601, message: `알 수 없는 메서드 : ${method}` },
        }
    }
  } catch (error) {
    // Une erreur d'outil se rend **dans** le résultat, pas comme une erreur
    // de protocole : l'assistant doit pouvoir la lire et corriger sa demande.
    if (method === 'tools/call') {
      return reply({ content: [{ type: 'text', text: `오류 : ${error.message}` }],
                     isError: true })
    }
    return { jsonrpc: '2.0', id, error: { code: -32603, message: error.message } }
  }
}

export function serve({ path = DEFAULT_PATH, input = process.stdin,
                        output = process.stdout } = {}) {
  const db = open(path, { readOnly: true })
  const lines = createInterface({ input, terminal: false })

  lines.on('line', (line) => {
    const text = line.trim()
    if (!text) return
    let message
    try {
      message = JSON.parse(text)
    } catch {
      output.write(`${JSON.stringify({
        jsonrpc: '2.0', id: null,
        error: { code: -32700, message: 'JSON 파싱 실패' },
      })}\n`)
      return
    }
    const response = handle(db, message)
    if (response) output.write(`${JSON.stringify(response)}\n`)
  })

  lines.on('close', () => db.close())
  return { db, lines }
}
