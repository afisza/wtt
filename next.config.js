/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/wtt',
  reactStrictMode: true,
  env: {
    // Ustaw domyślną strefę czasową na Warszawa (Polska)
    TZ: 'Europe/Warsaw',
  },
}

// Ustaw strefę czasową dla Node.js (działa również w Next.js)
if (typeof process !== 'undefined') {
  process.env.TZ = 'Europe/Warsaw'
}

module.exports = nextConfig



