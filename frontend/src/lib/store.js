import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react'
import { saveUserData, loadUserData } from './auth'

const WorkflowContext = createContext(null)

// ── What gets persisted per user ──────────────────────────────────────────────
// providerConfig  — API keys, engine, model, base URL (never sent to server)
// crawlHistory    — last 10 crawled URLs
// schemaPreference — last used schema id + name

function loadPersistedState() {
  return {
    providerConfig: loadUserData('provider_config', {
      provider: 'none', api_key: '', model: '', base_url: ''
    }),
    crawlHistory: loadUserData('crawl_history', []),
  }
}

const init = {
  crawlUrl: '', crawlFilters: { formats: [], doc_types: [] },
  crawlProgress: null, discoveredPdfs: [], selectedPdfs: [],
  library: [],
  selectedDocIds: [], schema: null,
  providerConfig: { provider: 'none', api_key: '', model: '', base_url: '' },
  extractionJobs: [],
  lastExportFormat: 'excel',
  activeStep: 1,
  crawlHistory: [],
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET': return { ...state, ...action.payload }
    case 'TOGGLE_PDF': {
      const exists = state.selectedPdfs.find(p => p.url === action.pdf.url)
      return {
        ...state,
        selectedPdfs: exists
          ? state.selectedPdfs.filter(p => p.url !== action.pdf.url)
          : [...state.selectedPdfs, action.pdf]
      }
    }
    case 'TOGGLE_DOC': {
      const exists = state.selectedDocIds.includes(action.id)
      return {
        ...state,
        selectedDocIds: exists
          ? state.selectedDocIds.filter(i => i !== action.id)
          : [...state.selectedDocIds, action.id]
      }
    }
    case 'ADD_TO_LIBRARY':
      return { ...state, library: [action.doc, ...state.library.filter(d => d.id !== action.doc.id)] }
    case 'REMOVE_FROM_LIBRARY':
      return { ...state, library: state.library.filter(d => d.id !== action.id) }
    case 'ADD_JOB':
      return { ...state, extractionJobs: [action.job, ...state.extractionJobs] }
    case 'UPDATE_JOB':
      return {
        ...state,
        extractionJobs: state.extractionJobs.map(j =>
          j.job_id === action.id ? { ...j, ...action.upd } : j
        )
      }
    case 'ADD_CRAWL_URL': {
      const url = action.url
      const existing = state.crawlHistory.filter(u => u !== url)
      const updated  = [url, ...existing].slice(0, 10) // keep last 10
      return { ...state, crawlHistory: updated }
    }
    case 'RESET':
      return { ...init, ...loadPersistedState() }
    default:
      return state
  }
}

export function WorkflowProvider({ children }) {
  // Merge saved user data into initial state
  const persisted = loadPersistedState()
  const initialState = { ...init, ...persisted }

  const [state, dispatch] = useReducer(reducer, initialState)

  // ── Persist whenever providerConfig changes ───────────────────────────────
  useEffect(() => {
    if (state.providerConfig) {
      saveUserData('provider_config', state.providerConfig)
    }
  }, [state.providerConfig])

  // ── Persist crawl history ─────────────────────────────────────────────────
  useEffect(() => {
    if (state.crawlHistory?.length > 0) {
      saveUserData('crawl_history', state.crawlHistory)
    }
  }, [state.crawlHistory])

  const actions = {
    set:              useCallback((payload) => dispatch({ type: 'SET', payload }), []),
    togglePdf:        useCallback((pdf) => dispatch({ type: 'TOGGLE_PDF', pdf }), []),
    toggleDoc:        useCallback((id) => dispatch({ type: 'TOGGLE_DOC', id }), []),
    addToLibrary:     useCallback((doc) => dispatch({ type: 'ADD_TO_LIBRARY', doc }), []),
    removeFromLibrary:useCallback((id) => dispatch({ type: 'REMOVE_FROM_LIBRARY', id }), []),
    addJob:           useCallback((job) => dispatch({ type: 'ADD_JOB', job }), []),
    updateJob:        useCallback((id, upd) => dispatch({ type: 'UPDATE_JOB', id, upd }), []),
    reset:            useCallback(() => dispatch({ type: 'RESET' }), []),
    goToStep:         useCallback((n) => dispatch({ type: 'SET', payload: { activeStep: n } }), []),
    addCrawlUrl:      useCallback((url) => dispatch({ type: 'ADD_CRAWL_URL', url }), []),
  }

  return React.createElement(
    WorkflowContext.Provider,
    { value: { state, ...actions } },
    children
  )
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext)
  if (!ctx) throw new Error('useWorkflow must be used within WorkflowProvider')
  return ctx
}
