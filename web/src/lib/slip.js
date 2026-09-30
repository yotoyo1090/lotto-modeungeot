// L'impression sur le vrai bulletin 로또 6/45 — la HP OfficeJet Pro 8730
// marque les cases à la place du crayon.
//
// Tout est en millimètres, dans le repère du **bulletin posé à l'endroit** :
// panneaux A → E de gauche à droite, en-têtes « 1,000원 » en haut, origine au
// coin haut-gauche. Les cotes par défaut ont été relevées sur une photo redressée
// à 190 × 83 mm (±0,5 mm) : le mode test sert à les corriger, et
// `dx`/`dy` à rattraper ce que l'imprimante décale d'elle-même.
//
// Le bulletin fait 83 mm de large : il entre dans le bac **par le petit
// côté**, bout « Lotto » en premier. La page imprimée est donc en portrait
// (83 × 190), et chaque case est tournée d'un quart de tour pour y tomber.
import { NMAX } from '@core/draws.js'
import { cellOf } from '@core/shape.js'

export const PANELS = 5

export const SLIP_DEFAULTS = {
  width: 190,       // longueur du bulletin (bord Lotto → bord E)
  height: 83,       // largeur du bulletin
  // Cotes ajustées sur un vrai bulletin imprimé par la 8730 (29 marques
  // mesurées contre 196 cases, écart résiduel ≈ 0,15 mm).
  x1: 40.46,        // centre de la case 1 du panneau A, depuis le bord gauche
  y1: 11.75,        // … et depuis le bord du haut (côté en-têtes)
  col: 3.433,       // pas entre deux colonnes (1 → 2)
  row: 6.338,       // pas entre deux lignes (1 → 8)
  panel: 27.448,    // pas entre deux panneaux (A1 → B1)
  rot: 0.5,         // rotation (°) autour du centre du bulletin : le bulletin
                    // entre dans la 8730 légèrement de biais, et un décalage
                    // seul ne rattrape pas A et E à la fois
  markW: 1.8,       // la marque, dans le sens des colonnes
  markH: 2.8,       // … et des lignes — la case fait environ 2,7 × 3,9
  dx: 0,            // correction fine, dans le repère du bulletin
  dy: 0,
  flip: false,      // bulletin entré par le bout E plutôt que par le bout Lotto
  sheet: 'slip',    // 'slip' = page au format du bulletin ; 'left' · 'center' ·
                    // 'right' = page A4, bulletin calé de ce côté du bac
  top: 40,          // A4 : distance du haut de la feuille au bord du bulletin.
                    // À 0 le bulletin entre le premier et se coince ; plus
                    // bas, c'est la feuille qui entre et l'entraîne.
  dots: true,       // A4 : deux points en haut de la feuille, hors du bulletin.
                    // La 8730 semble mesurer la largeur là où elle commence à
                    // imprimer ; sans eux, elle tombe sur le bulletin et voit
                    // 83 mm au lieu de 210 — « ce n'est pas de l'A4 ».
}

// Le mode A4 : on garde une page que l'imprimante connaît, et on pose le
// bulletin dedans à l'endroit où il est dans le bac. Rien ne change dans le
// calcul des cases — seul le cadre du bulletin se décale sur la page.
const A4 = { w: 210, h: 297 }

/** Taille de la page imprimée et place du bulletin dans cette page. */
function frame(c) {
  if (c.sheet === 'slip' || !c.sheet) return { w: c.height, h: c.width, left: 0, top: 0 }
  const room = A4.w - c.height
  const left = c.sheet === 'right' ? room : c.sheet === 'center' ? room / 2 : 0
  // Le bulletin doit tenir en entier dans la page.
  const top = Math.min(Math.max(0, Number(c.top) || 0), A4.h - c.width)
  return { w: A4.w, h: A4.h, left, top }
}

// v2 : les cotes ont changé ; un réglage v1 enregistré les masquerait.
const KEY = 'lotto.slip.v2'

// Même prudence que `store.js` : un stockage refusé ne doit rien casser, on
// retombe simplement sur les cotes par défaut.
export function loadSlip() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return { ...SLIP_DEFAULTS, ...(saved ?? {}) }
  } catch {
    return { ...SLIP_DEFAULTS }
  }
}

export function saveSlip(cfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg))
  } catch { /* pas de stockage : le réglage vaut pour cette visite */ }
}

/** Centre d'une case, dans le repère du bulletin. */
function slipCenter(n, p, c) {
  const [r, k] = cellOf(n)
  const x = c.x1 + p * c.panel + k * c.col
  const y = c.y1 + r * c.row
  // Rotation autour du centre du bulletin, puis correction fine.
  const t = ((Number(c.rot) || 0) * Math.PI) / 180
  const ox = c.width / 2
  const oy = c.height / 2
  const dx = x - ox
  const dy = y - oy
  return [
    ox + dx * Math.cos(t) - dy * Math.sin(t) + c.dx,
    oy + dx * Math.sin(t) + dy * Math.cos(t) + c.dy,
  ]
}

