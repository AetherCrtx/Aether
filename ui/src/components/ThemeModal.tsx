import React, { useState, useEffect } from 'react';
import {
  useAetherStore,
  toggleThemeModal,
  setAetherTheme,
  setTerminalOpacity,
} from '../stores/aetherStore';
import { AETHER_THEMES, AetherTheme } from '../utils/themes';
import { Palette, X, Check, Sliders, Sparkles, Monitor, SunMedium, Moon, Cpu } from 'lucide-react';

export const ThemeModal: React.FC = () => {
  const store = useAetherStore();
  const [selectedThemeId, setSelectedThemeId] = useState(store.currentTheme || 'aethercortex-dark');
  const [opacity, setOpacity] = useState(store.windowOpacity || 0.95);
  const [terminalRenderer, setTerminalRenderer] = useState(
    () => (typeof window !== 'undefined' ? localStorage.getItem('aether_terminal_renderer') || 'auto' : 'auto')
  );

  const handleRendererChange = (val: string) => {
    setTerminalRenderer(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aether_terminal_renderer', val);
    }
  };

  if (!store.themeModalOpen) return null;

  const currentTheme = AETHER_THEMES.find((t) => t.id === selectedThemeId) || AETHER_THEMES[0];

  const handleSelectTheme = (theme: AetherTheme) => {
    setSelectedThemeId(theme.id);
    setAetherTheme(theme.id);
  };

  const handleOpacityChange = (val: number) => {
    setOpacity(val);
    setTerminalOpacity(val);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm animate-fadeIn select-none"
      onClick={() => toggleThemeModal(false)}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Theming & Appearance Engine</span>
                <kbd className="text-[10px] bg-slate-800 text-cyan-300 px-1.5 py-0.5 rounded border border-slate-700">
                  Cmd+,
                </kbd>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Customize Warp terminal aesthetics, colors, and Wayland compositor opacity
              </div>
            </div>
          </div>

          <button
            onClick={() => toggleThemeModal(false)}
            className="p-1.5 text-slate-400 hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Theme Presets */}
          <div>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Theme Presets</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {AETHER_THEMES.map((theme) => {
                const isSelected = selectedThemeId === theme.id;
                return (
                  <div
                    key={theme.id}
                    onClick={() => handleSelectTheme(theme)}
                    className={`p-3.5 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-cyan-400 bg-slate-800/90 shadow-lg shadow-cyan-950/50'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-xs text-white">{theme.name}</span>
                      {isSelected ? (
                        <span className="p-0.5 rounded-full bg-cyan-400 text-slate-950">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </span>
                      ) : (
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: theme.accent }}
                        />
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 mb-3">{theme.description}</p>

                    {/* Color Swatches */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-4 h-4 rounded-full border border-slate-700"
                        style={{ backgroundColor: theme.bgDark }}
                        title="Background"
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-slate-700"
                        style={{ backgroundColor: theme.panel }}
                        title="Panel"
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-slate-700"
                        style={{ backgroundColor: theme.accent }}
                        title="Accent"
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-slate-700"
                        style={{ backgroundColor: theme.fg }}
                        title="Foreground"
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-slate-700"
                        style={{ backgroundColor: theme.cursor }}
                        title="Cursor"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Opacity & Compositing */}
          <div className="border-t border-slate-800 pt-5">
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span>Window Background Opacity</span>
              </span>
              <span className="text-cyan-400 font-mono text-xs">
                {Math.round(opacity * 100)}%
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              Adjust window transparency for Hyprland / Sway blur compositing.
            </p>
            <input
              type="range"
              min="0.4"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
              className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Terminal Rendering Engine */}
          <div className="border-t border-slate-800 pt-5">
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span>Terminal Rendering Engine</span>
              </span>
              <span className="text-cyan-400 font-mono text-[11px] uppercase">
                {terminalRenderer}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              Choose the terminal rendering backend. On Linux with Wayland or hybrid graphics, Native DOM provides 0ms input latency and zero CPU rasterization overhead.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'auto', label: 'Auto Detect', desc: 'Hardware WebGL or Native DOM fallback' },
                { id: 'dom', label: 'Native DOM', desc: 'Zero lag, Cairo composited (Recommended on Linux)' },
                { id: 'webgl', label: 'WebGL2', desc: 'GPU texture atlas (Requires hardware DRI)' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleRendererChange(opt.id)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    terminalRenderer === opt.id
                      ? 'border-cyan-400 bg-cyan-950/30 text-white shadow-sm shadow-cyan-950/50'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="text-xs font-semibold flex items-center justify-between">
                    <span>{opt.label}</span>
                    {terminalRenderer === opt.id && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Live Mini Preview */}
          <div className="border-t border-slate-800 pt-5">
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-cyan-400" />
              <span>Live Terminal Palette Preview</span>
            </div>

            <div
              className="p-3.5 rounded-lg border font-mono text-xs space-y-1 shadow-inner"
              style={{
                backgroundColor: currentTheme.bgDark,
                borderColor: currentTheme.border,
                color: currentTheme.fg,
              }}
            >
              <div className="flex items-center gap-2 text-[11px] opacity-80">
                <span style={{ color: currentTheme.accent }}>~ projects/Elliot</span>
                <span className="opacity-40">on</span>
                <span style={{ color: currentTheme.xterm.green }}>git:(main)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span style={{ color: currentTheme.accent }}>&gt;</span>
                <span>cargo test --workspace</span>
              </div>
              <div style={{ color: currentTheme.xterm.green }} className="text-[11px]">
                test result: ok. 32 passed; 0 failed; 0 ignored
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 px-6 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Settings automatically persist in your local profile.
          </span>
          <button
            onClick={() => toggleThemeModal(false)}
            className="px-4 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
