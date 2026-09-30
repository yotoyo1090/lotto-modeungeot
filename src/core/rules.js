// 기본상식 — les règles des deux jeux, et ce que rapporte chaque rang.
//
// Rien ici ne se calcule : ce sont les règles publiées des deux produits.
// Elles sont écrites une fois, à un seul endroit, et les pages s'y réfèrent
// — un chiffre faux ne peut donc pas exister à deux endroits différents.
//
// Sources : 동행복권, 나무위키 로또 6/45 et 연금복권. Vérifiées en août 2026.
// Les montants réels distribués, eux, viennent de la base : ce fichier ne
// porte que la règle, jamais un chiffre observé.

/** Le prix d'un jeu, identique pour les deux produits. */
export const TICKET = 1000

// ────────────────────────────────────────────────────────────── 로또 6/45

export const LOTTO_RULES = {
  key: 'lotto',
  label: '로또 6/45',
  price: TICKET,
  draw: '매주 토요일 20시 35분',
  pick: '1–45 중 여섯 개',
  space: 8145060,
  // La moitié des ventes revient aux joueurs ; l'autre moitié va au fonds
  // public. C'est la loi qui le fixe, pas l'opérateur.
  payout: 0.5,
  note: '판매액의 약 50%가 당첨금으로 돌아갑니다 — 나머지는 복권기금입니다.',
  ranks: [
    {
      rank: 1, label: '1등', match: '여섯 개 모두',
      odds: 8145060, share: 0.75,
      prize: '당첨금의 75%를 나눠 가집니다',
    },
    {
      rank: 2, label: '2등', match: '다섯 개 + 보너스',
      odds: 1357510, share: 0.125,
      prize: '당첨금의 12.5%',
    },
    {
      rank: 3, label: '3등', match: '다섯 개',
      odds: 35724, share: 0.125,
      prize: '당첨금의 12.5%',
    },
    {
      rank: 4, label: '4등', match: '네 개',
      odds: 733, fixed: 50000,
      prize: '고정 50,000원',
    },
    {
      rank: 5, label: '5등', match: '세 개',
      odds: 45, fixed: 5000,
      prize: '고정 5,000원',
    },
  ],
  // Ce que la répartition veut dire, et qui n'est jamais écrit sur le billet.
  how: [
    '4등과 5등은 **고정 금액**입니다 — 당첨자가 몇 명이든 같습니다.',
    '그 둘을 먼저 떼어낸 **나머지**를 1·2·3등이 75 : 12.5 : 12.5로 나눕니다.',
    '그래서 1등 금액은 **당첨자 수에 따라 달라집니다** — 혼자면 전부, 열 명이면 십분의 일.',
    '이월된 회차가 있으면 그 금액이 다음 회차 1등에 더해집니다.',
  ],
}

// ───────────────────────────────────────────────────────── 연금복권 720+

/**
 * Le 연금복권 est un jeu **de billet**, pas de grille : on ne choisit pas ses
 * numéros, on achète un billet déjà imprimé. Toute la partie « générateur »
 * du 6/45 n'a donc pas le même sens ici — elle sert à trier les billets
 * qu'on pourrait prendre, pas à composer une combinaison.
 */
export const PENSION_RULES = {
  key: 'pension',
  label: '연금복권 720+',
  price: TICKET,
  draw: '매주 목요일 19시 05분',
  pick: '1–5조 × 여섯 자리 (000000–999999)',
  space: 5000000,
  tickets: '한 회차 500만 매 (조마다 100만 매)',
  note: '번호를 고르는 게임이 아닙니다 — 이미 인쇄된 표를 삽니다.',
  ranks: [
    {
      rank: 1, label: '1등', match: '조 + 여섯 자리 모두',
      odds: 5000000,
      prize: '매월 700만원 × 20년', total: 7000000 * 12 * 20, annuity: true,
    },
    {
      rank: 2, label: '2등', match: '여섯 자리 일치 · 조는 다름',
      odds: 1250000,
      prize: '매월 100만원 × 10년', total: 1000000 * 12 * 10, annuity: true,
    },
    {
      rank: 0, label: '보너스', match: '따로 뽑은 여섯 자리 · 조 무관',
      odds: 1000000,
      prize: '매월 100만원 × 10년', total: 1000000 * 12 * 10, annuity: true,
      bonus: true,
    },
    { rank: 3, label: '3등', match: '뒤 다섯 자리', odds: 111111, fixed: 1000000, prize: '1,000,000원' },
    { rank: 4, label: '4등', match: '뒤 네 자리', odds: 11111, fixed: 100000, prize: '100,000원' },
    { rank: 5, label: '5등', match: '뒤 세 자리', odds: 1111, fixed: 50000, prize: '50,000원' },
    { rank: 6, label: '6등', match: '뒤 두 자리', odds: 111, fixed: 5000, prize: '5,000원' },
    { rank: 7, label: '7등', match: '뒤 한 자리', odds: 11, fixed: 1000, prize: '1,000원' },
  ],
  how: [
    '3등부터 7등까지는 **뒷자리만** 맞으면 됩니다 — 앞자리는 보지 않습니다.',
    '그래서 확률이 1/111, 1/1,111처럼 **1이 이어지는 꼴**입니다 — 아래 자리를 이미 맞힌 경우를 빼기 때문입니다.',
    '**보너스**는 1·2등과 따로 뽑습니다. 1등을 놓친 표에도 기회가 한 번 더 있습니다.',
    '1·2등과 보너스는 **연금**입니다 — 한 번에 받지 않고 매달 나옵니다. 22%의 세금이 붙습니다.',
  ],
}

export const RULES = { lotto: LOTTO_RULES, pension: PENSION_RULES }

/**
 * La chance qu'un rang tombe sur `games` jeux — pas « une sur N » mais la
 * probabilité réelle de toucher au moins une fois.
 *
 * C'est le chiffre qui manque toujours : « une sur 8 145 060 » ne dit rien
 * tant qu'on n'a pas vu ce que ça vaut sur mille tickets.
 */
export function chanceOver(odds, games) {
  const p = 1 / odds
  return 1 - (1 - p) ** games
}

/** Depuis combien d'années il faudrait jouer, à un jeu par tirage. */
export function yearsFor(odds, drawsPerYear = 52) {
  return odds / drawsPerYear
}
