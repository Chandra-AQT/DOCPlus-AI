import { useState, useEffect, useRef } from 'react'
import { Globe, Play, Square, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWorkflow } from '../../lib/store'
import { getFilterOptions, BASE_URL, logGuestActivity } from '../../lib/api'
import { isGuest, canFetchPdf, getGuestLimits } from '../../lib/auth'
import GuestTooltip from '../GuestTooltip'

const DOC_TYPE_LABELS = {
  PSS:'Spec Sheet', IOM:'Install/Ops', OWN:"Owner's Manual", SVM:'Service Manual',
  SVB:'Service Bulletin', PCT:'Catalog', PBR:'Brochure', SUB:'Submittal',
  WDG:'Wiring Diagram', PLD:'Parts List', WTY:'Warranty', CCL:'Commissioning',
  RCL:'Recall', SDS:'Safety Data', CRT:'Compliance', RUG:'Retrofit/Upgrade',
}

export default function StepCrawl() {
  const { state, set, goToStep } = useWorkflow()
  const { addCrawlUrl } = useWorkflow()
  const setDiscoveredPdfs = (pdfs) => set({ discoveredPdfs: pdfs })

  const [url,         setUrl]         = useState(state.crawlUrl || '')
  const [filters,     setFilters]     = useState({ formats:[], doc_types:[] })
  const [filterOpts,  setFilterOpts]  = useState({ formats:[], doc_types:[] })
  const [showFilters, setShowFilters] = useState(false)
  const [running,     setRunning]     = useState(false)
  const [logs,        setLogs]        = useState([])
  const esRef      = useRef(null)
  const logsEndRef = useRef(null)

  useEffect(() => {
    getFilterOptions().then(setFilterOpts).catch(() => {})
    return () => esRef.current?.close()
  }, [])

  useEffect(() => { logsEndRef.current?.scrollIntoView({behavior:'smooth'}) }, [logs])

  const toggleFormat  = (v) => setFilters(f => ({...f, formats:   f.formats.includes(v)   ? f.formats.filter(x=>x!==v)   : [...f.formats, v]}))
  const toggleDocType = (v) => setFilters(f => ({...f, doc_types: f.doc_types.includes(v) ? f.doc_types.filter(x=>x!==v) : [...f.doc_types, v]}))

  const startCrawl = () => {
    if (!url.trim()) { toast.error('Enter a website URL first'); return }
    let crawlUrl = url.trim().replace(/\/+$/, '')
    if (!crawlUrl.startsWith('http')) crawlUrl = 'https://' + crawlUrl
    setRunning(true)
    setLogs([{type:'info', text:`Starting crawl: ${crawlUrl}`}])
    set({crawlUrl:crawlUrl, discoveredPdfs:[], selectedPdfs:[], crawlProgress:null})
    goToStep(2)
    // Save to crawl history for this user
    addCrawlUrl(crawlUrl)
    // Log activity for guests
    if (isGuest()) logGuestActivity('crawl_url', crawlUrl)

    const params = new URLSearchParams({url: crawlUrl})
    if (filters.formats.length)   params.set('formats',   filters.formats.join(','))
    if (filters.doc_types.length) params.set('doc_types', filters.doc_types.join(','))

    const es = new EventSource(`${BASE_URL}/crawl-stream?${params}`)
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'progress') {
          set({crawlProgress: data})
          if (data.phase === 'crawling')     goToStep(2)
          if (data.phase === 'downloading')  goToStep(3)
          if (data.phase === 'packaging')    goToStep(4)
          const msg = data.message || (
            data.phase === 'crawling'    ? `Crawled ${data.pages} pages — ${data.pdf_found} document(s) found so far` :
            data.phase === 'downloading' ? `Downloading ${data.downloaded||0}/${data.total} documents...` :
            'Packaging results...'
          )
          setLogs(l => {
            if (l.length > 0 && l[l.length-1].text === msg) return l
            return [...l, {type:'info', text:msg}]
          })
        }
        if (data.type === 'done') {
          const pdfs = (data.files||[]).map(f => ({url:f.url, filename:f.name, format:f.format, doc_type:f.doc_type}))
          setDiscoveredPdfs(pdfs)
          set({crawlProgress:{...data, phase:'done'}})
          goToStep(5)
          setLogs(l => [...l, {type:'success', text:`✓ Crawl complete — ${data.pdf_found} docs found, ${data.downloaded} downloaded`}])
          setRunning(false); es.close()
          toast.success(`Discovered ${data.pdf_found} documents!`)
        }
        if (data.type === 'error') {
          setLogs(l => [...l, {type:'error', text:`✗ ${data.message}`}])
          setRunning(false); toast.error(data.message); es.close()
        }
      } catch {}
    }
    es.onerror = () => {
      if (running) { setLogs(l => [...l, {type:'error', text:'Connection error. Check backend is running.'}]); setRunning(false); toast.error('Connection failed') }
      es.close()
    }
  }

  const stopCrawl = () => {
    esRef.current?.close(); setRunning(false)
    setLogs(l => [...l, {type:'warn', text:'Crawl stopped by user.'}])
    toast('Crawl stopped')
  }

  const prog = state.crawlProgress
  const pct  = prog?.progress ?? 0
  const guestMode  = isGuest()
  const guestLimits = guestMode ? getGuestLimits() : null

  return (
    <div className="space-y-4">

      {/* Guest guidance banner */}
      {guestMode && (
        <div className="rounded-2xl px-5 py-4"
          style={{ background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.18)' }}>
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">💡</span>
            <div>
              <p className="text-sm font-bold text-white mb-1">
                How Discover works
                <GuestTooltip
                  title="PDF Discovery"
                  text="We crawl the website you enter and find all PDF documents. You can then select which ones to add to your library."
                  position="right" />
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Enter any website URL below → we crawl it and find all PDFs → you select up to{' '}
                <strong className="text-white">{guestLimits?.pdfRemaining ?? 5} more PDF{guestLimits?.pdfRemaining !== 1 ? 's' : ''}</strong>{' '}
                to add to your library.
              </p>
              {guestLimits?.pdfRemaining === 0 && (
                <p className="text-xs mt-1 font-bold text-red-400">
                  🔒 You've used all your PDF fetches. Request more access below.
                </p>
              )}
              {guestLimits?.pdfRemaining === 1 && (
                <p className="text-xs mt-1 font-bold" style={{ color: '#fbbf24' }}>
                  ⚠️ Only 1 PDF fetch remaining — choose carefully!
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Step 1 — URL */}
      <div className="rounded-2xl overflow-hidden" style={{background:'rgba(13,21,38,0.8)',border:'1px solid rgba(255,255,255,0.08)'}}>
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
              style={{background:'linear-gradient(135deg,#2563eb,#7c3aed)'}}>1</div>
            <div>
              <div className="font-bold text-white text-sm">Enter Website URL</div>
              <div className="text-xs text-white/40">Paste any manufacturer, supplier or product website</div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                className="w-full pl-11 pr-4 py-3 rounded-xl text-sm text-white outline-none transition-all"
                style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',caretColor:'#fff'}}
                onFocus={e => e.target.style.border='1px solid rgba(59,130,246,0.5)'}
                onBlur={e => e.target.style.border='1px solid rgba(255,255,255,0.1)'}
                value={url} onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key==='Enter' && !running && startCrawl()}
                placeholder="https://www.williamson-thermoflo.com"
                list="crawl-history-list"
                disabled={running} />
              {/* Crawl history datalist */}
              {state.crawlHistory?.length > 0 && (
                <datalist id="crawl-history-list">
                  {state.crawlHistory.map((u, i) => (
                    <option key={i} value={u} />
                  ))}
                </datalist>
              )}
            </div>
            {!running
              ? <button onClick={startCrawl}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black text-white transition-all hover:-translate-y-0.5"
                  style={{background:'linear-gradient(135deg,#2563eb,#7c3aed)',boxShadow:'0 4px 14px rgba(37,99,235,0.3)'}}>
                  <Play className="w-4 h-4" /> Crawl
                </button>
              : <button onClick={stopCrawl}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black text-white transition-all"
                  style={{background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.3)',color:'#fca5a5'}}>
                  <Square className="w-4 h-4" /> Stop
                </button>
            }
          </div>
          <p className="text-[11px] mt-2.5" style={{color:'rgba(255,255,255,0.25)'}}>
            💡 Use the root domain URL for best results — e.g. <span style={{color:'rgba(255,255,255,0.5)'}}>https://www.williamson-thermoflo.com</span> rather than a sub-page
          </p>
          {/* Recent URLs */}
          {state.crawlHistory?.length > 0 && !running && (
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{color:'rgba(255,255,255,0.2)'}}>Recent</p>
              <div className="flex flex-wrap gap-2">
                {state.crawlHistory.slice(0, 5).map((u, i) => (
                  <button key={i} onClick={() => setUrl(u)}
                    className="text-[11px] px-2.5 py-1 rounded-lg transition-colors truncate max-w-48"
                    style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.45)'}}
                    onMouseEnter={e => e.currentTarget.style.color='rgba(255,255,255,0.7)'}
                    onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,0.45)'}>
                    {u.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step 2 — Filters */}
      <div className="rounded-2xl overflow-hidden" style={{background:'rgba(13,21,38,0.8)',border:'1px solid rgba(255,255,255,0.08)'}}>
        <button className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
          onClick={() => setShowFilters(f => !f)}>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
              style={{background:'linear-gradient(135deg,#7c3aed,#2563eb)'}}>2</div>
            <div className="text-left">
              <span className="font-bold text-white text-sm">Filters </span>
              <span className="text-white/40 text-sm font-normal">(optional)</span>
              <div className="text-xs text-white/30">
                {filters.formats.length + filters.doc_types.length === 0
                  ? 'All formats & types — click to filter'
                  : `${filters.formats.length} format(s), ${filters.doc_types.length} type(s) active`}
              </div>
            </div>
          </div>
          {showFilters ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
        </button>

        {showFilters && (
          <div className="px-6 pb-6 space-y-5 border-t border-white/[0.05]" style={{paddingTop:20}}>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2.5">File Formats</div>
              <div className="flex flex-wrap gap-2">
                {(filterOpts.formats.length ? filterOpts.formats : [
                  {value:'pdf',label:'PDF'},{value:'word',label:'Word'},
                  {value:'excel',label:'Excel'},{value:'ppt',label:'PowerPoint'}
                ]).map(f => (
                  <button key={f.value} onClick={() => toggleFormat(f.value)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                    style={filters.formats.includes(f.value)
                      ? {background:'rgba(37,99,235,0.15)',border:'1px solid rgba(37,99,235,0.4)',color:'#93c5fd'}
                      : {background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.4)'}
                    }>{f.label}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2.5">Document Types</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(DOC_TYPE_LABELS).map(([code, label]) => (
                  <button key={code} onClick={() => toggleDocType(code)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                    style={filters.doc_types.includes(code)
                      ? {background:'rgba(124,58,237,0.15)',border:'1px solid rgba(124,58,237,0.4)',color:'#c4b5fd'}
                      : {background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.4)'}
                    }>
                    <span className="font-mono">{code}</span> · {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      {(running || prog) && (
        <div className="rounded-2xl p-5" style={{background:'rgba(13,21,38,0.8)',border:'1px solid rgba(255,255,255,0.08)'}}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {running && <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />}
              <span className="text-sm font-bold text-white capitalize">{prog?.phase || 'Starting'}...</span>
            </div>
            <span className="text-sm font-mono" style={{color:'#60a5fa'}}>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{background:'rgba(255,255,255,0.06)'}}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{width:`${pct}%`,background:'linear-gradient(90deg,#2563eb,#7c3aed)'}} />
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              {label:'Pages Crawled', val: prog?.pages     ?? 0},
              {label:'Docs Found',    val: prog?.pdf_found ?? 0},
              {label:'Downloaded',    val: prog?.downloaded?? 0},
            ].map(s => (
              <div key={s.label} className="rounded-xl py-2.5 text-center"
                style={{background:'rgba(255,255,255,0.04)'}}>
                <div className="text-xl font-black text-white">{s.val}</div>
                <div className="text-[10px] text-white/30 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl overflow-hidden" style={{background:'rgba(0,0,0,0.4)',border:'1px solid rgba(255,255,255,0.05)'}}>
            <div className="px-3 py-2 flex items-center gap-2 border-b border-white/[0.05]">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] font-mono text-white/30">live log</span>
            </div>
            <div className="p-3 font-mono text-xs space-y-1 max-h-36 overflow-y-auto">
              {logs.slice(-20).map((l,i) => (
                <div key={i} className={
                  l.type==='success' ? 'text-green-400' :
                  l.type==='error'   ? 'text-red-400' :
                  l.type==='warn'    ? 'text-yellow-400' : 'text-white/50'
                }>{l.text}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
