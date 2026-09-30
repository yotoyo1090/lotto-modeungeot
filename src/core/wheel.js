// 휠 — la seule chose de ce dépôt qui garantisse quoi que ce soit.
//
// Onze écrans décrivent les tirages, cinq onglets de 팁 ont mesuré tout ce
// qu'on pouvait mesurer, et la réponse a toujours été la même : rien ne bat
// le hasard pour *attraper* les gagnants. 167 méthodes, 21 304 croisements,
// et un tirage au sort glissé dedans qui finit 8ᵉ sur 167.
//
// Ce fichier ne prétend donc rien améliorer. Il répond à une autre question,
// qui a une vraie réponse mathématique :
//
//   « SI les six gagnants se trouvent dans mon ensemble de T numéros,
//     combien de grilles faut-il pour être CERTAIN de toucher un rang ? »
//
// C'est un problème de couverture, pas de prédiction. La réponse ne dépend
// d'aucune superstition et se vérifie en énumérant les C(T,6) tirages
// possibles — ce que fait `verifyWheel`, et ce que refont les tests sur
// chacune des vingt-quatre tables ci-dessous.
//
// Ce que ça ne fait pas, et qu'il faut redire : la roue ne change pas la
// probabilité que les six soient dans l'ensemble. Pour T = 14 elle vaut
// C(14,6)/C(45,6) = 1/2 712, soit une fois tous les cinquante-deux ans.
// La roue rend le « si » rentable, elle ne le rend pas fréquent.

import { NMAX, PICK } from './draws.js'

/** Le prix d'une grille, en won. */
export const TICKET = 1000

/**
 * La limite légale en boutique : 100 000 won par personne et par 회차.
 *
 * Une roue qui dépasse ce nombre n'est pas jouable en une fois, et le dire
 * fait partie du résultat.
 */
export const LEGAL_GRIDS = 100

export const WHEEL_MIN = 7
export const WHEEL_MAX = 18
export const GUARANTEES = [3, 4]

/**
 * Les jeux couvrants, en indices de position dans l'ensemble (base 36).
 *
 * Chaque entrée `T-g` donne un jeu de grilles tel que **tout** tirage de six
 * numéros pris dans un ensemble de T partage au moins `g` numéros avec au
 * moins une grille. Construits par glouton à redémarrages, puis élagués,
 * puis vérifiés exhaustivement — donc garantis, mais pas nécessairement
 * minimaux : trouver le plus petit jeu est un problème ouvert en général.
 */
const TABLE = {
  '7-3': '012346',
  '8-3': '012367',
  '9-3': '012678',
  '10-3': '012678 234567',
  '11-3': '012678 23456a',
  '12-3': '012678 2345ab',
  '13-3': '012678 345abc',
  '14-3': '23489a 0157bc 0567bd 01456c',
  '15-3': '14579a 0238bc 0368de 026bce',
  '16-3': '0138cf 2569be 0347ad 147acd 0478ad',
  '17-3': '0127be 4569fg 358acd 3469af 468cdg 89cdfg',
  '18-3': '1257bd 0369gh 348ace 048efg 169acf 257ach 468bdh 0abcdg 1369ef',
  '7-4': '012346',
  '8-4': '012367',
  '9-4': '012367 034568 012345',
  '10-4': '012367 034589 124579',
  '11-4': '012367 04589a 123467 15689a 02357a',
  '12-4': '012367 04589a 12348b 15679b 2356ab 0479ab 14678a 023589',
  '13-4': '012367 04589a 1248bc 1359bc 2567ab 0236ac 1479ab 03678b 14567c 23689c 23789c 01238a 023469',
  '14-4': '01249d 035678 123abc 14569a 256bcd 0178ad 0457bc 23589b 02689c 13467b 348acd 3579cd 023abd 1468cd 24789a 06789b 012357',
  '15-4': '01358c 2346ad 02479e 123bce 0167ab 125689 0379bd 1359ae 045acd 24578b 0468ce 1489ad 12bcde 2567de 0278ac 3469bc 038bde 459abe 1679ce 35678b 0259bc 3789ac 689ace 13457d',
  '16-4': '01458a 1236ac 0347be 0129df 23578d 1356bf 0259ce 02689b 1389ce 1467cd 246aef 04abcd 05679a 257bcf 0678ef 178acf 17abde 3469df 345cef 3579bc 0358de 3489ab 159aef 12489e 68bcde 048bcf 24569d 239abf 789adf 1347df 568bcd 2579ae',
  '17-4': '01359a 02468b 1347ef 124acg 0237dg 136bcd 1256eg 0269ef 0358cf 018bde 239abf 027ace 14579d 045bfg 046adf 15678a 2579bc 2578df 059cdg 16789g 17bcfg 2489ce 18aefg 039beg 2acdef 3468ag 369dfg 456bce 4679ac 478bcd 47abde 189abf 12349b 0459ef 356abg 2358ad 0789eg 3567de 2348cd 0378ab 689bde 2679df 2568cf 45789g',
  '18-4': '0145bg 23468h 0123ce 0247af 1469ad 12589f 028bcd 049egh 147bdh 035679 256aeg 016dfg 1567ch 2357de 05adfh 1678ae 2679bf 1239gh 036abc 12abfh 0789cg 078efh 179cdf 138adg 3478bf 34589c 349bef 34acgh 14cefh 358bgh 079abh 189bde 39acef 468cde 458abc 0289ah 578dfg 59abcg 05abde 68bfgh 6bdegh 012cfg 249cdg 2356df 247beg 2569ch 045cef 27cdgh 039deg 367cdf 1345ae 4689af 123abc 147ceg 3679bh 1abdef 238deh 02457f',
}

