import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { ImageAddon } from '@xterm/addon-image';
import { resizePanePty, sendPtyInput, getPaneScrollback } from '../stores/aetherStore';

interface Props {
  paneId: string;
  isActive: boolean;
  onFocus: () => void;
  registerTermWriter: (paneId: string, writer: (data: Uint8Array | string) => void) => () => void;
}

/**
 * Detect whether WebGL2 hardware acceleration is safe to use.
 * Under Linux (WebKitGTK with WEBKIT_DISABLE_DMABUF_RENDERER=1 or Mesa software llvmpipe),
 * WebGL falls back to CPU software rasterization, causing heavy input lag.
 * The native DOM renderer uses Cairo/Wayland directly with 0ms keystroke latency.
 */
export function checkWebGLHardwareSupport(): boolean {
  if (typeof window === 'undefined') return false;
  const pref = localStorage.getItem('aether_terminal_renderer');
  if (pref === 'dom') return false;
  if (pref === 'webgl') return true;

  // On Linux (especially WebKitGTK with hybrid GPUs and DMABUF disabled),
  // DOM renderer provides 0ms input latency and zero CPU rasterization overhead.
  const isLinux = typeof navigator !== 'undefined' && /linux|x11/i.test(navigator.userAgent || navigator.platform);
  if (isLinux) {
    try {
      const canvas = document.createElement('canvas');
      const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
      if (!gl) return false;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const unmasked = dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase() : '';
      const standard = (gl.getParameter(gl.RENDERER) || '').toLowerCase();
      if (/llvmpipe|softpipe|swrast|swiftshader|software/i.test(unmasked) || /llvmpipe|softpipe|swrast|swiftshader|software/i.test(standard)) {
        console.warn(`[AetherTerminal] Software WebGL detected (${unmasked || standard}). Using high-performance native DOM renderer.`);
        return false;
      }
      // On Linux WebKitGTK, default to native DOM renderer for optimal responsiveness unless WebGL is explicitly chosen
      return false;
    } catch {
      return false;
    }
  }

  // Non-Linux or systems with verified GPU WebGL support
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const unmasked = dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase() : '';
    const standard = (gl.getParameter(gl.RENDERER) || '').toLowerCase();
    if (/llvmpipe|softpipe|swrast|swiftshader|software/i.test(unmasked) || /llvmpipe|softpipe|swrast|swiftshader|software/i.test(standard)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export const XtermWebGLPane: React.FC<Props> = ({
  paneId,
  isActive,
  onFocus,
  registerTermWriter,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Initialize Xterm with Tokyo Night Dark Theme
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: '"JetBrainsMono Nerd Font", "FiraCode Nerd Font", monospace',
      lineHeight: 1.25,
      allowTransparency: true,
      // Cap scrollback: unbounded buffers are the main memory/lag source on long sessions.
      scrollback: 5000,
      windowOptions: {
        getWinSizePixels: true,
        getCellSizePixels: true,
        getWinSizeChars: true,
      },
      theme: {
        background: '#16161e00', // Transparent for Wayland compositor
        foreground: '#c0caf5',
        cursor: '#c0caf5',
        selectionBackground: '#283457',
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
        brightBlack: '#414868',
        brightRed: '#f7768e',
        brightGreen: '#9ece6a',
        brightYellow: '#e0af68',
        brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff',
        brightWhite: '#c0caf5',
      },
    });

    // 2. Load Fit Addon & Image Addon (SIXEL & iTerm Image Protocol)
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    try {
      const imageAddon = new ImageAddon({
        sixelSupport: true,
        iipSupport: true,
        enableSizeReports: true,
      });
      term.loadAddon(imageAddon);
    } catch (e) {
      console.warn('Failed to initialize ImageAddon:', e);
    }

    // 3. Register CSI, OSC, and DCS capability handlers
    // Ensures interactive TUIs (agy, opencode, bubbletea, opentui, fzf, fish) receive
    // immediate terminal capability acknowledgements rather than blocking on stdin timeouts.
    try {
      // 3.1 Primary Device Attributes (DA1)
      term.parser.registerCsiHandler({ final: 'c' }, (params) => {
        const p = (params[0] as number) || 0;
        if (p === 0) {
          sendPtyInput(paneId, '\x1b[?1;2c');
          return true;
        }
        return false;
      });

      // 3.2 Secondary Device Attributes (DA2)
      term.parser.registerCsiHandler({ prefix: '>', final: 'c' }, () => {
        sendPtyInput(paneId, '\x1b[>0;276;0c');
        return true;
      });

      // 3.3 Kitty Progressive Keyboard Protocol Query (CSI ? u)
      term.parser.registerCsiHandler({ prefix: '?', final: 'u' }, () => {
        // Respond immediately that standard xterm keyboard mode is active (0 = no progressive flags)
        sendPtyInput(paneId, '\x1b[?0u');
        return true;
      });

      // 3.4 DECRQM (Request Mode: CSI ? Pn $ p) - Critical for agy & opencode
      term.parser.registerCsiHandler({ prefix: '?', intermediates: '$', final: 'p' }, (params) => {
        const mode = (params[0] as number) || 0;
        if (mode === 2026) {
          // Mode 2026 = Synchronized Output (supported and reset)
          sendPtyInput(paneId, '\x1b[?2026;2$y');
        } else if (mode === 2004) {
          // Mode 2004 = Bracketed Paste (supported and set)
          sendPtyInput(paneId, '\x1b[?2004;1$y');
        } else if (mode === 1004) {
          // Mode 1004 = Focus Reporting (supported and reset)
          sendPtyInput(paneId, '\x1b[?1004;2$y');
        } else if (mode === 1016) {
          // Mode 1016 = SGR Mouse (supported and reset)
          sendPtyInput(paneId, '\x1b[?1016;2$y');
        } else {
          // Mode not supported / unknown
          sendPtyInput(paneId, `\x1b[?${mode};0$y`);
        }
        return true;
      });

      // 3.5 Terminal Version Query (XTVERSION: CSI > 0 q or CSI > q)
      term.parser.registerCsiHandler({ prefix: '>', final: 'q' }, () => {
        sendPtyInput(paneId, '\x1bP>|AetherTerminal(xterm.js)\x1b\\');
        return true;
      });

      // 3.6 Window & Pixel Size Queries (CSI 14 t / CSI 18 t)
      term.parser.registerCsiHandler({ final: 't' }, (params) => {
        const p = (params[0] as number) || 0;
        if (p === 14) {
          // Query text area size in pixels
          const cols = term.cols || 80;
          const rows = term.rows || 24;
          const width = cols * 9;
          const height = rows * 18;
          sendPtyInput(paneId, `\x1b[4;${height};${width}t`);
          return true;
        } else if (p === 18) {
          // Query text area size in characters
          sendPtyInput(paneId, `\x1b[8;${term.rows || 24};${term.cols || 80}t`);
          return true;
        }
        return false;
      });

      // 3.7 OSC 10 (Foreground Color Query: \x1b]10;?\x07 or \x1b]10;?\x1b\\)
      term.parser.registerOscHandler(10, (data) => {
        if (data === '?') {
          sendPtyInput(paneId, '\x1b]10;rgb:c0c0/caca/f5f5\x1b\\');
          return true;
        }
        return false;
      });

      // 3.8 OSC 11 (Background Color Query: \x1b]11;?\x07 or \x1b]11;?\x1b\\)
      term.parser.registerOscHandler(11, (data) => {
        if (data === '?') {
          sendPtyInput(paneId, '\x1b]11;rgb:1616/1616/1e1e\x1b\\');
          return true;
        }
        return false;
      });

      // 3.9 OSC 4 (Color Palette Query: \x1b]4;index;?\x07)
      term.parser.registerOscHandler(4, (data) => {
        if (data.includes('?')) {
          sendPtyInput(paneId, '\x1b]4;0;rgb:1515/1616/1e1e\x1b\\');
          return true;
        }
        return false;
      });

      // 3.10 DCS Handler for XTGETTCAP (\x1bP+q...ST)
      // Note: '+' is an intermediate byte (\x20..\x2f), not a prefix (\x3c..\x3f)
      term.parser.registerDcsHandler({ intermediates: '+', final: 'q' }, () => {
        // Respond invalid XTGETTCAP response immediately to unblock prompt
        sendPtyInput(paneId, '\x1bP0+r\x1b\\');
        return true;
      });
    } catch (e) {
      console.warn('[AetherTerminal] Capability handler registration warning:', e);
    }

    term.open(containerRef.current);
    termRef.current = term;

    // 4. Initialize Renderer: Use WebGL2 only if hardware acceleration is active and not software emulation
    let webglAddon: WebglAddon | null = null;
    if (checkWebGLHardwareSupport()) {
      try {
        webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          console.warn(`[Pane ${paneId}] WebGL context lost, falling back to DOM renderer`);
          webglAddon?.dispose();
          webglAddon = null;
        });
        term.loadAddon(webglAddon);
        console.info(`[Pane ${paneId}] WebGL2 accelerated renderer active`);
      } catch (e) {
        console.warn(`[Pane ${paneId}] WebGL renderer initialization error, using DOM renderer:`, e);
      }
    } else {
      console.info(`[Pane ${paneId}] Using native DOM renderer for 0ms input latency`);
    }

    const fitTerminal = () => {
      try {
        fitAddon.fit();
        if (term.cols > 0 && term.rows > 0) {
          resizePanePty(paneId, term.cols, term.rows);
        }
      } catch (err) {}
    };

    // Immediate fit and scheduled fit
    fitTerminal();
    requestAnimationFrame(fitTerminal);
    setTimeout(() => {
      fitTerminal();
      if (isActive) {
        term.focus();
      }
    }, 50);

    // Attach key event filter so app shortcuts (Ctrl+P, Cmd+D, Ctrl+, Ctrl+Space, Alt+I, Alt+M, Alt+E, Ctrl+T, etc.) bubble while terminal takes all other keystrokes
    term.attachCustomKeyEventHandler((e) => {
      if ((e.ctrlKey || e.metaKey) && (
        e.code === 'Space' ||
        e.key === 'p' || e.key === 'P' ||
        e.key === 'd' || e.key === 'D' ||
        e.key === ',' ||
        e.key === 'b' || e.key === 'B' ||
        e.key === 't' || e.key === 'T' ||
        e.key === 'Tab' ||
        e.key === 'PageDown' || e.key === 'PageUp'
      )) return false;
      if (e.altKey && ['m', 'M', 'z', 'Z', 's', 'S', 'v', 'V', 'w', 'W', 'e', 'E', 'i', 'I', 'r', 'R', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) return false;
      return true;
    });

    // Handle user keystrokes -> PTY
    const dataDisposable = term.onData((data) => {
      sendPtyInput(paneId, data);
    });

    // Backpressure mitigation & chunk batching for WebGL2 terminal renderer
    const chunkQueue: (Uint8Array | string)[] = [];
    let rafId: number | null = null;
    const MAX_BYTES_PER_FRAME = 128 * 1024; // 128 KB per frame limit to avoid main thread freeze

    const flushQueue = () => {
      rafId = null;
      if (!term || chunkQueue.length === 0) return;

      let byteCount = 0;
      let takeCount = 0;

      for (let i = 0; i < chunkQueue.length; i++) {
        const chunk = chunkQueue[i];
        const len = typeof chunk === 'string' ? chunk.length : chunk.length;
        if (byteCount + len > MAX_BYTES_PER_FRAME && takeCount > 0) {
          break;
        }
        byteCount += len;
        takeCount++;
      }

      const chunksToProcess = chunkQueue.splice(0, takeCount);

      if (chunksToProcess.length === 1 && byteCount > MAX_BYTES_PER_FRAME) {
        // Slice massive chunk using zero-copy subarray
        const largeChunk = chunksToProcess[0];
        if (largeChunk instanceof Uint8Array) {
          const slice = largeChunk.subarray(0, MAX_BYTES_PER_FRAME);
          const rest = largeChunk.subarray(MAX_BYTES_PER_FRAME);
          chunkQueue.unshift(rest);
          term.write(slice);
        } else {
          const slice = largeChunk.slice(0, MAX_BYTES_PER_FRAME);
          const rest = largeChunk.slice(MAX_BYTES_PER_FRAME);
          chunkQueue.unshift(rest);
          term.write(slice);
        }
      } else {
        const allUint8 = chunksToProcess.every((c) => c instanceof Uint8Array);
        if (allUint8 && chunksToProcess.length > 1) {
          // Aggregate multiple small chunks into single Uint8Array to minimize xterm parse overhead
          const totalLen = chunksToProcess.reduce((acc, c) => acc + (c as Uint8Array).length, 0);
          const merged = new Uint8Array(totalLen);
          let offset = 0;
          for (const c of chunksToProcess) {
            merged.set(c as Uint8Array, offset);
            offset += (c as Uint8Array).length;
          }
          term.write(merged);
        } else {
          for (const chunk of chunksToProcess) {
            term.write(chunk);
          }
        }
      }

      // If queue still has pending chunks, schedule next frame immediately
      if (chunkQueue.length > 0) {
        rafId = requestAnimationFrame(flushQueue);
      }
    };

    const scheduleFlush = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(flushQueue);
      }
    };

    // Helper to write immediately for interactive typing if queue is empty, or queue for bulk output
    const writeOrQueue = (chunk: Uint8Array | string) => {
      const len = typeof chunk === 'string' ? chunk.length : chunk.byteLength;
      // Fast path: if no chunks are waiting and this is a small interactive packet (<= 1024 bytes, like a keystroke echo),
      // write directly to xterm synchronously! This eliminates RAF latency (16-33ms) completely for typing.
      if (chunkQueue.length === 0 && len <= 1024) {
        term.write(chunk);
        return;
      }
      chunkQueue.push(chunk);
      scheduleFlush();
    };

    let disposed = false;
    let lastWrittenOffset = 0;
    let scrollbackRestored = false;
    const preRestoreQueue: { data: Uint8Array | string; offset: number }[] = [];

    // Register writer so incoming aetherd PTY events write to this terminal via instant fast-path or RAF queue
    const unregister = registerTermWriter(paneId, (data: Uint8Array | string, offset: number = 0) => {
      if (typeof data === 'string') {
        writeOrQueue(data);
        return;
      }
      if (!scrollbackRestored) {
        preRestoreQueue.push({ data, offset });
        return;
      }
      // Deduplicate: if live bytes are already covered by scrollback or previous write, discard them
      if (offset + data.length <= lastWrittenOffset) {
        return;
      }
      if (offset < lastWrittenOffset) {
        const slice = data.subarray(lastWrittenOffset - offset);
        lastWrittenOffset += slice.length;
        writeOrQueue(slice);
        return;
      }
      lastWrittenOffset = offset + data.length;
      writeOrQueue(data);
    });

    // 5. Restore scrollback history (512 KB ring buffer in aetherd) before live output
    getPaneScrollback(paneId).then((res) => {
      if (disposed) return;
      if (res && res.data && res.data.length > 0) {
        term.write(res.data);
        lastWrittenOffset = res.endOffset;
      }
    }).catch(() => {}).finally(() => {
      if (disposed) return;
      scrollbackRestored = true;
      for (const item of preRestoreQueue) {
        if (typeof item.data === 'string') {
          chunkQueue.push(item.data);
          continue;
        }
        if (item.offset + item.data.length <= lastWrittenOffset) {
          // Chunk is already included in the scrollback buffer snapshot! Discard to prevent double render.
          continue;
        }
        if (item.offset < lastWrittenOffset) {
          const slice = item.data.subarray(lastWrittenOffset - item.offset);
          lastWrittenOffset += slice.length;
          chunkQueue.push(slice);
        } else {
          lastWrittenOffset = item.offset + item.data.length;
          chunkQueue.push(item.data);
        }
      }
      preRestoreQueue.length = 0;
      if (chunkQueue.length > 0) {
        scheduleFlush();
      }
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      fitTerminal();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      disposed = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      chunkQueue.length = 0;
      unregister();
      dataDisposable.dispose();
      resizeObserver.disconnect();
      try {
        webglAddon?.dispose();
      } catch (e) {}
      term.dispose();
    };
  }, [paneId]);

  const focusTerminal = () => {
    if (termRef.current) {
      if (termRef.current.textarea) {
        termRef.current.textarea.focus();
      }
      termRef.current.focus();
    }
  };

  // Focus terminal when pane becomes active
  useEffect(() => {
    if (isActive) {
      focusTerminal();
      const t = setTimeout(focusTerminal, 50);
      return () => clearTimeout(t);
    }
  }, [isActive]);

  // Global keydown / window focus delegation to ensure terminal is always typed into
  useEffect(() => {
    if (!isActive) return;

    const handleWindowFocus = () => {
      focusTerminal();
    };
    window.addEventListener('focus', handleWindowFocus);

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          (activeEl.tagName === 'TEXTAREA' && !activeEl.classList.contains('xterm-helper-textarea')) ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }
      // If user is typing in our pane, ensure terminal textarea is focused
      focusTerminal();
    };
    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isActive]);

  const handleContainerFocus = () => {
    onFocus();
    focusTerminal();
  };

  return (
    <div
      ref={containerRef}
      onClick={handleContainerFocus}
      onMouseDown={handleContainerFocus}
      className={`w-full h-full relative overflow-hidden focus:outline-none transition-all cursor-text ${
        isActive ? 'ring-1 ring-tokyo-blue/50' : ''
      }`}
    />
  );
};
