import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCommand } from '../src/utils/commandClassifier.ts';

describe('classifyCommand', () => {
  describe('Empty and whitespace inputs', () => {
    it('defaults to shell with confidence 1.0 for empty string', () => {
      const res = classifyCommand('');
      assert.strictEqual(res.type, 'shell');
      assert.strictEqual(res.suggestedMode, 'cmd');
      assert.strictEqual(res.confidence, 1.0);
    });

    it('defaults to shell for whitespace-only strings', () => {
      const res = classifyCommand('   \t\n  ');
      assert.strictEqual(res.type, 'shell');
      assert.strictEqual(res.suggestedMode, 'cmd');
      assert.strictEqual(res.confidence, 1.0);
    });
  });

  describe('Explicit prefixes', () => {
    it('classifies # as explicit AI prefix', () => {
      const res1 = classifyCommand('# check the server status');
      assert.strictEqual(res1.type, 'natural_language');
      assert.strictEqual(res1.suggestedMode, 'ai');
      assert.strictEqual(res1.confidence, 1.0);

      const res2 = classifyCommand('#git status');
      assert.strictEqual(res2.type, 'natural_language');
      assert.strictEqual(res2.suggestedMode, 'ai');
    });

    it('classifies $ as explicit shell prefix', () => {
      const res1 = classifyCommand('$ git status');
      assert.strictEqual(res1.type, 'shell');
      assert.strictEqual(res1.suggestedMode, 'cmd');
      assert.strictEqual(res1.confidence, 1.0);

      const res2 = classifyCommand('$');
      assert.strictEqual(res2.type, 'shell');
      assert.strictEqual(res2.suggestedMode, 'cmd');
    });

    it('classifies direct agent mentions (@agent)', () => {
      const res = classifyCommand('@claude refactor this function');
      assert.strictEqual(res.type, 'natural_language');
      assert.strictEqual(res.suggestedMode, 'ai');
      assert.strictEqual(res.confidence, 0.95);
    });
  });

  describe('Path-based executables', () => {
    it('detects relative path executables', () => {
      const res1 = classifyCommand('./run.sh');
      assert.strictEqual(res1.type, 'shell');
      assert.strictEqual(res1.suggestedMode, 'cmd');

      const res2 = classifyCommand('../scripts/deploy.py --prod');
      assert.strictEqual(res2.type, 'shell');
      assert.strictEqual(res2.suggestedMode, 'cmd');
    });

    it('detects home and absolute path executables', () => {
      const res1 = classifyCommand('~/bin/custom_tool');
      assert.strictEqual(res1.type, 'shell');
      assert.strictEqual(res1.suggestedMode, 'cmd');

      const res2 = classifyCommand('/usr/bin/env python3');
      assert.strictEqual(res2.type, 'shell');
      assert.strictEqual(res2.suggestedMode, 'cmd');
    });
  });

  describe('Environment variable assignments', () => {
    it('detects env variable assignments at start', () => {
      const res1 = classifyCommand('PORT=8080 npm start');
      assert.strictEqual(res1.type, 'shell');
      assert.strictEqual(res1.suggestedMode, 'cmd');

      const res2 = classifyCommand('RUST_LOG=debug cargo test');
      assert.strictEqual(res2.type, 'shell');
      assert.strictEqual(res2.suggestedMode, 'cmd');

      const res3 = classifyCommand('FOO=bar');
      assert.strictEqual(res3.type, 'shell');
      assert.strictEqual(res3.suggestedMode, 'cmd');
    });

    it('detects shell variable and command expansions', () => {
      const res1 = classifyCommand('$HOME/script.sh');
      assert.strictEqual(res1.type, 'shell');
      assert.strictEqual(res1.suggestedMode, 'cmd');

      const res2 = classifyCommand('$(which cargo) --version');
      assert.strictEqual(res2.type, 'shell');
      assert.strictEqual(res2.suggestedMode, 'cmd');
    });
  });

  describe('Shell syntax operators and CLI flags', () => {
    it('detects pipes and redirections', () => {
      const res1 = classifyCommand('cat app.log | grep -i error');
      assert.strictEqual(res1.type, 'shell');
      assert.strictEqual(res1.suggestedMode, 'cmd');

      const res2 = classifyCommand('echo "test" > output.txt');
      assert.strictEqual(res2.type, 'shell');
      assert.strictEqual(res2.suggestedMode, 'cmd');

      const res3 = classifyCommand('app 2>&1 > /dev/null');
      assert.strictEqual(res3.type, 'shell');
      assert.strictEqual(res3.suggestedMode, 'cmd');
    });

    it('detects chaining and backgrounding', () => {
      const res1 = classifyCommand('npm run build && npm test');
      assert.strictEqual(res1.type, 'shell');
      assert.strictEqual(res1.suggestedMode, 'cmd');

      const res2 = classifyCommand('cargo check; cargo test');
      assert.strictEqual(res2.type, 'shell');
      assert.strictEqual(res2.suggestedMode, 'cmd');

      const res3 = classifyCommand('sleep 10 &');
      assert.strictEqual(res3.type, 'shell');
      assert.strictEqual(res3.suggestedMode, 'cmd');
    });

    it('detects CLI flags on unknown commands', () => {
      const res1 = classifyCommand('customcli --all --verbose');
      assert.strictEqual(res1.type, 'shell');
      assert.strictEqual(res1.suggestedMode, 'cmd');

      const res2 = classifyCommand('mytool -la');
      assert.strictEqual(res2.type, 'shell');
      assert.strictEqual(res2.suggestedMode, 'cmd');
    });
  });

  describe('Recognized CLI binaries', () => {
    it('classifies standard developer binaries', () => {
      const binaries = [
        'git status',
        'cargo check --workspace',
        'npm run dev',
        'docker ps -a',
        'ls -la /tmp',
        'pwd',
        'cat src/main.rs',
        'grep -rn "TODO" .',
        'curl -sSL https://api.github.com',
        'kill -9 12345',
        'python3 script.py',
      ];

      for (const cmd of binaries) {
        const res = classifyCommand(cmd);
        assert.strictEqual(res.type, 'shell', `Expected '${cmd}' to be shell`);
        assert.strictEqual(res.suggestedMode, 'cmd');
      }
    });

    it('preserves shell mode when quoted commit message has question mark', () => {
      const res = classifyCommand('git commit -m "why did this fail?"');
      assert.strictEqual(res.type, 'shell');
      assert.strictEqual(res.suggestedMode, 'cmd');
    });

    it('supports host-detected tool names', () => {
      const res = classifyCommand('mycustomdaemon status', ['mycustomdaemon']);
      assert.strictEqual(res.type, 'shell');
      assert.strictEqual(res.suggestedMode, 'cmd');
    });

    it('identifies conversational phrasing after binary names', () => {
      const res1 = classifyCommand('find all markdown files in the docs directory');
      assert.strictEqual(res1.type, 'natural_language');
      assert.strictEqual(res1.suggestedMode, 'ai');

      const res2 = classifyCommand('check if the postgres container is running');
      assert.strictEqual(res2.type, 'natural_language');
      assert.strictEqual(res2.suggestedMode, 'ai');
    });
  });

  describe('Natural language interrogatives and conversational openers', () => {
    it('detects multi-word conversational openers', () => {
      const queries = [
        'how do I undo the last git commit?',
        'how to configure tailwind css in vite',
        'what is the difference between pty and tty',
        'why did cargo test fail with exit code 101',
        'can you refactor this React hook?',
        'please explain how the PTY ring buffer works',
        'tell me what ports are currently listening',
        'where is the configuration file for aetherd',
        'write a bash script to backup the database',
        'create a new test for the command classifier',
      ];

      for (const q of queries) {
        const res = classifyCommand(q);
        assert.strictEqual(res.type, 'natural_language', `Expected '${q}' to be natural_language`);
        assert.strictEqual(res.suggestedMode, 'ai');
        assert.ok(res.confidence >= 0.85);
      }
    });

    it('detects single-word conversational starters and action verbs', () => {
      const res1 = classifyCommand('explain why the terminal canvas flickers');
      assert.strictEqual(res1.type, 'natural_language');
      assert.strictEqual(res1.suggestedMode, 'ai');

      const res2 = classifyCommand('debug the panic in crates/aetherd/src/main.rs');
      assert.strictEqual(res2.type, 'natural_language');
      assert.strictEqual(res2.suggestedMode, 'ai');

      const res3 = classifyCommand('fix the broken imports in ModernInputBar');
      assert.strictEqual(res3.type, 'natural_language');
      assert.strictEqual(res3.suggestedMode, 'ai');
    });

    it('detects punctuation markers (?, !)', () => {
      const res1 = classifyCommand('Is strict mode enabled in tsconfig?');
      assert.strictEqual(res1.type, 'natural_language');
      assert.strictEqual(res1.suggestedMode, 'ai');

      const res2 = classifyCommand('Please stop this command right now!');
      assert.strictEqual(res2.type, 'natural_language');
      assert.strictEqual(res2.suggestedMode, 'ai');
    });

    it('detects natural language stop-word frequency', () => {
      const res = classifyCommand('list all the files in the folder with their sizes');
      assert.strictEqual(res.type, 'natural_language');
      assert.strictEqual(res.suggestedMode, 'ai');
    });
  });
});
