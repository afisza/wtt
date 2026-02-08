/** Prefix dla ścieżek API i assetów przy basePath (np. /wtt). Używaj w fetch() i src obrazków. */
export const basePath = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_BASE_PATH || '')
  : (process.env.NEXT_PUBLIC_BASE_PATH || '')

/** URL do assetu (avatary, logo) – dodaje basePath do ścieżek względnych (zaczynających się od /). */
export function assetUrl(path: string | undefined | null): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const p = path.startsWith('/') ? path : `/${path}`
  return `${basePath}${p}`
}
