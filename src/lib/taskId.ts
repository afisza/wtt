/**
 * Generates a unique numeric task ID (min 6 digits).
 * IDs are random and must not collide with existingIds.
 */
export function generateTaskId(existingIds: Set<string>): string {
  const min = 100000
  const max = 999999
  let id: string
  let attempts = 0
  const maxAttempts = 500
  do {
    let n: number
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint8Array(4)
      crypto.getRandomValues(arr)
      n = (arr[0] << 16) | (arr[1] << 8) | arr[2] | (arr[3] << 24)
      n = Math.abs(n)
    } else {
      n = Math.floor(Math.random() * (max - min + 1)) + min
    }
    id = (n % (max - min + 1) + min).toString()
    attempts++
    if (attempts >= maxAttempts) {
      id = (Date.now() % 900000 + 100000).toString()
      while (existingIds.has(id)) id = (parseInt(id, 10) + 1).toString()
      break
    }
  } while (existingIds.has(id))
  return id
}

/** Prefiks numeru zadania widocznego w aplikacji i rozumianego przez bota Telegram („usuń WTT-323525”). */
export const TASK_REF_PREFIX = 'WTT-';

/** Czytelny numer zadania, np. `WTT-323525`. */
export function formatTaskRef(id: string): string {
  return `${TASK_REF_PREFIX}${id}`;
}

/** Wyciąga numer zadania z wpisanego tekstu: `wtt-323525`, `WTT 323525`, `#323525`, `323525`. */
export function parseTaskRef(input: string): string | null {
  const m = input.trim().match(/^(?:wtt[\s-]*|#)?(\d{6,12})$/i)
  return m ? m[1] : null
}
