import { useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { useWorkflow } from '../lib/store'
import StepCrawl from '../components/workflow/StepCrawl'
import StepDiscovered from '../components/workflow/StepDiscovered'
import { isGuest, getGuestLimits } from '../lib/auth'

// Step pill progress bar
function StepPills({ active }) {
  const steps = [
    {n:1, label:'URL'},
    {n:2, label:'Crawl'},
    {n:3, label:'Discover'},
    {n:4, label:'Filter'},
    {n:5, label:'Review'},
  ]
  return (
    <div className="flex items-center gap-1 flex-wrap mb-6">
      {steps.map((s, i) => {
        const done  = active > s.n
        const isAct = active === s.n
        return (
          <div key={s.n} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              done ? 'text-green-400' : isAct ? 'text-white' : 'text-white/25'}`}
              style={
                isAct ? {background:'linear-gradient(135deg,#2563eb,#7c3aed)',boxShadow:'0 2px 12px rgba(37,99,235,0.35)'}
              : done  ? {background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.2)'}
              : {background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)'}
              }>
              <span className="font-black">{done ? '✓' : s.n}</span>
              <span>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="w-4 h-px" style={{background: done ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.08)'}} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function WorkflowPage() {
  const navigate  = useNavigate()
  const { state } = useWorkflow()

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-white/30 mb-3">
        <span>DOCPlus AI+</span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-white/60 font-medium">Discover PDFs</span>
      </div>

      <h1 className="text-2xl font-black text-white mb-1">PDF Discovery</h1>
      <p className="text-white/40 text-sm mb-6">
        Enter a website URL to crawl, discover PDFs, filter by type, preview and select — then send to your document library.
      </p>

      <StepPills active={state.activeStep || 1} />

      <div className="space-y-5">
        <StepCrawl />
        {state.discoveredPdfs.length > 0 && <StepDiscovered />}
      </div>

      {/* Library CTA + Guest "What's Next" banner */}
      {state.library.length > 0 && (
        <div className="mt-6 space-y-4">
          {/* Guest what's next */}
          {isGuest() && (
            <div className="rounded-2xl px-5 py-4 flex items-center gap-4"
              style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <span className="text-2xl shrink-0">✅</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-white mb-0.5">
                  {state.library.length} document{state.library.length > 1 ? 's' : ''} added to your library!
                </p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Next → Go to Extract to run AI metadata extraction on your documents.
                  {(() => { const l = getGuestLimits(); return l ? ` You have ${l.extractionRemaining} extraction${l.extractionRemaining !== 1 ? 's' : ''} remaining.` : '' })()}
                </p>
              </div>
              <button onClick={() => navigate('/extract')}
                className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                Extract Now <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="rounded-2xl p-5 flex items-center justify-between"
            style={{background:'rgba(34,197,94,0.07)',border:'1px solid rgba(34,197,94,0.2)'}}>
            <div>
              <div className="text-sm font-bold text-green-400">
                {state.library.length} document{state.library.length > 1 ? 's' : ''} in your library
              </div>
              <div className="text-xs text-white/40 mt-0.5">Ready to select documents for AI extraction</div>
            </div>
            <button onClick={() => navigate('/library')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:-translate-y-0.5"
              style={{background:'linear-gradient(135deg,#22c55e,#16a34a)',boxShadow:'0 4px 14px rgba(34,197,94,0.3)'}}>
              Go to Library <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
