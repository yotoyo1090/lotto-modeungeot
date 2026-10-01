<script>
  // L'onglet 자동조합.
  //
  // Il remplace `combinaison/views.py::testallconbinasiom` — 24 champs, une
  // boucle sur C(vivier, 6 − 고정수), quatorze filtres — et son écran de
  // résultats. L'original émettait une requête SQL **par combinaison** :
  // jusqu'à 8,1 millions pour une recherche large. Ici le calcul tient dans
  // un fil séparé et ne touche à rien.
  //
  // Une chose a changé volontairement, et elle est écrite en clair sur la
  // page : les cinq filtres 배수 / 합성수 étaient câblés un cran à côté de
  // leur étiquette. Voir `src/core/criteria.js`.
  import { lineStats, stack, temperatureShare, upcomingBoard } from '@core/board.js'
  import { MULTIPLES } from '@core/metrics.js'
  import { buildPool, EXCLUDABLE_SECTIONS, PRESETS, wire } from '@core/criteria.js'
  import { HEAD, NMAX, TAIL } from '@core/draws.js'
  import { numberStats, tableListCellStats } from '@core/tablelist.js'
  import { sharing as shareOf } from '@core/sharing.js'

  import {
    bandLabel, bandValues, choices, coveredRows, SUM_MAX, SUM_MIN,
  } from '../lib/combinaison.js'
  import { isSkipped, search } from '../lib/generator.js'
  import { day, num, rang as fmt } from '../lib/format.js'
  import { auto as store, grids as gridStore } from '../lib/store.js'
  import {
    activeConds, ENGINE_KEYS, ENGINE_MAX, engineOptions,
    FILTER_KEYS, gridAt, mergeConds, NEEDS_PREVIOUS, PAGE, pickIndices, shuffleGrids, wonCounts,
  } from '../lib/pick.js'
  import { untrack } from 'svelte'
  import { describeRow } from '@core/row.js'
  import BENCH from '../lib/filter-bench.json'

  import BadgeStrip from '../components/BadgeStrip.svelte'
  import PickControls from '../components/PickControls.svelte'
  import RowFilter from '../components/RowFilter.svelte'
  import CheckSet from '../components/CheckSet.svelte'
  import ComboTable from '../components/ComboTable.svelte'
  import NumberCheck from '../components/NumberCheck.svelte'
  import PatternBoard from '../components/PatternBoard.svelte'
  import TempBoard from '../components/TempBoard.svelte'

  // `pending` : une recherche ouverte depuis 조합결과. On la charge une
  // fois, puis on rend la main — sans quoi tout changement de filtre serait
  // écrasé au rendu suivant.
  let { draws, pending = null, onconsumed = null } = $props()

  const last = $derived(draws.rangs[draws.n - 1])
  const opts = $derived(choices(draws))

  // --- le formulaire ----------------------------------------------------

  // Le 회차 va jusqu'à `last + 1` : c'est celui qu'on prépare, et c'est ce
  // que proposait l'ancien menu. Le 이월 se lit alors sur le dernier tiré.
  let rang = $state(null)
  const target = $derived(rang ?? last + 1)

  let presetKey = $state('all')
  let add = $state([])
  let remove = $state([])
  let sections = $state([])
  let fix = $state([])

  let sumStart = $state('')
  let sumEnd = $state('')

  let low = $state([])
  let odd = $state([])
  let ac = $state([])
  let headSum = $state([])
  let tailSum = $state([])
  let carry = $state([])
  let cPrimes = $state([])
  let cComposites = $state([])
  let cMult2 = $state([])
  let cMult3 = $state([])
  let cMult4 = $state([])
  let cMult5 = $state([])

  // Les colonnes du tableau 조합 qui n'avaient pas de filtre. Les sommes se
  // cochent par tranches de 10 (la valeur retenue est le début de tranche),
  // les répétitions et les positions valeur par valeur.
  let cCarrySum = $state([])
  let cCarryPos = $state([])
  let cPrimeSum = $state([])
  let cCompSum = $state([])
  let cM2Sum = $state([])
  let cM3Sum = $state([])
  let cM4Sum = $state([])
  let cM5Sum = $state([])
  let cHeadRep = $state([])
  let cTailRep = $state([])
  // 앞자리 / 끝자리 permis : ils ne passent pas par le moteur, ils retirent
  // du vivier les numéros dont le chiffre n'est pas coché.
  let cHeadDigits = $state([])
  let cTailDigits = $state([])

  // 분배 — trois choix plutôt qu'une case par valeur : le modèle ne rend que
  // dix-huit indices distincts, et ce qu'on veut lire c'est « moins joué »,
  // pas « 0,857 ». Le détail reste en info-bulle sur chaque ligne du résultat.
  const SHARING_CHOICES = [
    { key: 'all', label: '전체', bounds: null, note: '조건 없음' },
    { key: 'below', label: '평균 이하', bounds: [0, 1.0], note: '지표 ≤ 1.00' },
    { key: 'rare', label: '적게 팔린', bounds: [0, 0.90], note: '지표 ≤ 0.90' },
  ]
  let sharingPick = $state('all')

  // Le même chiffre que les douze filtres au-dessus : quelle part du passé
  // chaque choix laisse passer. Compté sur les 회차, pas sur les 8 millions
  // de combinaisons — c'est ce que les autres cases affichent.
  // Pour chaque famille (리스트추천) et chaque 구간 (제외구간) : combien de
  // numéros sortis lui appartiennent sur tout le passé, en part, et la part
  // que sa taille lui donnerait au hasard (taille / 45).
  const familyShare = $derived.by(() => {
    const tally = new Uint32Array(NMAX + 1)
    let total = 0
    for (let i = 0; i < draws.n; i++) {
      for (const n of draws.numbersAt(i)) { tally[n]++; total++ }
    }
    const of = (numbers) => {
      const count = numbers.reduce((t, n) => t + tally[n], 0)
      return {
        count, total,
        pct: total ? (100 * count) / total : 0,
        expected: (100 * numbers.length) / NMAX,
      }
    }
    return {
      preset: Object.fromEntries(PRESETS.map((p) => [p.key, of(p.numbers)])),
      section: Object.fromEntries(EXCLUDABLE_SECTIONS.map((b) => [b.key, of(b.numbers)])),
    }
  })

  const sharingSeen = $derived.by(() => {
    const seen = { all: 0, below: 0, rare: 0 }
    for (let i = 0; i < draws.n; i++) {
      const v = shareOf([...draws.numbersAt(i)]).index
      seen.all++
      if (v <= 1.0) seen.below++
      if (v <= 0.90) seen.rare++
    }
    return seen
  })

  const pool = $derived(buildPool({ preset: presetKey, add, remove, sections })
    .filter((n) => (!cHeadDigits.length || cHeadDigits.includes(HEAD[n]))
      && (!cTailDigits.length || cTailDigits.includes(TAIL[n]))))
  const poolSet = $derived(new Set(pool))
  // Un 고정수 hors du vivier rendrait la recherche impossible : on le retire
  // plutôt que de laisser le générateur lever une erreur à la figure.
  const fixValid = $derived(fix.filter((n) => poolSet.has(n)))
  const fixDropped = $derived(fix.filter((n) => !poolSet.has(n)))

  const sumBounds = $derived.by(() => {
    const a = sumStart === '' ? null : Number(sumStart)
    const b = sumEnd === '' ? null : Number(sumEnd)
    if (a === null && b === null) return null
    return [a ?? SUM_MIN, b ?? SUM_MAX]
  })
  const sumBackwards = $derived(sumBounds !== null && sumBounds[0] > sumBounds[1])

  const sums = Array.from({ length: SUM_MAX - SUM_MIN + 1 }, (_, i) => SUM_MIN + i)

  // Ce que le passé dit du 총합 — la même lecture que sous chaque CheckSet :
  // l'effectif par dizaine, et la part des 회차 que la fourchette laisse passer.
  const SUM_BIN = 10
  // La bande des dizaines : étiquette, barre, effectif et part, côte à côte.
  const sumStrip = $derived.by(() => {
    const bins = new Map()
    for (const o of opts.total) {
      const lo = Math.floor(o.value / SUM_BIN) * SUM_BIN
      bins.set(lo, (bins.get(lo) ?? 0) + o.seen)
    }
    const lows = [...bins.keys()].sort((x, y) => x - y)
    const max = Math.max(1, ...bins.values())
    const [a, b] = sumBounds && !sumBackwards ? sumBounds : [SUM_MIN, SUM_MAX]
    return lows.map((lo) => {
      const hi = lo + SUM_BIN - 1
      const seen = bins.get(lo)
      return {
        lo, hi, seen,
        height: (seen / max) * 100,
        pct: draws.n ? (seen / draws.n) * 100 : 0,
        on: hi >= a && lo <= b,
      }
    })
  })
  const sumCovered = $derived.by(() => {
    if (!sumBounds || sumBackwards) return draws.n
    const [a, b] = sumBounds
    return opts.total.filter((o) => o.value >= a && o.value <= b).reduce((t, o) => t + o.seen, 0)
  })

  // `rangs` est un Int32Array : pas d'`indexOf` utilisable ici, on balaie.
  const previous = $derived.by(() => {
    let found = null
    for (let k = 0; k < draws.n; k++) if (draws.rangs[k] === target - 1) found = k
    return found === null ? null : [...draws.sequenceAt(found)]
  })
  const next = $derived.by(() => {
    for (let k = 0; k < draws.n; k++) {
      if (draws.rangs[k] === target) return [...draws.sequenceAt(k)]
    }
    return null
  })

  const filters = $derived.by(() => {
    const f = { pool, include: fixValid }
    if (sumBounds && !sumBackwards) f.total = sumBounds
    if (low.length) f.low = { allow: low }
    if (odd.length) f.odd = { allow: odd }
    if (ac.length) f.ac = { allow: ac }
    if (headSum.length) f.headSum = { allow: headSum }
    if (tailSum.length) f.tailSum = { allow: tailSum }
    if (carry.length) {
      if (previous) { f.reference = previous; f.match = { allow: carry } }
    }
    const checked = {}
    if (cPrimes.length) checked.primes = cPrimes
    if (cComposites.length) checked.composites = cComposites
    if (cMult2.length) checked.mult2 = cMult2
    if (cMult3.length) checked.mult3 = cMult3
    if (cMult4.length) checked.mult4 = cMult4
    if (cMult5.length) checked.mult5 = cMult5

    // Le câblage corrigé : chaque case agit sur ce que dit son étiquette.
    for (const [key, allow] of Object.entries(wire(checked, 'fixed'))) {
      if (key === 'primes' || key === 'composites') f[key] = { allow }
      else {
        f.multiples ??= {}
        f.multiples[Number(key.slice(4))] = { allow }
      }
    }
    const share = SHARING_CHOICES.find((c) => c.key === sharingPick)
    if (share.bounds) f.sharing = share.bounds

    // Les colonnes ajoutées. Celles du 이월 n'ont de sens qu'avec un 회차
    // précédent connu — sans lui elles sont ignorées, comme le 이월 개수.
    if (previous && (cCarrySum.length || cCarryPos.length)) {
      f.reference = previous
      if (cCarrySum.length) f.carriedSum = { allow: bandValues(cCarrySum) }
      if (cCarryPos.length) f.carriedPos = [...cCarryPos]
    }
    if (cPrimeSum.length) f.primeSum = { allow: bandValues(cPrimeSum) }
    if (cCompSum.length) f.compositeSum = { allow: bandValues(cCompSum) }
    const multSums = {}
    if (cM2Sum.length) multSums[2] = { allow: bandValues(cM2Sum) }
    if (cM3Sum.length) multSums[3] = { allow: bandValues(cM3Sum) }
    if (cM4Sum.length) multSums[4] = { allow: bandValues(cM4Sum) }
    if (cM5Sum.length) multSums[5] = { allow: bandValues(cM5Sum) }
    if (Object.keys(multSums).length) f.multSums = multSums
    if (cHeadRep.length) f.headRepeat = { allow: cHeadRep }
    if (cTailRep.length) f.tailRepeat = { allow: cTailRep }
    return f
  })

  // Les deux tableaux d'analyse. Le 회차 visé peut être le prochain, pas
  // encore tiré : les tableaux se lisent alors sur le dernier connu, et le
  // titre le dit plutôt que d'afficher un écran vide.
  const known = $derived(target <= last)
  const boardRang = $derived(known ? target : last)
  const boardIndex = $derived(draws.indexOf(boardRang))
  const boards = $derived(stack(draws, boardRang))

  // Les deux tableaux posent en tête le 회차 **à venir** — celui pour lequel
  // on combine. C'est la seule carte de l'écran qui serve à préparer quelque
  // chose ; elle s'efface dès qu'on remonte dans le passé, où « le prochain
  // tirage » n'aurait aucun sens.
  const atLast = $derived(draws.rangs[draws.n - 1] === boardRang)

  // Chaque carte porte les sept du 회차 **suivant**, quand il existe : c'est
  // ce que le 패턴 coche sur la grille. Le dernier 회차 connu n'en a pas, et
  // la carte à venir non plus.
  const withNext = (list) => list.map((b) => {
    const i = draws.indexOf(b.rang)
    if (i < 0 || i + 1 >= draws.n) return b
    return { ...b, next: [...draws.sequenceAt(i + 1)] }
  })
  const stackBoards = $derived(atLast
    ? [upcomingBoard(draws), ...withNext(boards)]
    : withNext(boards))

  // Un balayage complet de l'historique : calculé une fois, pas à chaque
  // changement de 회차 — il ne dépend que de `draws`.
  const tempShare = $derived(temperatureShare(draws))
  const tempLines = $derived(lineStats(draws))
  // Le taux de chaque numéro, et le χ² qui dit si l'écart entre le plus et
  // le moins sorti veut dire quelque chose. (Il ne veut rien dire.)
  const tempNumbers = $derived(numberStats(draws))
  // Les deux marges de la grille 패턴 — elle a la même forme que celle du
  // 테이블리스트, donc les mêmes chiffres.
  const patternCells = $derived(tableListCellStats(draws))
  const boardDrawn = $derived([...draws.fullAt(boardIndex)])

  let family = $state(null)
  const highlight = $derived(new Set(family?.numbers ?? []))

  const usesShifted = $derived(
    cComposites.length + cMult2.length + cMult3.length + cMult4.length + cMult5.length > 0)

  const active = $derived([
    sumBounds && !sumBackwards && '총합', low.length && '저고', odd.length && '홀짝',
    ac.length && 'AC값', headSum.length && '앞자리수합', tailSum.length && '끝자리수합',
    carry.length && '이월', cPrimes.length && '소수', cComposites.length && '합성수',
    cMult2.length && '이의배수', cMult3.length && '삼의배수',
    cMult4.length && '사의배수', cMult5.length && '오의배수',
    fixValid.length && `고정수 ${fixValid.length}개`,
    sharingPick !== 'all' && '분배',
    cCarrySum.length && '이월합', cCarryPos.length && '이월 위치',
    cPrimeSum.length && '소수합', cCompSum.length && '합성수합',
    cM2Sum.length && '이의배수합', cM3Sum.length && '삼의배수합',
    cM4Sum.length && '사의배수합', cM5Sum.length && '오의배수합',
    cHeadRep.length && '앞쌍', cTailRep.length && '끝쌍',
    cHeadDigits.length && '앞자리수', cTailDigits.length && '끝자리수',
  ].filter(Boolean))

  function reset() {
    presetKey = 'all'; add = []; remove = []; sections = []; fix = []
    sumStart = ''; sumEnd = ''
    low = []; odd = []; ac = []; headSum = []; tailSum = []; carry = []
    cPrimes = []; cComposites = []; cMult2 = []; cMult3 = []
    cMult4 = []; cMult5 = []
    sharingPick = 'all'
    cCarrySum = []; cCarryPos = []; cPrimeSum = []; cCompSum = []
    cM2Sum = []; cM3Sum = []; cM4Sum = []; cM5Sum = []
    cHeadRep = []; cTailRep = []; cHeadDigits = []; cTailDigits = []
  }

  // Le réglage de 팁 › 필터 조합 검정 : toutes les cases à ~80 %, apprises
  // par `npm run bench:filters`. Il passe par `reopen`, comme une recherche
  // enregistrée — ce qu'il n'écrit pas retombe à vide.
  let benchLoaded = $state(false)
  function loadBench() {
    // `rang` : le 회차 choisi reste celui de l'écran — le bouton ne change
    // que les cases, pas le 회차 (sinon `reopen` repasse au 다음 회차).
    reopen({ name: '검정 설정 (각 80%)', rang, form: BENCH.all['0.8'].form })
    benchLoaded = true
  }

  // --- le carnet de recherches ------------------------------------------
  //
  // Ce qu'on enregistre ici, c'est le **formulaire** — comme le faisait
  // `combinaison_combinasion`, qui gardait ses vingt-quatre champs et pas
  // une seule combinaison. C'est le bon choix : la recherche se rejoue en un
  // clic sur des données à jour, alors que des résultats vieux de deux ans
  // ne valent plus rien.

  const canStore = store.available()
  let saved = $state(store.load())
  let saveName = $state('')
  let notice = $state(null)

  /** Le formulaire, tel qu'il part au carnet. */
  const form = $derived({
    preset: presetKey,
    add: [...add], remove: [...remove], sections: [...sections], fix: [...fix],
    sumStart, sumEnd,
    low: [...low], odd: [...odd], ac: [...ac],
    headSum: [...headSum], tailSum: [...tailSum], carry: [...carry],
    primes: [...cPrimes], composites: [...cComposites],
    mult2: [...cMult2], mult3: [...cMult3], mult4: [...cMult4], mult5: [...cMult5],
    sharing: sharingPick,
    carrySum: [...cCarrySum], carryPos: [...cCarryPos],
    primeSum: [...cPrimeSum], compositeSum: [...cCompSum],
    mult2Sum: [...cM2Sum], mult3Sum: [...cM3Sum], mult4Sum: [...cM4Sum], mult5Sum: [...cM5Sum],
    headRepeat: [...cHeadRep], tailRepeat: [...cTailRep],
    headDigits: [...cHeadDigits], tailDigits: [...cTailDigits],
  })

  $effect(() => {
    if (!pending) return
    reopen(pending)
    onconsumed?.()
  })

  function doSave() {
    const entry = store.save({
      name: saveName, rang: target, form: $state.snapshot(form), filters: active.length,
    })
    if (!entry) { notice = '브라우저가 저장을 거부했습니다.'; return }
    saved = store.load()
    saveName = ''
    notice = `${entry.name} — 조건을 저장했습니다.`
  }

  /**
   * Rejouer une recherche. Le 회차 revient à `null` — « le prochain » —
   * quand la recherche visait un 회차 depuis tiré : on cherche pour
   * l'avenir, pas pour un passé dont on connaît déjà la réponse.
   */
  function reopen(entry) {
    const f = entry.form ?? {}
    presetKey = f.preset ?? 'all'
    add = [...(f.add ?? [])]
    remove = [...(f.remove ?? [])]
    sections = [...(f.sections ?? [])]
    fix = [...(f.fix ?? [])]
    sumStart = f.sumStart ?? ''
    sumEnd = f.sumEnd ?? ''
    low = [...(f.low ?? [])]
    odd = [...(f.odd ?? [])]
    ac = [...(f.ac ?? [])]
    headSum = [...(f.headSum ?? [])]
    tailSum = [...(f.tailSum ?? [])]
    carry = [...(f.carry ?? [])]
    cPrimes = [...(f.primes ?? [])]
    cComposites = [...(f.composites ?? [])]
    cMult2 = [...(f.mult2 ?? [])]
    cMult3 = [...(f.mult3 ?? [])]
    cMult4 = [...(f.mult4 ?? [])]
    cMult5 = [...(f.mult5 ?? [])]
    // Les enregistrements d'avant n'ont pas ce champ : ils retombent sur 전체.
    sharingPick = SHARING_CHOICES.some((c) => c.key === f.sharing) ? f.sharing : 'all'
    // Les colonnes ajoutées : absentes des enregistrements plus anciens.
    cCarrySum = [...(f.carrySum ?? [])]
    cCarryPos = [...(f.carryPos ?? [])]
    cPrimeSum = [...(f.primeSum ?? [])]
    cCompSum = [...(f.compositeSum ?? [])]
    cM2Sum = [...(f.mult2Sum ?? [])]
    cM3Sum = [...(f.mult3Sum ?? [])]
    cM4Sum = [...(f.mult4Sum ?? [])]
    cM5Sum = [...(f.mult5Sum ?? [])]
    cHeadRep = [...(f.headRepeat ?? [])]
    cTailRep = [...(f.tailRepeat ?? [])]
    cHeadDigits = [...(f.headDigits ?? [])]
    cTailDigits = [...(f.tailDigits ?? [])]
    rang = entry.rang != null && entry.rang <= last ? entry.rang : null
    result = null
    status = 'idle'
    notice = `${entry.name} 를 불러왔습니다 — 「조합 만들기」를 누르세요.`
  }

  function drop(id) {
    store.remove(id)
    saved = store.load()
  }

  /**
   * Les combinaisons trouvées, rangées dans 조합결과.
   *
   * Le carnet des grilles est commun aux trois écrans ; `source` dit d'où
   * elles viennent. Tout part — la liste entière, ou le coché. La seule
   * borne est la place du navigateur (~5 Mo pour tous les carnets).
   */
  let savedGrids = $state(0)
  let gridNotice = $state(null)

  function saveGrids() {
    if (!toSave.length) return
    gridNotice = null
    const keep = toSave.map((i) => gridAt(result.grids, i))
    const entry = gridStore.save({
      name: saveName || `${target}회 자동`,
      rang: target,
      source: 'auto',
      grids: keep,
      pool: [...pool],
      form: $state.snapshot(form),
    })
    if (!entry) {
      gridNotice = `브라우저가 저장을 거부했습니다 — ${num(keep.length)}개는 브라우저 저장 공간(약 5MB)에 비해 너무 많을 수 있습니다. 조건이나 결과 필터로 조합 수를 줄이거나, 일부를 체크해 저장해 보세요.`
      return
    }
    savedGrids = keep.length
    saveName = ''
    notice = `${entry.name} — ${keep.length}개 조합을 조합결과에 저장했습니다.`
  }

  function exportFile() {
    const blob = new Blob([store.toFile()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lotto-자동조합.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importFile(event) {
    // `currentTarget` ne vaut que pendant la propagation de l'événement :
    // après le premier `await` il est nul, et le remettre à zéro plus bas
    // levait. On garde donc l'élément avant d'attendre quoi que ce soit.
    // Sans cette remise à zéro, choisir deux fois de suite le **même**
    // fichier n'émet pas de second `change` — l'import paraîtrait ignoré.
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const added = store.fromFile(await file.text())
      saved = store.load()
      notice = `${added}개를 불러왔습니다.`
    } catch (error) {
      notice = error.message
    }
    input.value = ''
  }

  // --- le calcul --------------------------------------------------------

  // Pas de 개수 : le moteur rend tout ce qui passe, jusqu'à son plafond
  // (un million — au-delà, un tirage au sort de ce million). L'écran en
  // montre 500 et 「더 보기」 en ajoute 500 ; l'enregistrement prend tout.
  let pickMode = $state('random')
  let sortKey = $state('none')
  let sortDir = $state('asc')
  let conds = $state([])
  const count = ENGINE_MAX
  let listed = $state(PAGE)

  let status = $state('idle')       // idle · running · done · failed
  // `raw` : le résultat peut porter six millions de numéros. En `$state`
  // simple, Svelte enveloppe chacun dans un proxy réactif et chaque lecture
  // le traverse (24 s au lieu de 3 pour un million de grilles). Il n'est
  // jamais modifié en place, seulement remplacé : `raw` suffit.
  let result = $state.raw(null)
  let failure = $state(null)

  // Le 결과 필터, côté moteur : les conditions qu'il sait faire partent avec
  // les cases du haut et filtrent les 8 145 060 grilles ; le reste (`rest`)
  // se fait ensuite sur les grilles tirées.
  const merged = $derived(mergeConds($state.snapshot(filters), $state.snapshot(conds), previous, next))
  const rest = $derived(merged.rest ?? [])

  async function run() {
    status = 'running'
    failure = null
    // Une condition qui ne laisse rien passer : un résultat vide, pas une
    // erreur — sinon la ligne du 결과 필터 disparaîtrait avec lui, et on ne
    // pourrait plus retirer la condition fautive.
    if (merged.impossible) {
      result = {
        grids: [], count: 0, kept: 0, candidates: result?.candidates ?? 0, rejected: [],
        elapsedMs: 0, at: target, previous, next, mode: pickMode,
        impossible: FILTER_KEYS.find((k) => k.key === merged.impossible)?.label,
      }
      checked = new Set()
      status = 'done'
      return
    }
    try {
      const mode = pickMode
      const r = await search('lotto', merged.filters, engineOptions(mode, count))
      if (mode === 'random') shuffleGrids(r.grids)
      result = { ...r, at: target, previous, next, mode }
      checked = new Set()
      listed = PAGE
      status = 'done'
    } catch (error) {
      if (isSkipped(error)) return
      failure = error.message
      status = 'failed'
    }
  }

  // Toutes les grilles rendues par le moteur.
  const drawn = $derived(result ? result.count : 0)

  // 필터 → 정렬 : des positions dans `result.grids`, pas des lignes décrites.
  // 당첨 개수 : seulement si le 회차 du résultat est tiré.
  const hideWon = $derived(result ? (result.next ? [] : ['won']) : (next ? [] : ['won']))
  const order = $derived(result
    ? pickIndices(result.grids, drawn, {
      conds: rest.filter((c) => c.key !== 'won' || result.next),
      sortKey, dir: sortDir, previous: result.previous, next: result.next,
    })
    : [])
  // Combien de grilles de la liste ont fait 0 … 6 — le 회차 passé seulement.
  const wonTally = $derived(result?.next ? wonCounts(result.grids, order, result.next) : null)
  // `filtering` : un filtre qui ne porte que sur les grilles tirées.
  const filtering = $derived(rest.length > 0)

  // Une condition envoyée au moteur a changé : on relance, une fois la
  // frappe finie (400 ms), et seulement s'il y a déjà un résultat.
  const engineConds = $derived(JSON.stringify(activeConds(conds).filter((c) => ENGINE_KEYS.has(c.key))))
  let rerun = null
  $effect(() => {
    engineConds
    if (!untrack(() => result)) return
    clearTimeout(rerun)
    rerun = setTimeout(run, 400)
  })

  // Seul ce qui est affiché est décrit : 500, puis 500 de plus par 「더 보기」.
  // Les lignes du tableau de 42 colonnes (`ComboTable`), comme au 일반조합.
  const shown = $derived(order.slice(0, listed).map((i, k) => ({
    ...describeRow(gridAt(result.grids, i), { rang: result.at, previous: result.previous }),
    _i: i, _pos: k + 1,
  })))

  // Les cases cochées, par position : vidées à chaque calcul, gardées quand
  // le filtre, le tri, le 개수 ou la page changent. Rien de coché : on
  // enregistre toute la liste ; sinon, le coché encore dans la liste.
  let checked = $state(new Set())
  const toggle = (i) => {
    const next = new Set(checked)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    checked = next
  }
  const checkAll = () => { checked = new Set(order) }
  const listedChecked = $derived(checked.size ? order.filter((i) => checked.has(i)) : [])
  const hiddenChecked = $derived(checked.size - listedChecked.length)
  const toSave = $derived(listedChecked.length ? listedChecked : order)
</script>

<section class="panel bar">
  <div class="head-inline">
    <h2>자동조합</h2>
    <span class="gloss">조건으로 찾기, 설정 24개</span>
  </div>
  <div class="pick">
    <span class="label">회차</span>
    <select bind:value={rang}>
      <option value={null}>{fmt(last + 1)} · 다음 회차</option>
      {#each Array.from({ length: Math.min(draws.n, 60) }, (_, i) => draws.n - 1 - i) as k (k)}
        <option value={draws.rangs[k]}>{fmt(draws.rangs[k])} · {day(draws.dates[k])}</option>
      {/each}
    </select>
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>{known ? fmt(boardRang) : `${fmt(boardRang)} (마지막 추첨)`}</h2>
    <span class="gloss">{day(draws.dates[boardIndex])}</span>
    <span class="right">번호를 눌러 두 표에서 찾아보세요</span>
  </div>
  <BadgeStrip drawn={boardDrawn} {pool} bind:selected={family} />
</section>

<PatternBoard boards={stackBoards} {highlight} cells={patternCells}
              numbers={tempNumbers} />

<TempBoard boards={stackBoards} {highlight} history={tempShare} lines={tempLines}
           numbers={tempNumbers} />

<section class="panel">
  <div class="head">
    <h2>번호 범위</h2>
    <span class="gloss">리스트추천 · 추가번호 · 제외번호 · 제외구간</span>
    <span class="right">{num(pool.length)} / {NMAX}개</span>
  </div>

  <div class="row">
    <span class="label">리스트추천</span>
    <div class="chips">
      {#each PRESETS as p (p.key)}
        {@const sh = familyShare.preset[p.key]}
        <button aria-pressed={presetKey === p.key} onclick={() => (presetKey = p.key)}
                title="{p.label} ({p.numbers.length}개) · 당첨번호 {num(sh.count)} / {num(sh.total)}개 · 기대 {sh.expected.toFixed(1)}%">
          {p.label}
          <span class="share"><b>{num(sh.count)}</b>{sh.pct.toFixed(1)}%<em>{sh.expected.toFixed(1)}</em></span>
        </button>
      {/each}
    </div>
  </div>

  <div class="row">
    <span class="label">제외구간</span>
    <div class="chips">
      {#each EXCLUDABLE_SECTIONS as b (b.key)}
        {@const sh = familyShare.section[b.key]}
        <button aria-pressed={sections.includes(b.key)}
                title="{b.label} · 당첨번호 {num(sh.count)} / {num(sh.total)}개 · 기대 {sh.expected.toFixed(1)}%"
                onclick={() => (sections = sections.includes(b.key)
                  ? sections.filter((s) => s !== b.key)
                  : [...sections, b.key])}>
          {b.label}
          <span class="share"><b>{num(sh.count)}</b>{sh.pct.toFixed(1)}%<em>{sh.expected.toFixed(1)}</em></span>
        </button>
      {/each}
    </div>
  </div>

  <div class="grid two">
    <div>
      <span class="label">추가번호</span>
      <NumberCheck bind:selected={add} tone="gold" />
    </div>
    <div>
      <span class="label">제외번호</span>
      <NumberCheck bind:selected={remove} tone="strike" />
    </div>
  </div>

  <div class="poolview">
    <span class="label">최종 번호</span>
    {#if pool.length === 0}
      <p class="dim">번호가 하나도 남지 않았습니다.</p>
    {:else}
      <p class="numbers">{pool.join(', ')}</p>
    {/if}
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>고정번호</h2>
    <span class="gloss">최대 5개, 모든 조합에 포함</span>
  </div>
  <NumberCheck bind:selected={fix} tone="gold"
               disabled={new Set(Array.from({ length: NMAX }, (_, i) => i + 1)
                 .filter((n) => !poolSet.has(n)))} />
  {#if fix.length > 5}
    <p class="warn">고정번호는 5개까지입니다 — 지금 {fix.length}개.</p>
  {/if}
  {#if fixDropped.length}
    <p class="warn">{fixDropped.join(', ')}번은 번호 범위에 없어 제외됩니다.</p>
  {/if}
</section>

<section class="panel">
  <div class="head">
    <h2>총합</h2>
    <span class="gloss">시작과 끝, {SUM_MIN}부터 {SUM_MAX}까지</span>
    <span class="right dim" title="과거 {num(draws.n)}회 중 {num(sumCovered)}회가 이 범위에 들어맞습니다">
      과거 {((sumCovered / draws.n) * 100).toFixed(1)}%
    </span>
  </div>
  <div class="sum-split">
    <div class="sum-pick">
      <div class="row">
        <select bind:value={sumStart}>
          <option value="">시작 —</option>
          {#each sums as s (s)}<option value={String(s)}>{s}</option>{/each}
        </select>
        <span class="dim">~</span>
        <select bind:value={sumEnd}>
          <option value="">끝 —</option>
          {#each sums as s (s)}<option value={String(s)}>{s}</option>{/each}
        </select>
      </div>
      {#if sumBackwards}
        <span class="warn">시작이 끝보다 큽니다 — 이 조건은 무시됩니다.</span>
      {/if}
    </div>
    <div class="sum-strip" role="img" aria-label="과거 총합 분포">
      {#each sumStrip as c (c.lo)}
        <div class="cell" class:on={c.on} title="{c.lo}–{c.hi} · 과거 {num(c.seen)}회 · {c.pct.toFixed(1)}%">
          <span class="lbl">{c.lo}–{c.hi}</span>
          <span class="track"><span class="fill" style="height: {c.height}%"></span></span>
          <span class="seen">{num(c.seen)}</span>
          <span class="pct">{c.pct.toFixed(1)}%</span>
        </div>
      {/each}
    </div>
  </div>
</section>

<section class="panel">
  <div class="head">
    <h2>필터</h2>
    <span class="gloss">체크한 값만 통과합니다</span>
    <span class="right">{active.length ? active.join(' · ') : '조건 없음'}</span>
  </div>

  <p class="note dim">
    각 칸의 <strong>%</strong> 는 과거 {num(draws.n)}회 중 그 값이 나온 비율이고,
    필터 이름 옆의 <strong>「과거 N%」</strong> 는 지금 선택이 과거 몇 %를 통과시키는지입니다.
    자주 나온 값이 <strong>더 잘 나오는 값은 아닙니다</strong> — 무작위 추첨이
    가장 많이 만들어내는 모양일 뿐입니다. 좁게 고르면 조합 수만 줄어들고,
    한 장의 당첨 확률은 언제나 1/8,145,060 입니다.
  </p>

  <div class="sets">
    <CheckSet label="저고" gloss="저 : 고" options={opts.low}
              format={(v) => `${v} : ${6 - v}`} bind:selected={low} />
    <CheckSet label="홀짝" gloss="홀 : 짝" options={opts.odd}
              format={(v) => `${v} : ${6 - v}`} bind:selected={odd} />
    <CheckSet label="AC값" options={opts.ac} bind:selected={ac} columns="tight" />
    <CheckSet label="전회차이월번호수" gloss="이전 회차와 겹치는 개수"
              options={opts.carry} bind:selected={carry} columns="tight" />
    <CheckSet label="앞자리수합" options={opts.headSum} bind:selected={headSum} />
    <CheckSet label="끝자리수합" options={opts.tailSum} bind:selected={tailSum} />
    <CheckSet label="소수숫자수" options={opts.primes} bind:selected={cPrimes} columns="tight" />
    <CheckSet label="합성수숫자수" options={opts.composites} bind:selected={cComposites} columns="tight" />
    <CheckSet label="이의배수숫자수" options={opts.mult2} bind:selected={cMult2} columns="tight" />
    <CheckSet label="삼의배수숫자수" options={opts.mult3} bind:selected={cMult3} columns="tight" />
    <CheckSet label="사의배수숫자수" options={opts.mult4} bind:selected={cMult4} columns="tight" />
    <CheckSet label="오의배수숫자수" options={opts.mult5} bind:selected={cMult5} columns="tight" />

    <!-- Les colonnes du tableau 조합 qui n'avaient pas encore de filtre.
         Sommes : par tranches de 10. Positions et chiffres : plusieurs
         valeurs par 회차, d'où `total` et `cover` passés à part. -->
    <CheckSet label="전회차이월번합" gloss="이월 번호의 합 · 10단위"
              options={opts.carriedSum} format={bandLabel} bind:selected={cCarrySum} />
    <CheckSet label="전회차이월번위치" gloss="체크한 자리에서 온 이월만"
              options={opts.carriedPos} format={(p) => (p === 7 ? '보너스' : `${p}번째`)}
              total={opts.rows.carriedPos.length}
              cover={coveredRows(opts.rows.carriedPos, cCarryPos)}
              bind:selected={cCarryPos} />
    <CheckSet label="앞자리수" gloss="체크한 앞자리 숫자의 번호만 사용"
              options={opts.headDigit} total={draws.n}
              cover={coveredRows(opts.rows.headDigit, cHeadDigits)}
              bind:selected={cHeadDigits} columns="tight" />
    <CheckSet label="앞쌍" gloss="같은 앞자리 최대 개수"
              options={opts.headRepeat} bind:selected={cHeadRep} columns="tight" />
    <CheckSet label="끝자리수" gloss="체크한 끝자리 숫자의 번호만 사용"
              options={opts.tailDigit} total={draws.n}
              cover={coveredRows(opts.rows.tailDigit, cTailDigits)}
              bind:selected={cTailDigits} columns="tight" />
    <CheckSet label="끝쌍" gloss="같은 끝자리 최대 개수"
              options={opts.tailRepeat} bind:selected={cTailRep} columns="tight" />
    <CheckSet label="소수합" gloss="10단위" options={opts.primeSum} format={bandLabel}
              bind:selected={cPrimeSum} />
    <CheckSet label="합성수합" gloss="10단위" options={opts.compositeSum} format={bandLabel}
              bind:selected={cCompSum} />
    <CheckSet label="이의배수합" gloss="10단위" options={opts.mult2Sum} format={bandLabel}
              bind:selected={cM2Sum} />
    <CheckSet label="삼의배수합" gloss="10단위" options={opts.mult3Sum} format={bandLabel}
              bind:selected={cM3Sum} />
    <CheckSet label="사의배수합" gloss="10단위" options={opts.mult4Sum} format={bandLabel}
              bind:selected={cM4Sum} />
    <CheckSet label="오의배수합" gloss="10단위" options={opts.mult5Sum} format={bandLabel}
              bind:selected={cM5Sum} />
  </div>
  {#if !previous && (cCarrySum.length || cCarryPos.length)}
    <p class="note dim">「전회차이월번합」「전회차이월번위치」는 {fmt(target - 1)} 기록이 없어 적용되지 않습니다.</p>
  {/if}

  <!-- 분배 — le seul filtre de cette page qui ne parle pas du tirage.
       Les douze au-dessus découpent l'espace des combinaisons ; celui-ci
       découpe les joueurs. Il est donc séparé, et son texte dit ce qu'il
       fait et ce qu'il ne fait pas. -->
  <div class="sharing">
    <div class="sharing-head">
      <span class="lbl">분배</span>
      <span class="gloss">같은 조합을 고른 사람이 몇 명이었는지</span>
      <span class="right dim">
        과거 {((sharingSeen[sharingPick] / draws.n) * 100).toFixed(1)}%
      </span>
    </div>
    <div class="sharing-pick">
      {#each SHARING_CHOICES as c (c.key)}
        <button aria-pressed={sharingPick === c.key} onclick={() => (sharingPick = c.key)}
                title="과거 {num(draws.n)}회 중 {num(sharingSeen[c.key])}회">
          {c.label}
          <span class="n">{c.note}</span>
          <span class="p">과거 {((sharingSeen[c.key] / draws.n) * 100).toFixed(1)}%</span>
        </button>
      {/each}
    </div>
    <p class="notice">
      <strong>확률이 아니라 분배입니다</strong> — 1등은 정해진 금액이 아니라 나눠 갖는
      몫입니다. 1,238회를 재보면 같은 조합을 고른 사람 수는 조합의 모양에 따라
      <strong>0.88배에서 1.46배</strong>까지 달라집니다 (연속수·9 이하 번호·번호 간격).
      이 조건은 당첨 확률을 <strong>전혀 바꾸지 않습니다</strong> — 당첨됐을 때
      몇 명과 나누는지만 바꿉니다.
      결과표의 <strong>「수동」</strong> 열은 그 이유입니다 — 번호를 <strong>직접 고르는</strong>
      사람들 사이에서 그 모양이 평균보다 몇 배 자주 선택되는가 (0.55×~2.4×). 자동은 모양을
      가리지 않으므로 이 차이가 자동에 희석되어 위의 0.88~1.46배가 됩니다. 두 계산은 서로
      다른 자료(5등 당첨자 대 자동 당첨자)로 같은 순위를 냅니다.
    </p>
  </div>

  {#if usesShifted}
    <!-- L'avertissement ne s'affiche que quand il concerne la recherche en
         cours. Une note permanente finit par ne plus être lue. -->
    <p class="notice">
      <strong>바뀐 동작</strong> — 예전 사이트에서는 이 다섯 필터(합성수 · 이의배수 ·
      삼의배수 · 사의배수 · 오의배수)가 <strong>한 칸씩 밀려</strong> 있었습니다.
      「합성수」를 고르면 실제로는 2의 배수를 세고, 「오의배수」는 합성수를 셌습니다.
      여기서는 이름 그대로 동작합니다. 그래서 이 다섯 항목을 쓴 예전 검색과는
      결과가 다를 수 있습니다. 소수는 예전에도 정상이었습니다.
    </p>
  {/if}
</section>

<section class="panel run">
  <button class="go" onclick={run} disabled={status === 'running' || pool.length < 6}>
    {status === 'running' ? '계산 중…' : '조합 만들기'}
  </button>
  <button onclick={() => { reset(); benchLoaded = false }}>초기화</button>
  <button onclick={loadBench}
          title="팁 › 필터 조합 검정에서 쓴 설정 — 모든 필터에서 과거 약 80%를 덮는 값">검정 설정 불러오기 (각 80%)</button>
  <PickControls bind:mode={pickMode} bind:sort={sortKey} bind:dir={sortDir}
                max={ENGINE_MAX} hide={hideWon} counts={false} />
  <span class="dim">
    {#if pool.length < 6}
      번호가 6개 이상 필요합니다.
    {:else}
      통과한 조합을 모두 뽑습니다(최대 {num(ENGINE_MAX)}개). 500개씩 보이고 「더 보기」로 늘어납니다.
    {/if}
  </span>
  {#if benchLoaded}
    <p class="benchnote">
      <strong>검정 설정 (각 80%)</strong>을 불러왔습니다 — 조합이 전체의 약
      {(BENCH.all['0.8'].K * 100).toFixed(0)}%로 줄어듭니다(이월 조건 때문에 회차마다 조금 다릅니다). 하지만 과거 회차의 당첨번호도 약 {(BENCH.all['0.8'].te * 100).toFixed(0)}%만 이 안에
      있었습니다 : 조합 수만 줄어들 뿐, 한 장의 당첨 확률은 그대로입니다 (팁 › 필터 조합 검정).
    </p>
  {/if}
</section>

{#if status === 'failed'}
  <section class="panel"><p class="warn">{failure}</p></section>
{/if}

{#if status === 'done' && result}
  <section class="panel">
    <div class="head">
      <h2>결과</h2>
      <span class="gloss">{fmt(result.at)} 기준</span>
      <span class="right">
        {num(result.kept)}개 조합
        {#if result.kept > drawn}
          · {result.mode === 'order' ? '번호 순 앞의' : '무작위'} {num(drawn)}개 뽑음
        {/if}
        · {num(Math.min(listed, order.length))}개 표시
        {#if filtering} · 필터 후 {num(order.length)}개{/if}
        {#if (sortKey !== 'none' || filtering) && result.kept > drawn}
          · 필터 · 정렬은 뽑힌 {num(drawn)}개 안에서
        {/if}
        · {result.elapsedMs.toFixed(0)} ms
      </span>
    </div>

    <div class="saveline">
      <button onclick={saveGrids} disabled={!toSave.length}>
        {listedChecked.length ? '선택한' : '전체'} 조합결과에 저장
      </button>
      <button onclick={checkAll} disabled={!order.length}>전체 선택</button>
      <button onclick={() => (checked = new Set())} disabled={!checked.size}>전체 해제</button>
      {#if hiddenChecked > 0}
        <span class="dim small">선택한 것 중 {num(hiddenChecked)}개는 지금 목록에 없어 저장되지 않습니다.</span>
      {/if}
      {#if savedGrids > 0}
        <span class="dim small">저장됨 — 「조합결과」 탭에서 볼 수 있습니다.</span>
      {/if}
    </div>
    {#if gridNotice}<p class="notice tight">{gridNotice}</p>{/if}

    <div class="counts">
      <div class="cell">
        <span class="label">전체 후보</span>
        <span class="figure">{num(result.candidates)}</span>
      </div>
      <div class="cell">
        <span class="label">통과</span>
        <span class="figure">{num(result.kept)}</span>
        <span class="dim">
          {result.candidates ? ((result.kept / result.candidates) * 100).toFixed(3) : '0'} %
        </span>
      </div>
      <div class="cell">
        <span class="label">전회차</span>
        <span class="figure" class:dim={!result.previous}>
          {result.previous ? fmt(result.at - 1) : '없음'}
        </span>
      </div>
    </div>

    {#if result.rejected.length}
      <p class="note dim">
        걸러진 이유 —
        {#each result.rejected as r, i (r.key)}{i ? ' · ' : ''}{r.label} {num(r.rejected)}{/each}
      </p>
    {/if}

    <RowFilter bind:conds left={order.length} of={drawn} hide={hideWon}
               local={result.previous ? [] : NEEDS_PREVIOUS} />
    {#if result.impossible}
      <p class="notice tight">결과 필터의 「{result.impossible}」 조건이 위쪽 조건과 겹치지 않아, 통과하는 조합이 없습니다.</p>
    {/if}

    {#if wonTally}
      <!-- Le 회차 choisi est passé : combien de grilles de la liste ont fait
           0, 1, … 6 de ses sept numéros. -->
      <p class="wontally">
        <b>당첨 개수별</b> ({fmt(result.at)} · 보너스 포함 7개 기준)
        {#each wonTally as c, k (k)}
          <span class:hit={k >= 3 && c > 0}>{k}개 <strong>{num(c)}</strong></span>
        {/each}
      </p>
    {/if}

    {#if drawn === 0}
      <p class="dim">조건을 만족하는 조합이 없습니다.</p>
    {:else if order.length === 0}
      <p class="dim">결과 필터를 통과한 조합이 없습니다.</p>
    {:else}
      <ComboTable rows={shown} limit={shown.length} {checked} ontoggle={toggle}
                  draw={result.next} counted />
      {#if order.length > listed}
        <button class="more" onclick={() => (listed += PAGE)}>
          더 보기 ({num(listed)} / {num(order.length)})
        </button>
      {/if}
      <p class="note dim">
        조합 안의 두 줄 테두리 = 전회차에서 이월된 번호.
        {#if result.next}「당첨」은 {fmt(result.at)} 당첨번호와 겹치는 개수입니다.
        {:else}「당첨」은 {fmt(result.at)} 추첨 후에 채워집니다.{/if}
      </p>
    {/if}
  </section>
{/if}

<section class="panel">
  <div class="head">
    <h2>검색 조건 저장</h2>
    <span class="gloss">결과가 아니라 조건입니다 — 이 브라우저에만</span>
    {#if saved.length}<span class="right">{num(saved.length)}개 보관 중</span>{/if}
  </div>

  {#if !canStore}
    <p class="warn">
      이 브라우저에서는 저장이 되지 않습니다 (시크릿 모드이거나 저장이 차단됨).
      아래 내보내기로 파일에 남겨 두세요.
    </p>
  {/if}

  <div class="saveline">
    <input class="name" type="text" placeholder="이름 (비워도 됩니다)" bind:value={saveName} />
    <button onclick={doSave}>조건 저장</button>
    <button onclick={exportFile} disabled={!saved.length}>파일로 내보내기</button>
    <label class="import">
      파일에서 가져오기
      <input type="file" accept="application/json" onchange={importFile} />
    </label>
  </div>

  {#if notice}<p class="notice">{notice}</p>{/if}

  {#if saved.length}
    <div class="scroll">
      <table class="carnet">
        <thead>
          <tr><th>이름</th><th>회차</th><th>리스트추천</th><th class="v">조건</th>
            <th>저장 시각</th><th></th></tr>
        </thead>
        <tbody>
          {#each saved as entry (entry.id)}
            <tr>
              <td>{entry.name}</td>
              <td>{fmt(entry.rang)}</td>
              <td class="dim">
                {PRESETS.find((p) => p.key === entry.form?.preset)?.label ?? '모든수'}
              </td>
              <td class="v">{entry.filters ?? '—'}</td>
              <td class="dim">{entry.savedAt?.slice(0, 16).replace('T', ' ')}</td>
              <td class="acts">
                <button onclick={() => reopen(entry)}>불러오기</button>
                <button onclick={() => drop(entry.id)}>×</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <p class="note dim">
    조건만 저장하므로, 같은 조건을 <strong>다음 회차에 다시 돌릴 수 있습니다</strong> —
    옛 사이트도 조합이 아니라 폼을 저장했습니다. 저장은 이 브라우저 안에만 남습니다;
    다른 컴퓨터에서 쓰려면 파일로 내보내세요.
  </p>
</section>

<style>
  .more { margin: 0.6rem 0 0; padding: 0.3rem 1rem; font-size: 0.8125rem; }
  .wontally { display: flex; flex-wrap: wrap; gap: 0.35rem 0.9rem; align-items: baseline; font-size: 0.8125rem; margin: 0 0 0.7rem; }
  .wontally span { color: var(--muted); }
  .wontally span strong { color: var(--ink); font-family: var(--figure); }
  .wontally span.hit strong { color: var(--gold-deep); }
  .bar {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 0.75rem;
    padding-top: 0.85rem; padding-bottom: 0.85rem;
  }
  .head-inline { display: flex; align-items: baseline; gap: 0.6rem; }
  .head-inline h2 { font-size: 1.0625rem; }
  .gloss { color: var(--muted); font-size: 0.8125rem; }
  .sum-split { display: flex; gap: 1.25rem; align-items: flex-start; }
  .sum-pick { flex: 0 0 auto; }
  .sum-strip {
    flex: 1 1 0; min-width: 0; display: flex; gap: 2px; overflow-x: auto;
    padding-bottom: 0.2rem;
  }
  .sum-strip .cell {
    flex: 1 0 2.6rem; display: flex; flex-direction: column; align-items: center;
    gap: 0.15rem; font-family: var(--figure); color: var(--muted);
  }
  .sum-strip .lbl { font-size: 0.5625rem; white-space: nowrap; }
  .sum-strip .track {
    width: 100%; height: 2.75rem; display: flex; align-items: flex-end;
    background: var(--surface); border-radius: 2px;
  }
  .sum-strip .fill { display: block; width: 100%; background: var(--line); border-radius: 2px 2px 0 0; min-height: 1px; }
  .sum-strip .seen { font-size: 0.6875rem; }
  .sum-strip .pct { font-size: 0.5625rem; }
  .sum-strip .cell.on { color: var(--gold-deep); }
  .sum-strip .cell.on .fill { background: var(--gold); }
  .sum-strip .cell.on .seen { font-weight: 600; }

  .row {
    display: flex; align-items: center; gap: 0.5rem;
    flex-wrap: wrap; margin-bottom: 1rem;
  }
  .row .label { margin-right: 0.25rem; }
  .chips { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .chips button { font-size: 0.75rem; }
  .chips .share { margin-left: 0.35rem; font-family: var(--figure); font-size: 0.6875rem; color: var(--muted); }
  .chips .share em { font-style: normal; font-size: 0.5625rem; margin-left: 0.2rem; opacity: 0.7; }
  .chips .share b { font-weight: 600; color: var(--ink); margin-right: 0.3rem; }

  select {
    font: inherit; font-size: 0.8125rem; color: inherit;
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 0.3rem 0.5rem;
  }
  select:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 2px; }

  .pick { display: flex; align-items: center; gap: 0.5rem; }

  .grid.two > div > .label { display: block; margin-bottom: 0.45rem; }

  .poolview { margin-top: 1.1rem; padding-top: 0.9rem; border-top: 1px solid var(--line-soft); }
  .poolview .label { display: block; margin-bottom: 0.3rem; }
  .numbers { margin: 0; font-family: var(--figure); font-size: 0.8125rem; color: var(--ink-soft); }

  .sets { display: grid; gap: 1.35rem; }
  @media (min-width: 760px) { .sets { grid-template-columns: 1fr 1fr; } }

  .counts {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 1rem; margin-bottom: 1.1rem;
  }
  .cell { display: flex; flex-direction: column; gap: 0.15rem; }
  .cell .dim { font-size: 0.75rem; }

  .run { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .go {
    border-color: var(--gold); color: var(--gold);
    padding: 0.45rem 1.4rem; font-size: 0.9375rem;
  }
  .go:disabled { border-color: var(--line); color: var(--muted); cursor: default; }
  .run .dim { font-size: 0.75rem; }
  .benchnote { flex-basis: 100%; margin: 0; font-size: 0.75rem; line-height: 1.6; color: var(--ink-soft); }
  .benchnote strong { color: var(--gold-deep); font-weight: 600; }

  .warn { color: var(--s3); font-size: 0.8125rem; margin: 0.6rem 0 0; }

  /* L'avertissement du décalage 배수 : un filet à gauche, pas un bandeau
     coloré. Il doit se lire, pas crier. */
  /* 분배 — séparé des douze filtres au-dessus par un filet, parce qu'il ne
     parle pas de la même chose qu'eux. */
  .sharing {
    margin-top: 1.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--line);
  }

  .sharing-head {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin-bottom: 0.7rem;
  }

  .sharing-head .lbl { font-weight: 600; font-size: 0.9375rem; }
  .sharing-head .right { margin-left: auto; font-size: 0.75rem; }

  .sharing-pick { display: flex; flex-wrap: wrap; gap: 0.4rem; }

  .sharing-pick button {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.45rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: none;
    font: inherit;
    font-size: 0.8125rem;
    color: var(--ink);
    cursor: pointer;
  }

  .sharing-pick button[aria-pressed='true'] {
    border-color: var(--gold);
    box-shadow: inset 0 0 0 1px var(--gold);
  }

  .sharing-pick button .n { font-size: 0.6875rem; color: var(--ink-soft); }
  .sharing-pick button .p { font-size: 0.6875rem; color: var(--muted); }


  .notice {
    margin: 1.35rem 0 0;
    padding: 0.7rem 0 0.7rem 0.9rem;
    border-left: 2px solid var(--gold);
    font-size: 0.8125rem;
    line-height: 1.7;
    color: var(--ink-soft);
  }
  .notice strong { color: var(--ink); font-weight: 600; }

  .note { margin: 0.9rem 0 0; font-size: 0.75rem; line-height: 1.6; }
  .note strong { color: var(--ink); font-weight: 600; }

  /* Le carnet — même barre d'actions que le 수동조합, pour qu'on n'ait pas à
     réapprendre deux fois le même geste. */
  .saveline { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; margin-bottom: 0.9rem; }
  .small { font-size: 0.75rem; }
  .name { min-width: 12rem; }
  .import {
    font-size: 0.875rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 0.3rem 0.75rem;
    cursor: pointer;
  }
  .import:hover { border-color: var(--gold-bright); }
  .import input { display: none; }

  table.carnet { width: 100%; font-size: 0.8125rem; border-collapse: collapse; }
  table.carnet th, table.carnet td { padding: 0.35rem 0.6rem; text-align: left; white-space: nowrap; }
  table.carnet th {
    color: var(--muted); font-weight: 400; font-size: 0.75rem;
    border-bottom: 1px solid var(--line);
  }
  table.carnet td { border-bottom: 1px solid var(--line-soft); }
  table.carnet th.v, table.carnet td.v { text-align: right; font-family: var(--figure); }
  .acts { white-space: nowrap; }
  .acts button { font-size: 0.6875rem; padding: 0.15rem 0.4rem; margin-left: 0.2rem; }

</style>
