// Le vocabulaire et les formats, en un seul endroit.
//
// Les noms coréens sont ceux de la plateforme d'origine — ce sont ceux que
// tes utilisateurs connaissent. La glose française n'est là que pour les
// titres de section, en petit.

export const SECTION_LABELS = ['1–9', '10–19', '20–29', '30–39', '40–45']
export const SECTION_VARS = ['--s1', '--s2', '--s3', '--s4', '--s5']

/** L'ordre d'affichage : les six triés, puis le bonus. */
export const POSITION_LABELS = ['일', '이', '삼', '사', '오', '육', '보너스']

export const PRIZE_LABELS = { 1: '1등', 2: '2등', 3: '3등', 4: '4등', 5: '5등' }

/** La tranche de dizaines d'un numéro — 0 à 4. */
export function sectionOf(n) {
  if (n <= 9) return 0
  if (n <= 19) return 1
  if (n <= 29) return 2
  if (n <= 39) return 3
  return 4
}

const NUMBER = new Intl.NumberFormat('ko-KR')
export const num = (v) => (v === null || v === undefined ? '—' : NUMBER.format(v))

/** 1 234 567 890 → « 12억 3457만 원 » — la façon coréenne de lire une somme. */
export function won(amount) {
  if (!amount) return '—'
  // Au delà du 조 — mille milliards — un montant en 억 devient illisible :
  // « 385,259억 » ne se lit pas, « 38조 5,259억 » se lit. Le palier ne sert
  // qu'aux totaux cumulés, jamais à un gain.
  const jo = Math.floor(amount / 1_000_000_000_000)
  const eok = Math.floor((amount % 1_000_000_000_000) / 100_000_000)
  const man = Math.floor((amount % 100_000_000) / 10_000)
  if (jo > 0) return `${num(jo)}조${eok ? ` ${num(eok)}억` : ''} 원`
  if (eok > 0) return `${num(eok)}억${man ? ` ${num(man)}만` : ''} 원`
  if (man > 0) return `${num(man)}만 원`
  return `${num(amount)} 원`
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 2024-08-24 → « 2024.08.24 (토) ». */
export function day(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${WEEKDAY[date.getUTCDay()]})`
}

export const rang = (n) => `${num(n)}회`

/** Une valeur ramenée entre 0 et 1 — pour les fonds proportionnels. */
export const ratio = (value, max) => (max > 0 ? Math.min(1, value / max) : 0)
