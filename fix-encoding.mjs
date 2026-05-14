import { readFileSync, writeFileSync } from 'fs';

const file = 'public/pcdl/app.js';
let t = readFileSync(file, 'utf8');

// Remove BOM
if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);

// Each entry: [array of codepoints to match, replacement string]
const FIXES = [
  // Text patterns
  [[0x00C2, 0x00B7], '·'],                         // Â· → ·
  [[0x00E2, 0x20AC, 0x201D], '—'],                 // â€" → —
  [[0x00E2, 0x2020, 0x2019], '→'],                 // â†' → →
  [[0x00E2, 0x20AC, 0x2122], '’'],                 // â€™ → '
  [[0x00E2, 0x20AC, 0x00A2], '•'],                 // â€¢ → •
  [[0x00E2, 0x20AC, 0x00A6], '…'],                 // â€¦ → …
  [[0x00C3, 0x2014], '×'],                         // Ã— → ×
  // Emojis (codepoint sequences from analysis)
  [[0x00F0, 0x0178, 0x008F, 0x00A0], '\u{1F3E0}'],     // 🏠
  [[0x00E2, 0x2013, 0x00B6, 0x00EF, 0x00B8, 0x008F], '▶️'], // ▶️
  [[0x00F0, 0x0178, 0x201D, 0x201E], '\u{1F504}'],     // 🔄
  [[0x00F0, 0x0178, 0x2018, 0x00A5], '\u{1F465}'],     // 👥
  [[0x00F0, 0x0178, 0x2019, 0x00AC], '\u{1F4AC}'],     // 💬
  [[0x00F0, 0x0178, 0x201C, 0x0160], '\u{1F4CA}'],     // 📊
  [[0x00F0, 0x0178, 0x201D, 0x00A5], '\u{1F525}'],     // 🔥
];

for (const [cps, replacement] of FIXES) {
  const target = String.fromCodePoint(...cps);
  t = t.split(target).join(replacement);
}

// Comment dividers: U+00E2 U+2022 U+0090 repeating → ═ (box drawing)
const dividerChar = String.fromCodePoint(0x00E2, 0x2022, 0x0090);
const dividerRx = new RegExp(`// (${dividerChar.replace(/./g, c => `\\u${c.codePointAt(0).toString(16).padStart(4,'0')}`)})+ *`, 'g');
t = t.replace(/\/\/ [â•]+/g, '// ' + '─'.repeat(44));

writeFileSync(file, t, 'utf8');

// Verify remaining non-ASCII
const seen = new Set();
const rx = /[^\x00-\x7E]+/g;
let m;
let remaining = 0;
while ((m = rx.exec(t)) !== null) {
  const s = m[0];
  if (!seen.has(s)) {
    seen.add(s);
    const cps = [...s].map(c => 'U+' + c.codePointAt(0).toString(16).padStart(4,'0')).join(' ');
    console.log(JSON.stringify(s), '->', cps);
    remaining++;
  }
}
console.log(`\nDone. ${remaining} unique non-ASCII sequences remaining. File length: ${t.length}`);
