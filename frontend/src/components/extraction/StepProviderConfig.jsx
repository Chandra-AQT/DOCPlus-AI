import { useState } from 'react'
import { Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react'
import { useWorkflow } from '../../lib/store'
import { PROVIDERS } from '../../lib/utils'

const GROUPS = [
  { label: 'No API Key Required', keys: ['none', 'python', 'hybrid', 'ollama'] },
  { label: 'OpenAI / ChatGPT',    keys: ['openai', 'chatgpt'] },
  { label: 'Anthropic',           keys: ['anthropic'] },
  { label: 'Google',              keys: ['gemini'] },
  { label: 'Groq / Fast LLMs',    keys: ['groq'] },
  { label: 'LandingAI ADE',       keys: ['landingai'] },
  { label: 'Other Providers',     keys: ['grok', 'perplexity', 'emergence'] },
]

export default function StepProviderConfig() {
  const { state, set } = useWorkflow()
  const [showKey, setShowKey]         = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const cfg = state.providerConfig

  const update = (key, val) => set({ providerConfig: { ...cfg, [key]: val } })
  const active  = PROVIDERS.find(p => p.key === cfg.provider) || PROVIDERS[0]

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black text-white"
          style={{background:'linear-gradient(135deg,#f59e0b,#ef4444)'}}>10</div>
        <div>
          <div className="font-bold text-white text-sm">AI Engine</div>
          <div className="text-xs text-white/40">
            {active.label}
            {active.needsKey && !cfg.api_key && (
              <span className="ml-2 text-yellow-400">⚠ API key required</span>
            )}
          </div>
        </div>
      </div>

      {/* Provider groups */}
      <div className="space-y-3 mb-4">
        {GROUPS.map(group => {
          const groupProviders = group.keys.map(k => PROVIDERS.find(p => p.key === k)).filter(Boolean)
          return (
            <div key={group.label}>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1.5 px-1">
                {group.label}
              </div>
              <div className="space-y-1">
                {groupProviders.map(p => (
                  <button key={p.key}
                    onClick={() => set({ providerConfig: { ...cfg, provider: p.key, model: p.model || '' } })}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-all text-left ${
                      cfg.provider === p.key
                        ? 'border-blue-500/40 bg-blue-500/10 text-white'
                        : 'border-white/[0.06] text-white/40 hover:border-white/15 hover:text-white/70'
                    }`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.provider === p.key ? 'bg-blue-400' : 'bg-white/10'}`} />
                    <span className="text-xs font-medium flex-1">{p.label}</span>
                    <div className="flex gap-1">
                      {p.needsKey && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{background:'rgba(124,58,237,0.15)', color:'#c4b5fd'}}>KEY</span>}
                      {p.needsBaseUrl && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{background:'rgba(234,179,8,0.12)', color:'#fde047'}}>URL</span>}
                      {!p.needsKey && !p.needsBaseUrl && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{background:'rgba(34,197,94,0.12)', color:'#86efac'}}>FREE</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* API Key & config fields */}
      {active.needsKey && (
        <div className="space-y-2.5 pt-3 border-t border-white/[0.06]">
          <div className="text-xs font-bold text-white/40 uppercase tracking-wider">{active.label} Configuration</div>
          <div className="relative">
            <input
              className="input pr-10 text-sm"
              type={showKey ? 'text' : 'password'}
              placeholder={`${active.label} API Key *`}
              value={cfg.api_key}
              onChange={e => update('api_key', e.target.value)}
            />
            <button onClick={() => setShowKey(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {active.needsBaseUrl && (
            <input className="input text-sm"
              placeholder={active.key === 'landingai' ? 'LandingAI Environment (e.g. production)' : 'Base URL'}
              value={cfg.base_url}
              onChange={e => update('base_url', e.target.value)} />
          )}
        </div>
      )}

      {/* Ollama base URL (no key needed) */}
      {active.key === 'ollama' && (
        <div className="pt-3 border-t border-white/[0.06] space-y-2">
          <div className="text-xs font-bold text-white/40 uppercase tracking-wider">Ollama Server</div>
          <input className="input text-sm"
            placeholder="http://localhost:11434"
            value={cfg.base_url}
            onChange={e => update('base_url', e.target.value)} />
        </div>
      )}

      {/* Advanced — model override */}
      <button onClick={() => setShowAdvanced(s => !s)}
        className="flex items-center gap-1.5 text-xs text-white/25 hover:text-white/50 mt-3 transition-colors">
        {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Advanced options
      </button>
      {showAdvanced && (
        <div className="mt-2">
          <input className="input text-sm"
            placeholder={`Model (default: ${active.model || 'auto'})`}
            value={cfg.model}
            onChange={e => update('model', e.target.value)} />
          <div className="text-[10px] text-white/20 mt-1 px-1">Override the default model for this provider</div>
        </div>
      )}

      {/* Status */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/[0.05]">
        <div className={`w-2 h-2 rounded-full ${
          cfg.provider === 'none' || cfg.provider === 'python' ? 'bg-white/20' :
          cfg.api_key || !active.needsKey ? 'bg-green-400' : 'bg-yellow-400'
        }`} />
        <span className="text-xs text-white/40">
          {cfg.provider === 'none' || cfg.provider === 'python'
            ? 'Heuristic pattern matching — fast, no AI cost'
            : active.needsKey && !cfg.api_key
            ? 'Enter API key to enable'
            : `${active.label} ready`
          }
        </span>
      </div>
    </div>
  )
}
