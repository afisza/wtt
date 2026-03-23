/** Base path for API calls and assets. */
export const basePath = ''

/** URL do assetu (avatary, logo) – dodaje basePath do ścieżek względnych (zaczynających się od /). */
export function assetUrl(path: string | undefined | null): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const p = path.startsWith('/') ? path : `/${path}`
  return `${basePath}${p}`
}