/**
 * Le rectangle d'une case sur la page imprimée (portrait, largeur = c.height).
 * Quart de tour horaire : le bord gauche du bulletin devient le haut de la
 * page, son bord haut devient la droite. Les dimensions s'échangent.
 */
function pageRect(n, p, c, w = c.markW, h = c.markH) {
  const [sx, sy] = slipCenter(n, p, c)
  let px = c.height - sy
  let py = sx
  if (c.flip) { px = c.height - px; py = c.width - py }
  // Sur la page, la largeur de la marque est sa hauteur sur le bulletin.
  return { left: px - h / 2, top: py - w / 2, width: h, height: w }
}

const mm = (v) => `${v.toFixed(2)}mm`
const box = (r, cls) =>
  `<i class="${cls}" style="left:${mm(r.left)};top:${mm(r.top)};width:${mm(r.width)};height:${mm(r.height)}"></i>`

/** Les grilles par paquets de cinq — un bulletin chacun, A à E. */
export function toSlips(grids) {
  const out = []
  for (let k = 0; k < grids.length; k += PANELS) out.push(grids.slice(k, k + PANELS))
  return out
}

/** Une page de test : le contour de toutes les cases et une règle en mm. */
function testPage(c) {
  const parts = []
  for (let p = 0; p < PANELS; p++) {
    for (let n = 1; n <= NMAX; n++) {
      parts.push(box(pageRect(n, p, c, c.col - 0.6, c.row - 2.4), 'o'))
    }
    // Les coins de chaque panneau pleins : c'est eux qu'on aligne à la lumière.
    for (const n of [1, 7, 43]) parts.push(box(pageRect(n, p, c), 'm'))
  }
  // Graduation tous les millimètres sur les deux bords longs.
  for (let y = 0; y <= c.width; y++) {
    const len = y % 10 === 0 ? 4 : y % 5 === 0 ? 2.5 : 1.5
    parts.push(`<b style="top:${mm(y)};left:0;width:${mm(len)}"></b>`)
    parts.push(`<b style="top:${mm(y)};right:0;width:${mm(len)}"></b>`)
    if (y % 10 === 0 && y > 0) parts.push(`<u style="top:${mm(y - 1.2)};left:${mm(4.5)}">${y / 10}</u>`)
  }
  return page(`<div class="slip test">${parts.join('')}</div>`, c)
}

function slipPage(slip, c) {
  const parts = []
  slip.forEach((grid, p) => {
    for (const n of grid) parts.push(box(pageRect(n, p, c), 'm'))
  })
  return page(`<div class="slip">${parts.join('')}</div>`, c)
}

function page(inner, c) {
  const f = frame(c)
  const dots = c.sheet !== 'slip' && c.sheet && c.dots
    ? `<i class="m" style="left:10mm;top:5mm;width:1mm;height:1mm"></i>`
      + `<i class="m" style="right:10mm;top:5mm;width:1mm;height:1mm"></i>`
    : ''
  return `<div class="page">${dots}<div class="at" style="left:${mm(f.left)};top:${mm(f.top)}">${inner}</div></div>`
}

/** Le document complet, prêt pour `window.print()`. */
export function slipHtml(grids, c, { test = false } = {}) {
  const pages = test ? [testPage(c)] : toSlips(grids).map((s) => slipPage(s, c))
  const f = frame(c)
  return `<!doctype html><html><head><meta charset="utf-8"><title>로또 용지 인쇄</title>
<style>
@page { size: ${f.w}mm ${f.h}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { background: #fff; }
.page { position: relative; width: ${f.w}mm; height: ${f.h}mm;
        overflow: hidden; break-after: page; }
.at { position: absolute; }
.slip { position: relative; width: ${c.height}mm; height: ${c.width}mm; }
.page:last-child { break-after: auto; }
.test { outline: 0.2mm solid #000; outline-offset: -0.1mm; }
i { position: absolute; display: block; }
i.m { background: #000; }
i.o { border: 0.15mm solid #000; }
b { position: absolute; height: 0.15mm; background: #000; }
u { position: absolute; font: 2.2mm/1 sans-serif; text-decoration: none; }
@media screen { body { background: #888; padding: 10mm; }
  .page { background: #fff; margin: 0 auto 6mm; } }
</style></head><body>${pages.join('')}</body></html>`
}

/**
 * Ouvre le document dans une fenêtre à part et lance l'impression : la page
 * de l'application et ses styles n'ont rien à y faire. Rend false si le
 * navigateur a bloqué la fenêtre.
 */
export function printSlips(grids, c, opts) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(slipHtml(grids, c, opts))
  w.document.close()
  // `load` n'est pas fiable après document.write : on laisse au document
  // le temps de se mettre en page, puis on imprime une fois.
  setTimeout(() => { try { w.focus(); w.print() } catch { /* fermée */ } }, 400)
  return true
}
