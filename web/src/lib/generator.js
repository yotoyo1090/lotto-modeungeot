// Le client du fil de calcul.
//
// Deux règles seulement, mais elles font toute la différence à l'usage :
//
//   * une seule recherche à la fois — on garde la dernière demande en
//     attente et on jette celles qu'elle a rendues caduques ;
//   * les réponses arrivées trop tard sont ignorées, parce que faire
//     glisser un curseur en émet dix et qu'on ne veut voir que la dixième.

let worker = null
let sequence = 0
let pending = null       // { id, resolve, reject }
let queued = null        // la dernière demande reçue pendant qu'on calculait

function ensure() {
  if (worker) return worker
  worker = new Worker(new URL('./generator.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    if (!pending || data.id !== pending.id) return   // réponse périmée
    const { resolve, reject } = pending
    pending = null
    if (data.error) reject(new Error(data.error))
    else resolve(data.result)
    flush()
  }
  worker.onerror = (event) => {
    if (!pending) return
    const { reject } = pending
    pending = null
    reject(new Error(event.message ?? '계산 실패'))
    flush()
  }
  return worker
}

function flush() {
  if (pending || !queued) return
  const next = queued
  queued = null
  pending = next
  ensure().postMessage({
    id: next.id, product: next.product, filters: next.filters, options: next.options,
  })
}

export function search(product, filters, options = {}) {
  return new Promise((resolve, reject) => {
    // Une demande en attente n'a plus lieu d'être : celle-ci la remplace.
    if (queued) queued.reject(new SkippedError())
    queued = { id: ++sequence, product, filters, options, resolve, reject }
    flush()
  })
}

/** Une recherche abandonnée parce qu'une plus récente l'a remplacée. */
export class SkippedError extends Error {
  constructor() { super('취소됨') }
}

export const isSkipped = (error) => error instanceof SkippedError
