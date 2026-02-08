/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/wtt',
  reactStrictMode: true,
  env: {
    TZ: 'Europe/Warsaw',
    /** basePath dla assetów (logo, favicon) – musi być zgodny z basePath powyżej */
    NEXT_PUBLIC_BASE_PATH: '/wtt',
  },
}

// Ustaw strefę czasową dla Node.js (działa również w Next.js)
if (typeof process !== 'undefined') {
  process.env.TZ = 'Europe/Warsaw'
}

module.exports = nextConfig



