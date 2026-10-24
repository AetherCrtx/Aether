export type CommandClassification = 'shell' | 'natural_language';

export interface ClassificationResult {
  type: CommandClassification;
  confidence: number; // 0.0 to 1.0
  reason: string;
  suggestedMode: 'cmd' | 'ai';
}

/**
 * Standard POSIX, developer, build, and system CLI binaries.
 */
const COMMON_SHELL_BINARIES = new Set([
  // Version control & package managers
  'git', 'gh', 'cargo', 'rustc', 'rustup', 'npm', 'pnpm', 'yarn', 'bun', 'npx',
  'pip', 'pip3', 'python', 'python3', 'node', 'deno', 'go', 'gem', 'bundle', 'ruby',
  'java', 'javac', 'mvn', 'gradle', 'dotnet', 'composer', 'php', 'perl',

  // Containers & orchestration
  'docker', 'docker-compose', 'podman', 'kubectl', 'helm', 'terraform', 'vagrant',

  // Navigation, inspection & files
  'ls', 'cd', 'pwd', 'cat', 'less', 'more', 'head', 'tail', 'touch', 'mkdir', 'rm',
  'rmdir', 'cp', 'mv', 'ln', 'find', 'locate', 'which', 'whereis', 'file', 'stat',
  'tree', 'eza', 'bat', 'fd', 'rg', 'grep', 'wc',

  // System, network & processes
  'curl', 'wget', 'ssh', 'scp', 'rsync', 'ping', 'netstat', 'ss', 'ip', 'ifconfig',
  'traceroute', 'dig', 'nslookup', 'ps', 'top', 'htop', 'btop', 'kill', 'killall',
  'pkill', 'systemctl', 'journalctl', 'service', 'df', 'du', 'free', 'uname',
  'uptime', 'whoami', 'id', 'chmod', 'chown', 'chgrp',

  // Compression & text manipulation
  'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'bzip2', 'xz', 'sed', 'awk', 'cut',
  'sort', 'uniq', 'tr', 'xargs', 'diff', 'patch', 'tee', 'echo', 'printf',
  'clear', 'reset', 'exit', 'history', 'alias', 'export', 'source', 'env',

  // Build tools & editors
  'make', 'cmake', 'ninja', 'just', 'gcc', 'g++', 'clang', 'clang++', 'ld',
  'vim', 'nvim', 'vi', 'nano', 'emacs', 'code', 'zed',

  // Shells & terminal utilities
  'bash', 'sh', 'zsh', 'fish', 'tmux', 'screen', 'fastfetch', 'neofetch',
]);

/**
 * Multi-word conversational openers indicating a natural language request to an AI.
 */
const MULTI_WORD_NL_OPENERS = [
  'can you', 'could you', 'would you', 'should i', 'should we',
  'how do i', 'how to', 'how can i', 'how can we', 'how does', 'how do', 'how would',
  'what is', 'what are', 'what does', 'what do', 'what did', 'what would',
  'where is', 'where are', 'where can', 'where does', 'where do',
  'why is', 'why does', 'why did', 'why are', 'why would',
  'tell me', 'help me', 'show me', 'give me',
  'find all', 'search for', 'look for',
  'explain why', 'explain how', 'explain what', 'explain the', 'explain this',
  'write a', 'create a', 'build a', 'generate a', 'make a',
  'fix the', 'debug the', 'diagnose the', 'refactor the',
  'check if', 'verify if', 'see if',
];

/**
 * Single-word interrogatives & conversational request words.
 */
const NL_INTERROGATIVES = new Set([
  'how', 'why', 'what', 'where', 'when', 'which', 'who', 'whose', 'whom',
  'please', 'explain', 'describe', 'summarize', 'clarify',
]);

/**
 * Action verbs common in agent prompts.
 */
const NL_ACTION_VERBS = new Set([
  'debug', 'fix', 'refactor', 'diagnose', 'investigate', 'troubleshoot',
]);

/**
 * English stop-words for frequency detection.
 */
