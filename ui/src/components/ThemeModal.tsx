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

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'light' | 'dark'>('all');

  const filteredThemes = AETHER_THEMES.filter((t) => {
    const isLight =
      t.id.includes('light') || t.id.includes('latte') || t.id.includes('day');
    if (categoryFilter === 'light') return isLight;
    if (categoryFilter === 'dark') return !isLight;
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm animate-fadeIn select-none"
      onClick={() => toggleThemeModal(false)}
    >
      <div
        className="w-full max-w-2xl bg-cortex-bgAlt border border-cortex-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-6 flex items-center justify-between border-b border-cortex-border bg-cortex-bg/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cortex-accentMuted border border-cortex-accent/30 text-cortex-accent">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-cortex-text flex items-center gap-2">
                <span>Theming & Appearance Engine</span>
                <kbd className="text-[10px] bg-cortex-surface2 text-cortex-accent px-1.5 py-0.5 rounded border border-cortex-border">
                  Cmd+,
                </kbd>
              </div>
              <div className="text-xs text-cortex-textMuted mt-0.5">
                Customize Aether terminal aesthetics, light & dark themes, and opacity
              </div>
            </div>
          </div>

          <button
            onClick={() => toggleThemeModal(false)}
            className="p-1.5 text-cortex-textMuted hover:text-cortex-text rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Theme Presets with Category Filter */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold text-cortex-text uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cortex-accent" />
                <span>Theme Presets</span>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 bg-cortex-surface1 p-0.5 border border-cortex-border rounded text-[11px]">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-2.5 py-0.5 rounded transition-colors ${
                    categoryFilter === 'all'
                      ? 'bg-cortex-surface2 text-cortex-accent font-bold'
                      : 'text-cortex-textMuted hover:text-cortex-text'
                  }`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setCategoryFilter('light')}
                  className={`px-2.5 py-0.5 rounded transition-colors flex items-center gap-1 ${
                    categoryFilter === 'light'
                      ? 'bg-cortex-surface2 text-cortex-accent font-bold'
                      : 'text-cortex-textMuted hover:text-cortex-text'
                  }`}
                >
                  <SunMedium className="w-3 h-3" />
                  <span>Tema Terang</span>
                </button>
                <button
                  onClick={() => setCategoryFilter('dark')}
                  className={`px-2.5 py-0.5 rounded transition-colors flex items-center gap-1 ${
                    categoryFilter === 'dark'
                      ? 'bg-cortex-surface2 text-cortex-accent font-bold'
                      : 'text-cortex-textMuted hover:text-cortex-text'
                  }`}
                >
                  <Moon className="w-3 h-3" />
                  <span>Tema Gelap</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredThemes.map((theme) => {
                const isSelected = selectedThemeId === theme.id;
                return (
                  <div
                    key={theme.id}
                    onClick={() => handleSelectTheme(theme)}
                    className={`p-3.5 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-cortex-accent bg-cortex-surface2 shadow-lg shadow-cortex-accent/20'
                        : 'border-cortex-border bg-cortex-surface1 hover:border-cortex-borderStrong hover:bg-cortex-surface2'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-xs text-cortex-text">{theme.name}</span>
                      {isSelected ? (
                        <span className="p-0.5 rounded-full bg-cortex-accent text-black">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </span>
                      ) : (
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: theme.accent }}
                        />
                      )}
                    </div>

                    <p className="text-[11px] text-cortex-textMuted mb-3">{theme.description}</p>

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
          <div className="border-t border-cortex-border pt-5">
            <div className="text-xs font-semibold text-cortex-text uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cortex-accent" />
                <span>Window Background Opacity</span>
              </span>
              <span className="text-cortex-accent font-mono text-xs">
                {Math.round(opacity * 100)}%
              </span>
            </div>
            <p className="text-[11px] text-cortex-textMuted mb-3">
              Adjust window transparency for Hyprland / Sway blur compositing.
            </p>
            <input
              type="range"
              min="0.4"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
              className="w-full accent-[#00F0FF] h-1.5 bg-cortex-surface2 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Terminal Rendering Engine */}
          <div className="border-t border-cortex-border pt-5">
            <div className="text-xs font-semibold text-cortex-text uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cortex-accent" />
                <span>Terminal Rendering Engine</span>
              </span>
              <span className="text-cortex-accent font-mono text-[11px] uppercase">
                {terminalRenderer}
              </span>
            </div>
            <p className="text-[11px] text-cortex-textMuted mb-3">
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
                      ? 'border-cortex-accent bg-cortex-surface2 text-cortex-text shadow-sm shadow-cortex-accent/20'
                      : 'border-cortex-border bg-cortex-surface1 text-cortex-textMuted hover:border-cortex-borderStrong hover:text-cortex-text'
                  }`}
                >
                  <div className="text-xs font-semibold flex items-center justify-between">
                    <span>{opt.label}</span>
                    {terminalRenderer === opt.id && <Check className="w-3.5 h-3.5 text-cortex-accent" />}
                  </div>
                  <div className="text-[10px] text-cortex-textMuted/80 mt-1">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Live Mini Preview */}
          <div className="border-t border-cortex-border pt-5">
            <div className="text-xs font-semibold text-cortex-text uppercase tracking-wider mb-3 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-cortex-accent" />
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
        <div className="h-14 px-6 border-t border-cortex-border bg-cortex-bg/80 flex items-center justify-between">
          <span className="text-[11px] text-cortex-textMuted">
            Settings automatically persist in your local profile.
          </span>
          <button
            onClick={() => toggleThemeModal(false)}
            className="px-4 py-1.5 rounded-md bg-cortex-accent hover:bg-cortex-accentHover text-black text-xs font-bold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
