import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) { return twMerge(clsx(inputs)) }

export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024, sizes = ['B','KB','MB','GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function confidenceBadge(score) {
  if (!score && score !== 0) return { label: '—', cls: 'badge-gray' }
  const pct = score > 1 ? score : score * 100
  if (pct >= 80) return { label: `${Math.round(pct)}%`, cls: 'badge-green' }
  if (pct >= 50) return { label: `${Math.round(pct)}%`, cls: 'badge-yellow' }
  return { label: `${Math.round(pct)}%`, cls: 'badge-red' }
}

export function docTypeBadge(type) {
  const map = {
    PSS:'badge-blue', IOM:'badge-purple', OWN:'badge-cyan', SVM:'badge-yellow',
    SVB:'badge-yellow', PCT:'badge-green', PBR:'badge-green', SUB:'badge-blue',
    WDG:'badge-red', PLD:'badge-red', WTY:'badge-purple', CCL:'badge-cyan',
    RCL:'badge-red', SDS:'badge-yellow', CRT:'badge-green', RUG:'badge-purple',
    OTHER:'badge-gray',
  }
  return map[type] || 'badge-gray'
}

export function formatBadge(fmt) {
  const map = { pdf:'badge-red', word:'badge-blue', excel:'badge-green', ppt:'badge-yellow' }
  return map[fmt] || 'badge-gray'
}

export function statusBadge(status) {
  const map = { uploaded:'badge-blue', parsing:'badge-yellow', parsed:'badge-green', error:'badge-red', running:'badge-yellow', completed:'badge-green', failed:'badge-red' }
  return map[status] || 'badge-gray'
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Indian Standard Time (IST = UTC+5:30) formatters ─────────────────────────
const IST_LOCALE = 'en-IN'
const IST_TZ     = 'Asia/Kolkata'

/** Format a date string/object as IST date: "19 Aug 2026" */
export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(IST_LOCALE, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: IST_TZ,
  })
}

/** Format a date string/object as IST time: "10:36 AM" */
export function fmtTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleTimeString(IST_LOCALE, {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: IST_TZ,
  })
}

/** Format a date string/object as full IST datetime: "19 Aug 2026, 10:36 AM" */
export function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString(IST_LOCALE, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: IST_TZ,
  })
}

export const PROVIDERS = [
  { key: 'none',       label: 'None (Heuristic only)',  model: '',                                          needsKey: false },
  { key: 'python',     label: 'Python Heuristic',        model: 'heuristic',                                needsKey: false },
  { key: 'landingai',  label: 'LandingAI ADE',           model: 'dpt-2-latest',                             needsKey: true,  needsBaseUrl: true  },
  { key: 'openai',     label: 'OpenAI GPT-4o',           model: 'gpt-4o-mini',                              needsKey: true  },
  { key: 'chatgpt',    label: 'ChatGPT',                  model: 'gpt-4o-mini',                              needsKey: true  },
  { key: 'anthropic',  label: 'Anthropic Claude',         model: 'claude-3-5-haiku-20241022',                needsKey: true  },
  { key: 'gemini',     label: 'Google Gemini',            model: 'gemini-2.0-flash',                         needsKey: true  },
  { key: 'groq',       label: 'Groq (LLaMA)',             model: 'llama-3.1-8b-instant',                     needsKey: true  },
  { key: 'grok',       label: 'xAI Grok',                 model: 'grok-beta',                                needsKey: true,  needsBaseUrl: true  },
  { key: 'perplexity', label: 'Perplexity AI',            model: 'llama-3.1-sonar-large-128k-online',        needsKey: true  },
  { key: 'emergence',  label: 'Emergence AI',             model: 'em-llm-001',                               needsKey: true,  needsBaseUrl: true  },
  { key: 'ollama',     label: 'Ollama (Local)',            model: 'llama3',                                   needsKey: false, needsBaseUrl: true  },
  { key: 'hybrid',     label: 'Hybrid (Heuristic + AI)',  model: '',                                          needsKey: false },
]

export const FIELD_TYPES = ['string','number','integer','boolean','date','currency','email','phone','url','list','object']

export const SAMPLE_SCHEMAS = [
  { name: 'Equipment Spec', fields: [
    { name: 'manufacturer', type: 'string', description: 'Brand or manufacturer name' },
    { name: 'model_number', type: 'string', description: 'Model number' },
    { name: 'width_in', type: 'number', description: 'Width in inches' },
    { name: 'height_in', type: 'number', description: 'Height in inches' },
    { name: 'depth_in', type: 'number', description: 'Depth in inches' },
    { name: 'weight_lbs', type: 'number', description: 'Weight in pounds' },
    { name: 'voltage', type: 'string', description: 'Voltage rating' },
    { name: 'warranty', type: 'string', description: 'Warranty period' },
  ]},
  { name: 'Product Brochure', fields: [
    { name: 'product_name', type: 'string', description: 'Product name' },
    { name: 'description', type: 'string', description: 'Product description' },
    { name: 'key_features', type: 'list', description: 'Key features list' },
    { name: 'applications', type: 'list', description: 'Applications or use cases' },
    { name: 'part_number', type: 'string', description: 'Part number' },
  ]},
  { name: 'Invoice / PO', fields: [
    { name: 'vendor_name', type: 'string', description: 'Vendor name' },
    { name: 'invoice_number', type: 'string', description: 'Invoice number' },
    { name: 'invoice_date', type: 'date', description: 'Invoice date' },
    { name: 'total_amount', type: 'currency', description: 'Total invoice amount' },
    { name: 'due_date', type: 'date', description: 'Payment due date' },
  ]},
]
