import fs from 'fs';
import path from 'path';

const files = [
  '/home/rasshqa/projects/Elliot/ui/src/components/TopBar.tsx',
  '/home/rasshqa/projects/Elliot/ui/src/components/InputBar.tsx',
];

console.log('--- Scanning for Non-ASCII and Emoji Characters ---');
const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]/u;

let nonAsciiTotal = 0;
let emojiTotal = 0;

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  console.log(`Scanning: ${f}`);
  lines.forEach((line, lineIdx) => {
    // Check line for emojis
    if (emojiRegex.test(line)) {
      console.log(`[EMOJI] ${path.basename(f)}:${lineIdx + 1} -> ${line.trim()}`);
      emojiTotal++;
    }

    // Check individual non-ASCII characters
    for (let i = 0; i < line.length; i++) {
      const cp = line.codePointAt(i);
      if (cp !== undefined && cp > 127) {
        const char = String.fromCodePoint(cp);
        console.log(`[NON-ASCII] ${path.basename(f)}:${lineIdx + 1} Char: '${char}' (U+${cp.toString(16).toUpperCase().padStart(4, '0')}) | Line: ${line.trim()}`);
        nonAsciiTotal++;
        if (cp > 0xffff) i++;
      }
    }
  });
}

console.log(`Scan Summary: ${emojiTotal} emojis, ${nonAsciiTotal} non-ASCII characters.`);
