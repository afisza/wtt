/** Prefix dla ścieżek API i assetów przy basePath (np. /wtt). Używaj w fetch() i src obrazków. */
export const basePath = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_BASE_PATH || '')
  : (process.env.NEXT_PUBLIC_BASE_PATH || '')
