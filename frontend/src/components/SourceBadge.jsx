/**
 * SourceBadge — Feature 2: Data Lineage & Evidence Layer
 *
 * Renders a small coloured pill showing where a value came from.
 * Clicking opens the Evidence drawer for that field.
 *
 * Source categories:
 *   table     → green   (extracted from a document table)
 *   kv        → blue    (extracted from a key-value pair)
 *   ai        → purple  (extracted via AI provider)
 *   heuristic → amber   (extracted via smart regex / heuristic)
 *   fallback  → grey    (schema default value, not found in document)
 */

// ── Colour map ────────────────────────────────────────────────────────────────
const SOURCE_STYLES = {
  table:     { bg: 'rgba(34,197,94,0.13)',   border: 'rgba(34,197,94,0.3)',   color: '#34d399', label: 'Table'     },
  kv:        { bg: 'rgba(37,99,235,0.13)',   border: 'rgba(37,99,235,0.3)',   color: '#60a5fa', label: 'KV Pair'   },
  ai:        { bg: 'rgba(124,58,237,0.13)',  border: 'rgba(124,58,237,0.3)',  color: '#c4b5fd', label: 'AI'        },
  heuristic: { bg: 'rgba(245,158,11,0.13)',  border: 'rgba(245,158,11,0.3)',  color: '#fbbf24', label: 'Heuristic' },
  fallback:  { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.3)', label: 'Default' },
}

/**
 * Derive the category from a raw source_type string.
 * source_type examples: "table", "kv", "ai:openai", "ai:anthropic",
 *   "text_pattern", "regex_pattern", "heuristic_rescued", "fallback", "landingai_ade"
 */
export function sourceCategory(sourceType) {
  if (!sourceType) return 'fallback'
  const s = sourceType.toLowerCase()
  if (s === 'table') return 'table'
  if (s === 'kv') return 'kv'
  if (s.startsWith('ai:') || s === 'landingai_ade') return 'ai'
  if (s === 'fallback') return 'fallback'
  return 'heuristic' // text, text_pattern, regex_pattern, heuristic_rescued, chunk …
}

/**
 * SourceBadge
 *
 * Props:
 *   sourceType  {string}    e.g. "table", "ai:openai", "kv" — raw from API
 *   onClick     {function}  called when badge is clicked (opens drawer)
 *   compact     {boolean}   if true, show icon only (no label text)
 *   className   {string}    extra class names
 */
export default function SourceBadge({ sourceType, onClick, compact = false, className = '' }) {
  const cat    = sourceCategory(sourceType)
  const styles = SOURCE_STYLES[cat] || SOURCE_STYLES.fallback

  const icons = {
    table:     '⊞',
    kv:        '⊟',
    ai:        '✦',
    heuristic: '◈',
    fallback:  '○',
  }

  const tooltips = {
    table:     'Extracted from a document table',
    kv:        'Extracted from a key-value pair',
    ai:        'Extracted using AI',
    heuristic: 'Extracted using pattern matching',
    fallback:  'Default value — not found in document',
  }

  const label = styles.label
  const icon  = icons[cat]

  return (
    <button
      onClick={onClick}
      title={tooltips[cat]}
      className={`inline-flex items-center gap-0.5 rounded font-bold transition-all shrink-0
        ${onClick ? 'cursor-pointer hover:opacity-80 active:scale-95' : 'cursor-default'}
        ${compact ? 'px-1 py-0.5 text-[8px]' : 'px-1.5 py-0.5 text-[9px]'}
        ${className}`}
      style={{
        background:  styles.bg,
        border:      `1px solid ${styles.border}`,
        color:       styles.color,
        lineHeight:  1,
      }}
    >
      <span>{icon}</span>
      {!compact && <span>{label}</span>}
    </button>
  )
}
