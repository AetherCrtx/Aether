import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = '/home/rasshqa/projects/Elliot';
const UI_DIR = path.join(ROOT_DIR, 'ui');
const SRC_DIR = path.join(UI_DIR, 'src');

console.log('================================================================');
console.log(' Milestone 3 Challenger 2: Adversarial Constraint & Style Audit');
console.log('================================================================\n');

const results = {
  modernInputBar: { passed: false, details: [] },
  byok: { passed: false, details: [] },
  unicodeScan: { passed: false, emojis: [], nonAscii: [] },
  stylingScan: { passed: false, gradients: [], glassmorphism: [], glowingShadows: [] },
};

// -----------------------------------------------------------------------------
// 1. Scan for forbidden term 'Modern Input Bar'
// -----------------------------------------------------------------------------
console.log('[1/4] Scanning for forbidden term "Modern Input Bar"...');
function scanDirForModernInputBar(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        scanDirForModernInputBar(fullPath);
      }
    } else if (/\.(tsx?|jsx?|html|css|json)$/.test(entry.name) && entry.name !== 'ModernInputBar.tsx') {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (/Modern\s+Input\s+Bar/i.test(line)) {
          results.modernInputBar.details.push({
            file: path.relative(ROOT_DIR, fullPath),
            line: idx + 1,
            content: line.trim(),
          });
        }
      });
    }
  }
}
scanDirForModernInputBar(SRC_DIR);
results.modernInputBar.passed = results.modernInputBar.details.length === 0;
console.log(`  -> Occurrences in ui/src: ${results.modernInputBar.details.length}`);
if (!results.modernInputBar.passed) {
  console.log('  Violations found:', results.modernInputBar.details);
}

// -----------------------------------------------------------------------------
// 2. Exhaustive scan for 'BYOK' (case-insensitive) across entire codebase
// -----------------------------------------------------------------------------
console.log('\n[2/4] Exhaustive scan for "BYOK" (case-insensitive) across codebase...');
function scanDirForByok(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name !== 'node_modules' &&
        entry.name !== '.git' &&
        entry.name !== 'target' &&
        entry.name !== 'dist' &&
        entry.name !== '.agents' &&
        entry.name !== 'graphify-out'
      ) {
        scanDirForByok(fullPath);
      }
    } else if (/\.(tsx?|jsx?|rs|toml|html|css)$/.test(entry.name)) {
      // Exclude tests that specifically assert negative match for BYOK
      const isTestFile = fullPath.includes('/tests/') || entry.name.endsWith('.test.ts');
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (/\bBYOK\b/i.test(line)) {
          // If in a test file, check if it's an assertion testing for BYOK absence
          if (isTestFile && (/assert|match|\.includes|Prohibited/i.test(line))) {
            return;
          }
          results.byok.details.push({
            file: path.relative(ROOT_DIR, fullPath),
            line: idx + 1,
            content: line.trim(),
          });
        }
      });
    }
  }
}
scanDirForByok(ROOT_DIR);
results.byok.passed = results.byok.details.length === 0;
console.log(`  -> Non-test code occurrences of BYOK: ${results.byok.details.length}`);
if (!results.byok.passed) {
  console.log('  Violations found:', results.byok.details);
}

// -----------------------------------------------------------------------------
// 3. Adversarial Unicode scan in TopBar.tsx and InputBar.tsx
// -----------------------------------------------------------------------------
console.log('\n[3/4] Adversarial Unicode & Emoji scan in TopBar.tsx and InputBar.tsx...');
const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]/u;
const targetFiles = [
  path.join(SRC_DIR, 'components/TopBar.tsx'),
  path.join(SRC_DIR, 'components/InputBar.tsx'),
];

for (const tf of targetFiles) {
  const content = fs.readFileSync(tf, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (emojiRegex.test(line)) {
      results.unicodeScan.emojis.push({
        file: path.basename(tf),
        line: idx + 1,
        content: line.trim(),
      });
    }
    for (let i = 0; i < line.length; i++) {
      const cp = line.codePointAt(i);
      if (cp !== undefined && cp > 127) {
        const char = String.fromCodePoint(cp);
        results.unicodeScan.nonAscii.push({
          file: path.basename(tf),
          line: idx + 1,
          char,
          codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
          context: line.trim(),
        });
        if (cp > 0xffff) i++;
      }
    }
  });
}
results.unicodeScan.passed = results.unicodeScan.emojis.length === 0;
console.log(`  -> Emojis found: ${results.unicodeScan.emojis.length}`);
console.log(`  -> Non-ASCII characters found: ${results.unicodeScan.nonAscii.length}`);
if (results.unicodeScan.nonAscii.length > 0) {
  console.log('  Non-ASCII details:', results.unicodeScan.nonAscii);
}

// -----------------------------------------------------------------------------
// 4. Styling verification in TopBar and InputBar (0 gradients, 0 glass, 0 glow)
// -----------------------------------------------------------------------------
console.log('\n[4/4] Flat Neo-brutalism Styling scan (gradients, glassmorphism, glowing shadows)...');
for (const tf of targetFiles) {
  const content = fs.readFileSync(tf, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    // Check gradients
    if (/(gradient|bg-gradient|linear-gradient|radial-gradient)/i.test(line)) {
      results.stylingScan.gradients.push({
        file: path.basename(tf),
        line: lineNum,
        content: line.trim(),
      });
    }
    // Check glassmorphism
    if (/(backdrop-blur|backdrop-filter|glass)/i.test(line)) {
      results.stylingScan.glassmorphism.push({
        file: path.basename(tf),
        line: lineNum,
        content: line.trim(),
      });
    }
    // Check glowing shadows (colored shadows or explicit blur glow)
    if (/(shadow-\[.*#[0-9a-fA-F]+.*\]|shadow-[a-z]+-[0-9]+\/[0-9]+|boxShadow:.*#[0-9a-fA-F]+)/i.test(line)) {
      results.stylingScan.glowingShadows.push({
        file: path.basename(tf),
        line: lineNum,
        content: line.trim(),
      });
    }
  });
}

console.log(`  -> Gradients detected: ${results.stylingScan.gradients.length}`);
console.log(`  -> Glassmorphism detected: ${results.stylingScan.glassmorphism.length}`);
console.log(`  -> Glowing shadows detected: ${results.stylingScan.glowingShadows.length}`);
if (results.stylingScan.glowingShadows.length > 0) {
  console.log('  Glowing shadow details:', results.stylingScan.glowingShadows);
}

console.log('\n================================================================');
console.log(' SUMMARY REPORT');
console.log('================================================================');
console.log(`1. 'Modern Input Bar' forbidden scan: ${results.modernInputBar.passed ? 'PASS (0 occurrences)' : 'FAIL'}`);
console.log(`2. 'BYOK' (case-insensitive) scan: ${results.byok.passed ? 'PASS (0 occurrences in code)' : 'FAIL'}`);
console.log(`3. Unicode scan: ${results.unicodeScan.passed ? 'PASS (0 emojis)' : 'FAIL'}`);
console.log(`4. Styling scan: Gradients=${results.stylingScan.gradients.length}, Glassmorphism=${results.stylingScan.glassmorphism.length}, GlowingShadows=${results.stylingScan.glowingShadows.length}`);
