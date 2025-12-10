// Skrypt do konwersji czcionki TTF na format jsPDF
// Użyj: node convert-font.js
const fs = require('fs');
const path = require('path');

const fontPath = path.join(__dirname, 'public/fonts/roboto-regular.ttf');
const outputPath = path.join(__dirname, 'lib/roboto-font.js');

if (!fs.existsSync(fontPath)) {
  console.error('Plik czcionki nie istnieje:', fontPath);
  process.exit(1);
}

const fontData = fs.readFileSync(fontPath);
const base64Font = fontData.toString('base64');

const jsContent = `// Czcionka Roboto dla jsPDF
// Wygenerowana automatycznie
export const robotoFontBase64 = \`${base64Font}\`;
export const robotoFontName = 'Roboto-Regular.ttf';
`;

fs.writeFileSync(outputPath, jsContent);
console.log('Czcionka została skonwertowana i zapisana w:', outputPath);
