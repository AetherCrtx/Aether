import React, { useState, useEffect } from 'react';
import {
  useAetherStore,
  toggleAiSettings,
  loadAiProviderConfig,
  saveAiProviderConfig,
  testProviderConnection,
  setSelectedAiProvider,
  setSelectedAiModel,
  addCustomProvider,
  updateCustomProvider,
  deleteCustomProvider,
  BUILT_IN_PROVIDERS,
  type CustomProviderConfig,
  type ProviderConfig,
  type ProviderMeta,
} from '../stores/aetherStore';
import {
  Bot,
  Key,
  Cpu,
  Globe,
  Shield,
  Check,
  AlertCircle,
  RefreshCw,
  X,
  Eye,
  EyeOff,
  Radio,
  ExternalLink,
  Plus,
  Trash2,
  Server,
  Layers,
} from 'lucide-react';

export const AiSettingsModal: React.FC = () => {
  const store = useAetherStore();

  const [selectedId, setSelectedId] = useState<string>('openai');
  const [isCreatingCustom, setIsCreatingCustom] = useState<boolean>(false);

  // Form inputs
  const [displayName, setDisplayName] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [protocol, setProtocol] = useState<
    'openai' | 'anthropic' | 'gemini' | 'groq' | 'ollama' | 'openrouter'
  >('openai');
  const [showKey, setShowKey] = useState<boolean>(false);

  // Status & Feedback
  const [validationError, setValidationError] = useState<string | null>(null);
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [deleteConfirm, setDeleteConfirm] = useState<boolean>(false);

  // Hydrate on modal open
  useEffect(() => {
    if (store.aiSettingsOpen) {
      loadAiProviderConfig().then((cfg) => {
        const initialId = store.selectedAiProvider || cfg?.default_provider || 'openai';
        selectProvider(initialId, cfg || undefined);
      });
    }
  }, [store.aiSettingsOpen]);

  const selectProvider = (id: string, currentCfg?: ProviderConfig) => {
    setIsCreatingCustom(false);
    setSelectedId(id);
    setValidationError(null);
    setTestResult(null);
    setSaveSuccess(false);
    setDeleteConfirm(false);

    // 1. Check if it's a custom provider
    const custom = store.customProviders.find((cp) => cp.id === id);
    if (custom) {
      setDisplayName(custom.displayName);
      setApiKey(custom.apiKey);
      setModel(custom.model);
      setBaseUrl(custom.baseUrl);
      setProtocol(custom.protocol);
      return;
    }

    // 2. Otherwise it's a built-in provider
    const meta = BUILT_IN_PROVIDERS.find((p) => p.id === id) || BUILT_IN_PROVIDERS[0];
    const cfg = currentCfg || store.aiProviderConfig;
    const saved = cfg?.providers[id];

    setDisplayName(meta.name);
    setApiKey(saved?.api_key || '');
    setModel(saved?.model || meta.defaultModel);
    setBaseUrl(saved?.base_url || meta.defaultBaseUrl);
    setProtocol(meta.protocol);
  };

  const handleStartAddCustom = () => {
    setIsCreatingCustom(true);
    setSelectedId('');
    setDisplayName('');
    setApiKey('');
    setModel('');
    setBaseUrl('');
    setProtocol('openai');
    setValidationError(null);
    setTestResult(null);
    setSaveSuccess(false);
    setDeleteConfirm(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setValidationError(null);

    // Validation for custom endpoint
    if (isCreatingCustom || selectedCustom) {
      if (!baseUrl.trim()) {
        setValidationError('Endpoint Base URL is required to test connection.');
        setTesting(false);
        return;
      }
      if (!/^https?:\/\//i.test(baseUrl.trim())) {
        setValidationError('Endpoint Base URL must start with http:// or https://');
        setTesting(false);
        return;
      }
      if (!model.trim()) {
        setValidationError('Model Identifier is required to test connection.');
        setTesting(false);
        return;
      }
    }

    try {
      const providerKey = isCreatingCustom ? 'custom' : selectedId;
      const res = await testProviderConnection(providerKey, {
        api_key: apiKey.trim(),
        model: model.trim(),
        base_url: baseUrl.trim() || undefined,
        display_name: displayName.trim() || undefined,
        protocol,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: String(err?.message || err),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setValidationError(null);

    try {
      if (isCreatingCustom) {
        // Validate required fields
        if (!displayName.trim()) {
          setValidationError('Display Name is required for custom provider.');
          setSaving(false);
          return;
        }
        if (!baseUrl.trim()) {
          setValidationError('Endpoint Base URL is required for custom provider.');
          setSaving(false);
          return;
        }
        if (!/^https?:\/\//i.test(baseUrl.trim())) {
          setValidationError('Endpoint Base URL must start with http:// or https://');
          setSaving(false);
          return;
        }
        if (!model.trim()) {
          setValidationError('Model Identifier is required for custom provider.');
          setSaving(false);
          return;
        }

        // Mandatory Pre-Save Connection Verification
        setTesting(true);
        const testRes = await testProviderConnection('custom', {
          api_key: apiKey.trim(),
          model: model.trim(),
          base_url: baseUrl.trim(),
          display_name: displayName.trim(),
          protocol,
        });
        setTesting(false);
        setTestResult(testRes);

        if (!testRes.success) {
          setValidationError(
            `Koneksi gagal: ${testRes.message}. Pastikan Endpoint Base URL, API Key, dan Model sudah benar sebelum menyimpan.`
          );
          setSaving(false);
          return;
        }

        const newId = await addCustomProvider({
          displayName: displayName.trim(),
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
          protocol,
        });

        // Set as active provider
        setSelectedAiProvider(newId);
        setSelectedAiModel(model.trim());

        setIsCreatingCustom(false);
        setSelectedId(newId);
        setSaveSuccess(true);
      } else if (selectedCustom) {
        // Edit existing custom provider
        if (!displayName.trim()) {
          setValidationError('Display Name is required.');
          setSaving(false);
          return;
        }
        if (!baseUrl.trim()) {
          setValidationError('Endpoint Base URL is required.');
          setSaving(false);
          return;
        }
        if (!/^https?:\/\//i.test(baseUrl.trim())) {
          setValidationError('Endpoint Base URL must start with http:// or https://');
          setSaving(false);
          return;
        }
        if (!model.trim()) {
          setValidationError('Model Identifier is required.');
          setSaving(false);
          return;
        }

        // Mandatory Pre-Save Connection Verification
        setTesting(true);
        const testRes = await testProviderConnection(selectedId, {
          api_key: apiKey.trim(),
          model: model.trim(),
          base_url: baseUrl.trim(),
          display_name: displayName.trim(),
          protocol,
        });
        setTesting(false);
        setTestResult(testRes);

        if (!testRes.success) {
          setValidationError(
            `Koneksi gagal: ${testRes.message}. Pastikan Endpoint Base URL, API Key, dan Model sudah benar sebelum menyimpan.`
          );
          setSaving(false);
          return;
        }

        await updateCustomProvider(selectedId, {
          displayName: displayName.trim(),
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
          protocol,
        });

        setSaveSuccess(true);
      } else {
        // Standard provider
        const meta = BUILT_IN_PROVIDERS.find((p) => p.id === selectedId) || BUILT_IN_PROVIDERS[0];
        await saveAiProviderConfig(
          selectedId,
          apiKey.trim(),
          model.trim() || meta.defaultModel,
          baseUrl.trim() || meta.defaultBaseUrl,
          meta.name,
          meta.protocol
        );
        setSaveSuccess(true);
      }

      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setValidationError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleSetActiveProvider = () => {
    if (selectedId && !isCreatingCustom) {
      setSelectedAiProvider(selectedId);
      if (model.trim()) {
        setSelectedAiModel(model.trim());
      }
    }
  };

  const handleDeleteCustom = async () => {
    if (!selectedCustom) return;
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    await deleteCustomProvider(selectedId);
    setDeleteConfirm(false);
    selectProvider('openai');
  };

  if (!store.aiSettingsOpen) return null;

  const selectedCustom = store.customProviders.find((cp) => cp.id === selectedId);
  const activeMeta = BUILT_IN_PROVIDERS.find((p) => p.id === selectedId) || null;
  const isCurrentActive = store.selectedAiProvider === selectedId && !isCreatingCustom;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 select-none animate-fadeIn font-sans"
      onClick={() => toggleAiSettings(false)}
      data-testid="ai-settings-modal"
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-cortex-bgAlt border border-cortex-borderStrong shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-6 flex items-center justify-between border-b border-cortex-border bg-cortex-surface1">
          <div className="flex items-center gap-3">
            <div className="p-2 border border-cortex-borderStrong bg-cortex-surface2 text-cortex-accent">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-cortex-text flex items-center gap-2">
                <span>AI Provider & Connection Settings</span>
                <span className="text-[10px] bg-cortex-surface2 text-cortex-accent px-2 py-0.5 border border-cortex-borderStrong font-mono">
                  Autonomous Runtime
                </span>
              </div>
              <div className="text-[11px] text-cortex-textMuted">
                Configure frontier models, local endpoints, and custom provider connections
              </div>
            </div>
          </div>
          <button
            onClick={() => toggleAiSettings(false)}
            className="p-1.5 text-cortex-textMuted hover:text-cortex-text hover:bg-cortex-surface2 transition-colors border border-transparent hover:border-cortex-border"
            title="Close Settings"
            aria-label="Close Settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-[460px]">
          {/* Left Navigation: Built-in & Custom Providers List */}
          <div className="w-full md:w-64 border-r border-cortex-border bg-cortex-surface1 p-3 flex flex-col gap-1.5 overflow-y-auto shrink-0">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cortex-textMuted">
              Built-In Providers
            </div>
            {BUILT_IN_PROVIDERS.map((p) => {
              const isSelected = selectedId === p.id && !isCreatingCustom;
              const isActiveDefault = store.selectedAiProvider === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => selectProvider(p.id)}
                  className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 transition-all border ${
                    isSelected
                      ? 'border-cortex-accent bg-cortex-surface2 text-cortex-text'
                      : 'border-transparent text-cortex-textMuted hover:text-cortex-text hover:bg-cortex-surface2/60'
                  }`}
                  data-testid={`provider-tab-${p.id}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-semibold">{p.name}</span>
                    {isActiveDefault && (
                      <span className="text-[9px] bg-cortex-surface1 text-cortex-accent px-1.5 py-0.2 border border-cortex-border font-mono">
                        Active
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-cortex-textMuted truncate">
                    {p.id === 'ollama' ? 'Local / Offline' : p.defaultModel}
                  </span>
                </button>
              );
            })}

            {/* Custom Providers Header */}
            <div className="mt-3 pt-2 border-t border-cortex-border px-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-cortex-textMuted">
                Custom Providers
              </span>
              <span className="text-[10px] font-mono text-cortex-textMuted">
                {store.customProviders.length}
              </span>
            </div>

            {/* Custom Providers List */}
            {store.customProviders.map((cp) => {
              const isSelected = selectedId === cp.id && !isCreatingCustom;
              const isActiveDefault = store.selectedAiProvider === cp.id;
              return (
                <button
                  key={cp.id}
                  onClick={() => selectProvider(cp.id)}
                  className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 transition-all border ${
                    isSelected
                      ? 'border-cortex-accent bg-cortex-surface2 text-cortex-text'
                      : 'border-transparent text-cortex-textMuted hover:text-cortex-text hover:bg-cortex-surface2/60'
                  }`}
                  data-testid={`custom-provider-tab-${cp.id}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-semibold truncate">{cp.displayName}</span>
                    {isActiveDefault && (
                      <span className="text-[9px] bg-cortex-surface1 text-cortex-accent px-1.5 py-0.2 border border-cortex-border font-mono">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-cortex-textMuted">
                    <span className="font-mono text-[9px] uppercase px-1 bg-cortex-surface1 border border-cortex-border">
                      {cp.protocol}
                    </span>
                    <span className="truncate">{cp.model}</span>
                  </div>
                </button>
              );
            })}

            {/* Add Custom Provider Button */}
            <button
              onClick={handleStartAddCustom}
              className={`w-full text-left px-3 py-2 mt-1 flex items-center gap-2 border border-dashed transition-all text-xs ${
                isCreatingCustom
                  ? 'border-cortex-accent bg-cortex-surface2 text-cortex-accent'
                  : 'border-cortex-borderStrong text-cortex-accent hover:bg-cortex-surface2/60'
              }`}
              data-testid="add-custom-provider-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom Provider</span>
            </button>

            {/* Storage notice */}
            <div className="mt-auto pt-3 border-t border-cortex-border text-[10px] text-cortex-textMuted flex items-start gap-1.5 px-1">
              <Shield className="w-3.5 h-3.5 text-cortex-accent shrink-0 mt-0.5" />
              <span>Credentials saved locally to ~/.config/aether/providers.toml (0600 permissions).</span>
            </div>
          </div>

          {/* Right Panel: Active Configuration Form */}
          <div className="flex-1 p-6 flex flex-col justify-between overflow-y-auto bg-cortex-bgAlt">
            <div className="flex flex-col gap-4">
              {/* Context Banner */}
              <div className="p-3.5 bg-cortex-surface1 border border-cortex-border flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-cortex-text flex items-center gap-2">
                    <span>
                      {isCreatingCustom
                        ? 'New Custom Provider'
                        : selectedCustom
                        ? selectedCustom.displayName
                        : activeMeta?.name}
                    </span>
                    {activeMeta?.docsUrl && (
                      <a
                        href={activeMeta.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-cortex-accent hover:underline flex items-center gap-1"
                      >
                        <span>API Keys</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-[11px] text-cortex-textMuted mt-1">
                    {isCreatingCustom
                      ? 'Configure a custom OpenAI or Anthropic-compatible endpoint with custom models.'
                      : selectedCustom
                      ? `Custom endpoint targeting ${selectedCustom.baseUrl}`
                      : activeMeta?.tagline}
                  </p>
                </div>

                {!isCreatingCustom && (
                  <button
                    type="button"
                    onClick={handleSetActiveProvider}
                    disabled={isCurrentActive}
                    className={`px-2.5 py-1 text-[11px] flex items-center gap-1.5 border transition-all ${
                      isCurrentActive
                        ? 'border-cortex-accent bg-cortex-accent/10 text-cortex-accent cursor-default'
                        : 'border-cortex-border hover:border-cortex-accent text-cortex-textMuted hover:text-cortex-text'
                    }`}
                    title={isCurrentActive ? 'Active provider' : 'Set as active provider'}
                    data-testid="set-active-provider-btn"
                  >
                    <Radio className={`w-3 h-3 ${isCurrentActive ? 'text-cortex-accent' : 'text-cortex-textMuted'}`} />
                    <span>{isCurrentActive ? 'Active Provider' : 'Set as Active'}</span>
                  </button>
                )}
              </div>

              {/* Custom Provider Specific Fields: Display Name & Protocol */}
              {(isCreatingCustom || selectedCustom) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-cortex-text flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-cortex-accent" />
                      <span>Display Name *</span>
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Together AI, DeepSeek, Local vLLM"
                      className="w-full bg-cortex-surface1 border border-cortex-border px-3 py-2 text-xs text-cortex-text placeholder-cortex-textMuted focus:outline-none focus:border-cortex-accent font-sans"
                      data-testid="custom-provider-display-name"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-cortex-text flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-cortex-accent" />
                      <span>Protocol Adapter</span>
                    </label>
                    <select
                      value={protocol}
                      onChange={(e) =>
                        setProtocol(
                          e.target.value as
                            | 'openai'
                            | 'anthropic'
                            | 'gemini'
                            | 'groq'
                            | 'ollama'
                            | 'openrouter'
                        )
                      }
                      className="w-full bg-cortex-surface1 border border-cortex-border px-3 py-2 text-xs text-cortex-text focus:outline-none focus:border-cortex-accent font-mono"
                      data-testid="custom-provider-protocol"
                    >
                      <option value="openai">OpenAI Compatible (/chat/completions)</option>
                      <option value="anthropic">Anthropic Compatible (/messages)</option>
                      <option value="gemini">Google Gemini OpenAI-Compat</option>
                      <option value="groq">Groq OpenAI-Compat</option>
                      <option value="ollama">Ollama (/api/chat)</option>
                      <option value="openrouter">OpenRouter Gateway</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Base URL / Endpoint Field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-cortex-text flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-cortex-accent" />
                  <span>
                    Endpoint Base URL
                    {isCreatingCustom || selectedCustom ? ' *' : ' (Optional Override)'}
                  </span>
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={
                    isCreatingCustom
                      ? 'https://api.together.xyz/v1'
                      : activeMeta?.defaultBaseUrl || 'https://api.openai.com/v1'
                  }
                  className="w-full bg-cortex-surface1 border border-cortex-border px-3 py-2 text-xs text-cortex-text placeholder-cortex-textMuted focus:outline-none focus:border-cortex-accent font-mono"
                  data-testid="provider-base-url-input"
                />
              </div>

              {/* API Key Input */}
              {activeMeta?.id === 'ollama' && !isCreatingCustom && !selectedCustom ? (
                <div className="p-3 bg-cortex-surface1 border border-cortex-border text-[11px] text-cortex-accent flex items-center gap-2">
                  <Check className="w-4 h-4 text-cortex-accent shrink-0" />
                  <span>Ollama executes locally on your machine. No API key is required.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-cortex-text flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-cortex-accent" />
                    <span>API Key</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={
                        isCreatingCustom
                          ? 'Enter provider API key (or leave empty for unauthenticated local endpoints)'
                          : `Enter your ${activeMeta?.name || 'provider'} API key`
                      }
                      className="w-full bg-cortex-surface1 border border-cortex-border px-3 py-2 text-xs text-cortex-text placeholder-cortex-textMuted focus:outline-none focus:border-cortex-accent font-mono pr-10"
                      data-testid="provider-api-key-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cortex-textMuted hover:text-cortex-text p-1"
                      title={showKey ? 'Mask API Key' : 'Reveal API Key'}
                      aria-label={showKey ? 'Mask API Key' : 'Reveal API Key'}
                      data-testid="toggle-api-key-mask"
                    >
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Model Identifier */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-cortex-text flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-cortex-accent" />
                  <span>
                    Model Identifier
                    {isCreatingCustom || selectedCustom ? ' *' : ''}
                  </span>
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={
                    isCreatingCustom
                      ? 'e.g. meta-llama/Llama-3.3-70B-Instruct, deepseek-chat'
                      : `e.g. ${activeMeta?.defaultModel || 'gpt-4o'}`
                  }
                  className="w-full bg-cortex-surface1 border border-cortex-border px-3 py-2 text-xs text-cortex-text placeholder-cortex-textMuted focus:outline-none focus:border-cortex-accent font-mono"
                  data-testid="provider-model-input"
                />
              </div>

              {/* Validation Error Banner */}
              {validationError && (
                <div
                  className="p-3 border border-cortex-error bg-cortex-error/10 text-cortex-error text-xs flex items-start gap-2.5"
                  data-testid="validation-error-banner"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1 font-mono">{validationError}</div>
                </div>
              )}

              {/* Test Status Banner */}
              {testResult && (
                <div
                  className={`p-3 border text-xs flex items-start gap-2.5 ${
                    testResult.success
                      ? 'border-cortex-accent bg-cortex-accent/10 text-cortex-accent'
                      : 'border-cortex-error bg-cortex-error/10 text-cortex-error'
                  }`}
                  data-testid="test-result-banner"
                >
                  {testResult.success ? (
                    <Check className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 overflow-hidden">
                    <div className="font-semibold">
                      {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                    </div>
                    <div className="text-[11px] opacity-90 mt-0.5 font-mono">
                      {testResult.message}
                    </div>
                  </div>
                </div>
              )}

              {/* Save Success Banner */}
              {saveSuccess && (
                <div
                  className="p-2.5 border border-cortex-accent bg-cortex-accent/10 text-cortex-accent text-xs flex items-center gap-2"
                  data-testid="save-success-banner"
                >
                  <Check className="w-4 h-4" />
                  <span>Configuration saved successfully.</span>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="mt-6 pt-4 border-t border-cortex-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="px-3.5 py-1.5 bg-cortex-surface2 hover:bg-cortex-surface1 text-cortex-text border border-cortex-border hover:border-cortex-accent text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="test-connection-btn"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                  <span>{testing ? 'Testing...' : 'Test Connection'}</span>
                </button>

                {selectedCustom && !isCreatingCustom && (
                  <button
                    type="button"
                    onClick={handleDeleteCustom}
                    className={`px-3 py-1.5 border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      deleteConfirm
                        ? 'bg-cortex-error text-white border-cortex-error'
                        : 'border-cortex-error/40 text-cortex-error hover:bg-cortex-error/10'
                    }`}
                    title="Delete Custom Provider"
                    data-testid="delete-custom-provider-btn"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deleteConfirm ? 'Confirm Delete?' : 'Delete'}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isCreatingCustom) {
                      setIsCreatingCustom(false);
                      selectProvider('openai');
                    } else {
                      toggleAiSettings(false);
                    }
                  }}
                  className="px-3.5 py-1.5 text-cortex-textMuted hover:text-cortex-text hover:bg-cortex-surface2 border border-transparent hover:border-cortex-border text-xs transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 bg-cortex-accent text-black hover:bg-cortex-accentHover border border-cortex-accent text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="save-provider-config-btn"
                >
                  {saving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {saving
                      ? 'Saving...'
                      : isCreatingCustom
                      ? 'Create Provider'
                      : 'Save Configuration'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