const parse = (spec) =>
  spec.split(' ').map((g) => [...g].map((c) => parseInt(c, 36)))

/** C(n, k), en flottant — les valeurs restent très en deçà de 2^53. */
export function choose(n, k) {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}

/** Le nombre total de grilles du 6/45. */
export const SPACE = choose(NMAX, PICK)

/** Combien de grilles pour cet ensemble et cette garantie, ou null. */
export function wheelSize(size, guarantee = 4) {
  const spec = TABLE[`${size}-${guarantee}`]
  return spec ? spec.split(' ').length : null
}

/**
 * La roue d'un ensemble donné.
 *
 * `pool` est une liste de numéros ; les doublons et les valeurs hors 1..45
 * sont écartés, puis l'ensemble est trié — la table étant en indices de
 * position, l'ordre décide de la correspondance et doit donc être stable.
 */
export function wheelFor(pool, guarantee = 4) {
  const clean = [...new Set(pool)]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= NMAX)
    .sort((a, b) => a - b)
  const size = clean.length
  const spec = TABLE[`${size}-${guarantee}`]
  if (!spec) {
    return {
      ok: false,
      pool: clean,
      size,
      why: size < WHEEL_MIN
        ? `${WHEEL_MIN}개 이상이어야 합니다`
        : `${WHEEL_MAX}개까지만 표가 있습니다`,
    }
  }
  const grids = parse(spec).map((idx) => idx.map((i) => clean[i]))
  const combos = choose(size, PICK)
  return {
    ok: true,
    pool: clean,
    size,
    guarantee,
    grids,
    count: grids.length,
    cost: grids.length * TICKET,
    // Tout acheter, pour comparer : c'est ce que la roue économise.
    fullCount: combos,
    fullCost: combos * TICKET,
    saving: combos / grids.length,
    overLimit: grids.length > LEGAL_GRIDS,
    // Et la part qu'aucune roue ne change.
    inPool: combos / SPACE,
    oncePer: Math.round(SPACE / combos),
  }
}

/**
 * La vérification, sans échantillon ni raccourci.
 *
 * On énumère les C(T,6) tirages possibles à l'intérieur de l'ensemble et on
 * exige que chacun partage au moins `guarantee` numéros avec une grille. Une
 * roue qui ne passe pas ce test ne garantit rien, quoi qu'en dise sa table :
 * c'est pour ça que la fonction est exportée et que les tests l'appellent
 * sur les vingt-quatre entrées.
 */
export function verifyWheel(pool, grids, guarantee) {
  const clean = [...pool].sort((a, b) => a - b)
  const masks = grids.map((g) => new Set(g))
  let targets = 0
  let uncovered = 0
  let worst = PICK

  const cur = []
  const walk = (start) => {
    if (cur.length === PICK) {
      targets++
      let best = 0
      for (const m of masks) {
        let c = 0
        for (const v of cur) if (m.has(v)) c++
        if (c > best) best = c
      }
      if (best < worst) worst = best
      if (best < guarantee) uncovered++
      return
    }
    for (let i = start; i < clean.length; i++) { cur.push(clean[i]); walk(i + 1); cur.pop() }
  }
  walk(0)
  return { ok: uncovered === 0, targets, uncovered, worst }
}

/**
 * Ce que la roue rapporte quand l'ensemble n'a attrapé que `k` gagnants.
 *
 * Le cas nominal — les six dedans — arrive une fois sur `oncePer`. Le reste
 * du temps l'ensemble en attrape trois, quatre ou cinq, et la garantie ne
 * s'applique plus. On renvoie donc, pour chaque k, la probabilité que
 * l'ensemble attrape exactement k gagnants : c'est la loi hypergéométrique,
 * et c'est elle qui remet la roue à sa place.
 */
export function poolHits(size) {
  const out = []
  for (let k = 0; k <= PICK; k++) {
    out.push((choose(size, k) * choose(NMAX - size, PICK - k)) / SPACE)
  }
  return out
}