const ENGLISH_STOP_WORDS = new Set([
  'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'from',
  'about', 'into', 'through', 'of', 'by', 'my', 'your', 'our',
  'their', 'this', 'that', 'these', 'those', 'does', 'do', 'did',
  'has', 'have', 'had', 'can', 'could', 'should', 'would', 'will',
  'and', 'or', 'but', 'so', 'if', 'as', 'than', 'then',
]);

/**
 * Synchronously classifies a user input string as either a shell command
 * or a natural language instruction with confidence and reasoning.
 *
 * @param input Raw text typed into the input bar
 * @param detectedToolNames Optional list of installed CLI/agent tools detected on the host
 * @returns ClassificationResult with type, confidence, reason, and suggestedMode
 */
export function classifyCommand(input: string, detectedToolNames?: string[]): ClassificationResult {
  const trimmed = input.trim();

  // 1. Empty or whitespace-only input
  if (!trimmed) {
    return {
      type: 'shell',
      confidence: 1.0,
      reason: 'Empty input defaults to shell',
      suggestedMode: 'cmd',
    };
  }

  // 2. Explicit prefix overrides
  if (trimmed.startsWith('#')) {
    return {
      type: 'natural_language',
      confidence: 1.0,
      reason: 'Explicit AI prefix (#)',
      suggestedMode: 'ai',
    };
  }

  if (trimmed === '$' || trimmed.startsWith('$ ')) {
    return {
      type: 'shell',
      confidence: 1.0,
      reason: 'Explicit Shell prefix ($)',
      suggestedMode: 'cmd',
    };
  }

  // Direct agent targeting (e.g. "@claude fix this", "@opencode explain")
  if (/^@[a-zA-Z0-9_-]+(?:\s|$)/.test(trimmed)) {
    return {
      type: 'natural_language',
      confidence: 0.95,
      reason: 'Direct agent mention (@agent)',
      suggestedMode: 'ai',
    };
  }

  const lower = trimmed.toLowerCase();
  const tokens = trimmed.split(/\s+/);
  const firstToken = tokens[0];
  const firstTokenLower = firstToken.toLowerCase();

  // 3. Multi-word conversational openers (e.g. "how do i", "can you", "find all")
  for (const opener of MULTI_WORD_NL_OPENERS) {
    if (lower === opener || lower.startsWith(opener + ' ')) {
      return {
        type: 'natural_language',
        confidence: 0.95,
        reason: `Natural language conversational opener '${opener}'`,
        suggestedMode: 'ai',
      };
    }
  }

  // 4. Single-word natural language interrogatives (e.g. "how", "why", "what", "please")
  if (NL_INTERROGATIVES.has(firstTokenLower)) {
    return {
      type: 'natural_language',
      confidence: 0.95,
      reason: `Natural language interrogative '${firstTokenLower}'`,
      suggestedMode: 'ai',
    };
  }

  // 5. Conversational action verbs with arguments (e.g. "debug the crash", "fix error")
  if (NL_ACTION_VERBS.has(firstTokenLower) && tokens.length >= 2) {
    return {
      type: 'natural_language',
      confidence: 0.92,
      reason: `Natural language instruction '${firstTokenLower}'`,
      suggestedMode: 'ai',
    };
  }

  // 6. Path-based executables (e.g. "./build.sh", "../script", "/bin/sh", "~/run")
  if (
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('~/') ||
    /^\/(?:bin|usr|etc|var|tmp|home|opt|dev|proc|sys)\//.test(trimmed) ||
    (firstToken.includes('/') && (firstToken.startsWith('.') || firstToken.startsWith('/') || firstToken.startsWith('~')))
  ) {
    return {
      type: 'shell',
      confidence: 0.95,
      reason: 'Path-based executable invocation',
      suggestedMode: 'cmd',
    };
  }

  // 7. Environment variable assignment at start (e.g. "PORT=8080 npm start", "FOO=bar")
  if (/^[A-Za-z_][A-Za-z0-9_]*=\S+/.test(trimmed)) {
    return {
      type: 'shell',
      confidence: 0.95,
      reason: 'Environment variable assignment',
      suggestedMode: 'cmd',
    };
  }

  // 8. Shell variable / subshell expansion at start (e.g. "$VAR", "$FOO", "$(cmd)")
  if (/^\$(?:[A-Za-z_]|\{[A-Za-z_]|\()/.test(trimmed)) {
    return {
      type: 'shell',
      confidence: 0.95,
      reason: 'Shell variable expansion or command substitution',
      suggestedMode: 'cmd',
    };
  }

  // Strip quoted strings for syntax operator analysis (so commit messages or grep patterns don't trigger false positives)
  const unquoted = trimmed.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");

  // Normalized detected tool names
  const detectedToolSet = detectedToolNames
    ? new Set(detectedToolNames.map((t) => t.toLowerCase()))
    : undefined;

  // 9. Recognized CLI binary names
  const isRecognizedBinary =
    COMMON_SHELL_BINARIES.has(firstTokenLower) ||
    Boolean(detectedToolSet?.has(firstTokenLower));

  if (isRecognizedBinary) {
    // Check if followed by conversational phrasing (e.g. "find all files" or "check if server is up")
    const secondTokenLower = tokens[1]?.toLowerCase();
    if (
      tokens.length >= 3 &&
      secondTokenLower &&
      ['all', 'the', 'my', 'any', 'me', 'out', 'if', 'why', 'how'].includes(secondTokenLower)
    ) {
      return {
        type: 'natural_language',
        confidence: 0.88,
        reason: `Conversational sentence following '${firstTokenLower}'`,
        suggestedMode: 'ai',
      };
    }

    return {
      type: 'shell',
      confidence: 0.95,
      reason: `Recognized CLI binary '${firstTokenLower}'`,
      suggestedMode: 'cmd',
    };
  }

  // 10. Shell syntax operators and CLI flags
  // Operators: pipes (|), redirections (>, >>, <, 2>&1), chaining (&&, ||, ;), background (&)
  const hasShellOperator =
    /\s\|\s/.test(unquoted) ||
    /\s(?:>>?|<{1,2}|2>&1)(?:\s|$)/.test(unquoted) ||
    /\s(?:&&|\|\|)\s/.test(unquoted) ||
    /;\s*$/.test(unquoted) ||
    /;\s+[a-zA-Z]/.test(unquoted) ||
    /\s&\s*$/.test(unquoted);

  // CLI flags: -f, -la, --flag, --no-emit
  const hasCliFlags = /(?:^|\s)(?:--[a-zA-Z0-9-]+|-[a-zA-Z0-9]{1,4})(?:=|\s|$)/.test(unquoted);

  if (hasShellOperator || hasCliFlags) {
    return {
      type: 'shell',
      confidence: 0.92,
      reason: hasShellOperator
        ? 'Shell operators detected (pipe, redirect, or chaining)'
        : 'CLI flags detected',
      suggestedMode: 'cmd',
    };
  }

  // 11. Conversational punctuation at the end of input
  if (trimmed.endsWith('?')) {
    return {
      type: 'natural_language',
      confidence: 0.95,
      reason: 'Conversational punctuation (?)',
      suggestedMode: 'ai',
    };
  }

  if (tokens.length >= 2 && trimmed.endsWith('!') && !trimmed.endsWith('!!')) {
    return {
      type: 'natural_language',
      confidence: 0.85,
      reason: 'Conversational punctuation (!)',
      suggestedMode: 'ai',
    };
  }

  // 12. English stop-words frequency analysis
  const stopWordCount = tokens.filter((t) => ENGLISH_STOP_WORDS.has(t.toLowerCase())).length;
  if (tokens.length >= 3 && stopWordCount >= 2) {
    return {
      type: 'natural_language',
      confidence: Math.min(0.95, 0.75 + stopWordCount * 0.05),
      reason: 'Natural language sentence phrasing and stop-words',
      suggestedMode: 'ai',
    };
  }

  if (tokens.length >= 4 && stopWordCount >= 1) {
    return {
      type: 'natural_language',
      confidence: 0.85,
      reason: 'Natural language sentence phrasing',
      suggestedMode: 'ai',
    };
  }

  // 13. Default fallback
  return {
    type: 'shell',
    confidence: 0.65,
    reason: 'Defaulting to shell',
    suggestedMode: 'cmd',
  };
}
