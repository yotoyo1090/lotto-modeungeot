// Réduire une page HTML à ce qu'elle dit.
//
// Le crawler ne s'appuie sur aucun sélecteur CSS. Un site qui refait son
// habillage — et dhlottery le fait — casserait `.win_result .num` du jour au
// lendemain, sans prévenir, et le crawler écrirait alors des données fausses
// ou rien du tout.
//
// À la place : on jette le balisage, on garde les fragments de texte, et on
// reconnaît les données à leur **forme**. « Sept nombres entre 1 et 45 dont
// les six premiers montent » n'est pas une classe CSS, c'est ce qu'est un
// tirage. Cette signature survit à un changement de thème ; elle ne survit
// pas à un changement de *données*, et c'est exactement ce qu'on veut
// détecter.

// Une coupure entre deux fragments. Un caractère qui ne peut pas figurer
// dans une page : découper sur une simple espace séparerait « 2024년 08월
// 24일 » en trois, alors que c'est une seule date écrite d'un trait.
const CUT = '\u0000'

/** Les fragments de texte d'une page, dans l'ordre, vidés du balisage. */
export function runs(html) {
  const cleaned = String(html)
    // Scripts, styles et commentaires ne portent pas de données affichées.
    .replace(/<script\b[\s\S]*?<\/script>/gi, CUT)
    .replace(/<style\b[\s\S]*?<\/style>/gi, CUT)
    .replace(/<!--[\s\S]*?-->/g, CUT)
    .replace(/<[^>]+>/g, CUT)          // chaque balise devient une coupure

  return cleaned.split(CUT)
    .map(decode)
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter((text) => text.length > 0)
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
}

export function decode(text) {
  return String(text).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

/** Les entiers portés par un fragment, séparateurs de milliers compris. */
export function integers(text) {
  return [...String(text).matchAll(/\d[\d,]*/g)]
    .map((m) => Number(m[0].replace(/,/g, '')))
    .filter(Number.isFinite)
}

/** Un fragment qui n'est qu'un entier — rien d'autre autour. */
export function soleInteger(text) {
  const match = /^(\d[\d,]*)$/.exec(String(text).trim())
  return match ? Number(match[1].replace(/,/g, '')) : null
}
