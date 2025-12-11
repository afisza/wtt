// Skrypt migracyjny: Przypisz istniejące dane JSON do klienta "Best Market"
// Uruchom: node scripts/migrate_json_to_clients.js

const fs = require('fs')
const path = require('path')

const DATA_FILE = path.join(__dirname, '..', 'data', 'work-time.json')
const CLIENTS_FILE = path.join(__dirname, '..', 'data', 'clients.json')

console.log('Starting JSON data migration to clients structure...')

try {
  // 1. Sprawdź czy plik work-time.json istnieje
  if (!fs.existsSync(DATA_FILE)) {
    console.log('No work-time.json file found. Nothing to migrate.')
    process.exit(0)
  }

  // 2. Wczytaj istniejące dane
  const workTimeData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
  console.log('Loaded work-time.json')

  // 3. Wczytaj lub utwórz plik clients.json
  let clientsData = {}
  if (fs.existsSync(CLIENTS_FILE)) {
    clientsData = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf-8'))
    console.log('Loaded clients.json')
  } else {
    console.log('Creating new clients.json')
  }

  // 4. Przejdź przez wszystkich użytkowników w work-time.json
  const newWorkTimeData = {}
  let migratedUsers = 0
  let migratedMonths = 0

  for (const [userId, userData] of Object.entries(workTimeData)) {
    // Sprawdź czy użytkownik ma dane (stara struktura: userId -> monthKey -> dateKey)
    if (userData && typeof userData === 'object') {
      // Sprawdź czy to stara struktura (bez clientId)
      const firstKey = Object.keys(userData)[0]
      if (firstKey && firstKey.match(/^\d{4}-\d{2}$/)) {
        // To stara struktura - migruj do nowej
        console.log(`Migrating user ${userId}...`)

        // Utwórz domyślnego klienta "Best Market" dla tego użytkownika
        if (!clientsData[userId]) {
          clientsData[userId] = []
        }

        // Sprawdź czy klient "Best Market" już istnieje
        let bestMarketClient = clientsData[userId].find(c => c.name === 'Best Market')
        if (!bestMarketClient) {
          bestMarketClient = {
            id: Date.now(),
            name: 'Best Market',
            logo: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
          clientsData[userId].push(bestMarketClient)
          console.log(`  Created client "Best Market" for user ${userId}`)
        }

        // Migruj dane do nowej struktury: userId -> clientId -> monthKey -> dateKey
        if (!newWorkTimeData[userId]) {
          newWorkTimeData[userId] = {}
        }
        if (!newWorkTimeData[userId][bestMarketClient.id]) {
          newWorkTimeData[userId][bestMarketClient.id] = {}
        }

        // Skopiuj wszystkie miesiące
        for (const [monthKey, monthData] of Object.entries(userData)) {
          newWorkTimeData[userId][bestMarketClient.id][monthKey] = monthData
          migratedMonths++
        }

        migratedUsers++
        console.log(`  Migrated ${Object.keys(userData).length} months for user ${userId}`)
      } else {
        // To już nowa struktura - skopiuj bez zmian
        newWorkTimeData[userId] = userData
        console.log(`User ${userId} already has new structure, skipping...`)
      }
    }
  }

  // 5. Zapisz zaktualizowane dane
  if (migratedUsers > 0) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(newWorkTimeData, null, 2), 'utf-8')
    console.log(`\nMigrated work-time.json: ${migratedUsers} users, ${migratedMonths} months`)
  } else {
    console.log('\nNo data to migrate - structure is already correct')
  }

  // 6. Zapisz clients.json
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clientsData, null, 2), 'utf-8')
  console.log('Updated clients.json')

  console.log('\nMigration completed successfully!')
} catch (error) {
  console.error('Migration error:', error)
  process.exit(1)
}




