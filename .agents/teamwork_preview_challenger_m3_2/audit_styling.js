import fs from 'fs';
import path from 'path';

const files = [
  '/home/rasshqa/projects/Elliot/ui/src/components/TopBar.tsx',
  '/home/rasshqa/projects/Elliot/ui/src/components/InputBar.tsx',
];

console.log('--- Neo-Brutalism Styling Audit ---');

const gradientRegex = /(gradient|bg-gradient|linear-gradient|radial-gradient)/i;
const glassmorphismRegex = /(backdrop-blur|backdrop-filter|glass)/i;
const shadowRegex = /(shadow(-[a-z0-9/\[\]_#]+)?|boxShadow)/i;

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  console.log(`\n=== Auditing ${path.basename(f)} ===`);

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (gradientRegex.test(line)) {
      console.log(`[GRADIENT FOUND] ${lineNum}: ${line.trim()}`);
    }
    if (glassmorphismRegex.test(line)) {
      console.log(`[GLASSMORPHISM FOUND] ${lineNum}: ${line.trim()}`);
    }
    if (shadowRegex.test(line)) {
      // Find all matches of shadow classes or styles
      console.log(`[SHADOW FOUND] ${lineNum}: ${line.trim()}`);
    }
  });
});
