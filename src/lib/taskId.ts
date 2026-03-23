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
