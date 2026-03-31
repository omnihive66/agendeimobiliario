'use client'

import { useEffect, useState } from 'react'

type SpinStage = 'S' | 'P' | 'I' | 'N' | 'DONE'
type TabKey = 'conversas' | 'agendamentos' | 'leads' | 'prompt' | 'status' | 'config'
type Temperature = 'quente' | 'morno' | 'frio'

interface Lead {
  id: string
  phone: string
  name?: string
  spin_stage: SpinStage
  situacao?: string
  dor_principal?: string
  updated_at: string
}

interface Agendamento {
  id: string
  lead_phone: string
  lead_name?: string
  dor_principal?: string
  data_visita: string
  hora_visita: string
  status: 'pendente' | 'confirmado' | 'cancelado' | 'realizado'
  created_at: string
}

interface WebhookStatus {
  webhook_url: string
  meta_phone_number_id: string
  meta_connected: boolean
  meta_phone: string | null
  meta_name: string | null
  meta_quality: string | null
  meta_error?: string
  messages_24h: number | null
  leads_today: number | null
  last_message: string | null
  last_message_phone: string | null
  timestamp: string
}

interface ConvLead {
  id: string
  phone: string
  name?: string | null
  spin_stage?: string | null
  dor_principal?: string | null
  updated_at?: string | null
  temperature: Temperature
  last_message?: string | null
  last_message_role?: string | null
  last_message_at?: string | null
  last_media_type?: string | null
}

interface Mensagem {
  id: string
  lead_phone: string
  role: string
  content: string
  media_type?: string | null
  created_at?: string | null
}

interface FieldInfo { set: boolean; source: 'env' | 'config' | null }
interface Settings {
  supabase_ready: boolean
  meta_phone_number_id: string
  meta_phone_number_id_info: FieldInfo
  meta_access_token_info: FieldInfo
  meta_verify_token: string
  meta_verify_token_info: FieldInfo
  groq_api_key_info: FieldInfo
  openai_api_key_info: FieldInfo
  ai_model: string
}

const TEMP_CONFIG: Record<Temperature, { emoji: string; label: string; color: string; bg: string; border: string }> = {
  quente: { emoji: '🔥', label: 'Quente', color: '#f97316', bg: '#2a1500', border: '#7c2d12' },
  morno:  { emoji: '🌡️', label: 'Morno',  color: '#facc15', bg: '#1f1a00', border: '#713f12' },
  frio:   { emoji: '❄️', label: 'Frio',   color: '#60a5fa', bg: '#0a1628', border: '#1e3a5f' },
}

const AI_MODELS = [
  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Groq — padrão)', provider: 'groq' },
  { value: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B (Groq — rápido)',  provider: 'groq' },
  { value: 'gpt-4o',                  label: 'GPT-4o (OpenAI)',                provider: 'openai' },
  { value: 'gpt-4o-mini',             label: 'GPT-4o Mini (OpenAI — barato)',  provider: 'openai' },
]

const STAGE_LABELS: Record<SpinStage, string> = {
  S: 'Situação',
  P: 'Problema',
  I: 'Implicação',
  N: 'Necessidade',
  DONE: 'Agendado'
}

const STATUS_COLORS: Record<string, string> = {
  pendente:   'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  confirmado: 'bg-green-900/40 text-green-300 border-green-800',
  cancelado:  'bg-red-900/40 text-red-300 border-red-800',
  realizado:  'bg-blue-900/40 text-blue-300 border-blue-800'
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  })
}

export default function Dashboard() {
  const [tab, setTab] = useState<TabKey>('conversas')
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Conversas tab state ─────────────────────────────────────
  const [convLeads, setConvLeads] = useState<ConvLead[]>([])
  const [convLoading, setConvLoading] = useState(false)
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [messages, setMessages] = useState<Mensagem[]>([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [convSearch, setConvSearch] = useState('')
  const [tempFilter, setTempFilter] = useState<Temperature | 'todos'>('todos')

  // ── Prompt tab state ────────────────────────────────────────
  const [promptText, setPromptText] = useState('')
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptMsg, setPromptMsg] = useState('')
  const [promptLoading, setPromptLoading] = useState(false)

  // ── Status tab state ────────────────────────────────────────
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // ── Config tab state ────────────────────────────────────────
  const [cfgSettings, setCfgSettings] = useState<Settings | null>(null)
  const [cfgLoading, setCfgLoading] = useState(false)
  const [cfgSaving, setCfgSaving] = useState(false)
  const [cfgMsg, setCfgMsg] = useState('')
  const [cfgForm, setCfgForm] = useState({
    meta_phone_number_id: '',
    meta_access_token: '',
    meta_verify_token: '',
    groq_api_key: '',
    openai_api_key: '',
    ai_model: 'llama-3.3-70b-versatile',
  })
  const [metaTesting, setMetaTesting] = useState(false)
  const [metaTestResult, setMetaTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [webhookInfoResult, setWebhookInfoResult] = useState<{ ok: boolean; msg: string; details?: string[] } | null>(null)

  // ── QR Code WhatsApp ────────────────────────────────────────
  const [qrData, setQrData] = useState<{ connected: boolean; phone?: string | null; qr?: string | null; error?: string } | null>(null)
  const [qrLoading, setQrLoading] = useState(false)

  // ── Conversas ───────────────────────────────────────────────
  async function loadConversations() {
    setConvLoading(true)
    try {
      const r = await fetch('/api/conversations')
      const d = await r.json()
      setConvLeads(Array.isArray(d) ? d : [])
    } catch {
      setConvLeads([])
    } finally {
      setConvLoading(false)
    }
  }

  async function loadMessages(phone: string) {
    setMsgLoading(true)
    setMessages([])
    try {
      const r = await fetch(`/api/conversations/${encodeURIComponent(phone)}`)
      const d = await r.json()
      setMessages(Array.isArray(d) ? d : [])
    } catch {
      setMessages([])
    } finally {
      setMsgLoading(false)
    }
  }

  function selectLead(phone: string) {
    setSelectedPhone(phone)
    loadMessages(phone)
  }

  // ── Data loading ────────────────────────────────────────────
  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [agResp, leResp] = await Promise.all([
        fetch('/api/schedule').then(r => { if (!r.ok) throw new Error('schedule'); return r.json() }),
        fetch('/api/leads').then(r => { if (!r.ok) throw new Error('leads'); return r.json() })
      ])
      setAgendamentos(Array.isArray(agResp) ? agResp : [])
      setLeads(Array.isArray(leResp) ? leResp : [])
    } catch {
      setError('Erro ao carregar dados. Verifique a conexão com o Supabase.')
    } finally {
      setLoading(false)
    }
  }

  async function loadPrompt() {
    setPromptLoading(true)
    try {
      const r = await fetch('/api/config')
      const d = await r.json()
      setPromptText(d.prompt || '')
    } catch {
      setPromptText('')
    } finally {
      setPromptLoading(false)
    }
  }

  async function savePrompt() {
    setPromptSaving(true)
    setPromptMsg('')
    try {
      const r = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText })
      })
      const d = await r.json()
      if (r.ok) {
        setPromptMsg('✅ Prompt salvo com sucesso!')
      } else {
        setPromptMsg(`❌ Erro: ${d.error || r.status}`)
      }
    } catch (e: any) {
      setPromptMsg(`❌ Erro de conexão: ${e.message}`)
    } finally {
      setPromptSaving(false)
    }
  }

  async function resetPrompt() {
    if (!confirm('Restaurar o prompt padrão? O prompt personalizado será apagado.')) return
    try {
      await fetch('/api/config', { method: 'DELETE' })
      setPromptText('')
      setPromptMsg('✅ Prompt restaurado para o padrão.')
    } catch {
      setPromptMsg('❌ Erro ao restaurar.')
    }
  }

  async function loadStatus() {
    setStatusLoading(true)
    try {
      const r = await fetch('/api/webhook-status')
      const d = await r.json()
      setWebhookStatus(d)
    } catch {
      setWebhookStatus(null)
    } finally {
      setStatusLoading(false)
    }
  }

  async function loadConfig() {
    setCfgLoading(true)
    try {
      const r = await fetch('/api/settings')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d: Settings = await r.json()
      setCfgSettings(d)
      setCfgForm(prev => ({
        ...prev,
        ai_model: d.ai_model,
        meta_phone_number_id: d.meta_phone_number_id || prev.meta_phone_number_id,
        meta_verify_token: d.meta_verify_token || prev.meta_verify_token,
      }))
    } catch (e: any) {
      setCfgMsg(`❌ Erro ao carregar: ${e.message}`)
      setCfgSettings(null)
    } finally {
      setCfgLoading(false)
    }
  }

  async function saveConfig() {
    setCfgSaving(true)
    setCfgMsg('')
    try {
      const payload: Record<string, string> = { ai_model: cfgForm.ai_model }
      if (cfgForm.meta_phone_number_id) payload.meta_phone_number_id = cfgForm.meta_phone_number_id
      if (cfgForm.meta_access_token)    payload.meta_access_token    = cfgForm.meta_access_token
      if (cfgForm.meta_verify_token)    payload.meta_verify_token    = cfgForm.meta_verify_token
      if (cfgForm.groq_api_key)         payload.groq_api_key         = cfgForm.groq_api_key
      if (cfgForm.openai_api_key)       payload.openai_api_key       = cfgForm.openai_api_key

      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const d = await r.json()
      if (r.ok) {
        setCfgMsg('✅ Configurações salvas!')
        // limpa campos sensíveis após salvar
        setCfgForm(prev => ({ ...prev, meta_access_token: '', groq_api_key: '', openai_api_key: '' }))
        loadConfig()
      } else {
        setCfgMsg(`❌ ${d.error || 'Erro ao salvar.'}`)
      }
    } catch {
      setCfgMsg('❌ Erro de conexão.')
    } finally {
      setCfgSaving(false)
    }
  }

  async function testMeta() {
    setMetaTesting(true)
    setMetaTestResult(null)
    try {
      const r = await fetch('/api/meta-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' })
      })
      const d = await r.json()
      if (d.ok) {
        setMetaTestResult({ ok: true, msg: `✅ Conectado! Número: ${d.phone || 'N/A'} — ${d.name || ''}` })
      } else {
        setMetaTestResult({ ok: false, msg: `❌ ${d.error || 'Falha na conexão'}` })
      }
    } catch (e: any) {
      setMetaTestResult({ ok: false, msg: `❌ ${e.message}` })
    } finally {
      setMetaTesting(false)
    }
  }

  async function getWebhookInfo() {
    setWebhookInfoResult(null)
    try {
      const r = await fetch('/api/meta-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'webhook-info' })
      })
      const d = await r.json()
      if (d.ok) {
        setWebhookInfoResult({ ok: true, msg: `URL: ${d.webhookUrl}  |  Verify Token: ${d.verifyToken}`, details: d.instructions })
      } else {
        setWebhookInfoResult({ ok: false, msg: `❌ ${d.error}` })
      }
    } catch (e: any) {
      setWebhookInfoResult({ ok: false, msg: `❌ ${e.message}` })
    }
  }

  function copyUrl() {
    if (!webhookStatus?.webhook_url) return
    navigator.clipboard.writeText(webhookStatus.webhook_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Carrega QR Code do gateway ──────────────────────────────
  async function loadQr() {
    setQrLoading(true)
    try {
      const r = await fetch('/api/gateway-qr', { cache: 'no-store' })
      const d = await r.json()
      setQrData(d)
    } catch {
      setQrData({ connected: false, qr: null, error: 'Erro ao buscar QR' })
    } finally {
      setQrLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (tab === 'conversas') loadConversations()
    if (tab === 'prompt') loadPrompt()
    if (tab === 'status') loadStatus()
    if (tab === 'config') { loadConfig(); loadQr() }
  }, [tab])

  // Polling: atualiza QR a cada 5s quando na aba config e não conectado
  useEffect(() => {
    if (tab !== 'config') return
    if (qrData?.connected) return
    const interval = setInterval(() => loadQr(), 5000)
    return () => clearInterval(interval)
  }, [tab, qrData?.connected])

  async function updateStatus(id: string, status: string) {
    await fetch('/api/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    })
    load()
  }

  const stageCounts = leads.reduce((acc, l) => {
    acc[l.spin_stage] = (acc[l.spin_stage] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const tempCounts = convLeads.reduce((acc, l) => { acc[l.temperature] = (acc[l.temperature] || 0) + 1; return acc }, {} as Record<string, number>)

  const TAB_LABELS: Record<TabKey, string> = {
    conversas:    `💬 Conversas (${convLeads.length})`,
    agendamentos: `Agendamentos (${agendamentos.length})`,
    leads:        `Leads (${leads.length})`,
    prompt:       'Prompt do Agente',
    status:       'Status Z-API',
    config:       'Configurações',
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a0f0a' }}>

      {/* Header */}
      <header style={{ borderBottom: '1px solid #1a3a1a' }} className="px-8 py-5 flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', color: '#4ade80', fontSize: 22, fontWeight: 700 }}>
            Nova Luziânia
          </h1>
          <p style={{ color: '#6b7c6b', fontSize: 13, marginTop: 2 }}>Painel SPIN · Agente de Vendas IA</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="pulse-green w-2 h-2 rounded-full bg-green-400" />
          <span style={{ color: '#4ade80', fontSize: 13 }}>Agente online</span>
          <button
            onClick={load}
            style={{ background: '#1a3a1a', color: '#4ade80', border: '1px solid #166534', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}
          >
            Atualizar
          </button>
        </div>
      </header>

      <div className="px-8 py-6">

        {/* Cards de métricas */}
        <div className="grid grid-cols-2 gap-4 mb-8" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {(['S','P','I','N','DONE'] as SpinStage[]).map(stage => (
            <div key={stage} style={{ background: '#111811', border: '1px solid #1a3a1a', borderRadius: 12, padding: '16px 20px' }}>
              <div className={`spin-badge badge-${stage} mb-2`}>{stage}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#e8f0e8', fontFamily: 'var(--font-display)' }}>
                {stageCounts[stage] || 0}
              </div>
              <div style={{ fontSize: 12, color: '#6b7c6b', marginTop: 2 }}>{STAGE_LABELS[stage]}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6" style={{ flexWrap: 'wrap' }}>
          {(['conversas', 'agendamentos', 'leads', 'prompt', 'status', 'config'] as TabKey[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                fontSize: 14,
                cursor: 'pointer',
                border: tab === t ? '1px solid #166534' : '1px solid #1a3a1a',
                background: tab === t ? '#1a3a1a' : 'transparent',
                color: tab === t ? '#4ade80' : '#6b7c6b',
                transition: 'all 0.2s'
              }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* ─── Erro global ─────────────────────────────── */}
        {error && (
          <div style={{ background: '#3a1a1a', border: '1px solid #991b1b', borderRadius: 10, padding: '14px 20px', marginBottom: 16, color: '#f87171', fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ─── Conteúdo por tab ────────────────────────── */}
        {loading && (tab === 'agendamentos' || tab === 'leads') ? (
          <div style={{ color: '#6b7c6b', textAlign: 'center', padding: 60 }}>Carregando...</div>
        ) : tab === 'conversas' ? (

          /* ─── Conversas (Chatwoot-style) ───────────── */
          <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 280px)', minHeight: 500, border: '1px solid #1a3a1a', borderRadius: 12, overflow: 'hidden' }}>

            {/* ── Lista de leads ──────────────────────── */}
            <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid #1a3a1a', display: 'flex', flexDirection: 'column', background: '#0d150d' }}>

              {/* Cabeçalho + filtros */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #1a3a1a' }}>
                <input
                  type="text"
                  placeholder="Buscar lead..."
                  value={convSearch}
                  onChange={e => setConvSearch(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 10, fontSize: 12 }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['todos', 'quente', 'morno', 'frio'] as const).map(f => (
                    <button key={f} onClick={() => setTempFilter(f)} style={{
                      flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                      border: tempFilter === f ? '1px solid #166534' : '1px solid #1a3a1a',
                      background: tempFilter === f ? '#1a3a1a' : 'transparent',
                      color: f === 'todos' ? '#6b7c6b' : TEMP_CONFIG[f as Temperature]?.color || '#6b7c6b',
                    }}>
                      {f === 'todos' ? `Todos (${convLeads.length})` : `${TEMP_CONFIG[f as Temperature].emoji} ${tempCounts[f] || 0}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {convLoading ? (
                  <div style={{ color: '#6b7c6b', textAlign: 'center', padding: 40, fontSize: 13 }}>Carregando...</div>
                ) : convLeads
                    .filter(l => tempFilter === 'todos' || l.temperature === tempFilter)
                    .filter(l => !convSearch || (l.name || l.phone).toLowerCase().includes(convSearch.toLowerCase()))
                    .map(lead => {
                      const tc = TEMP_CONFIG[lead.temperature]
                      const isSelected = selectedPhone === lead.phone
                      const preview = lead.last_media_type && lead.last_media_type !== 'text'
                        ? `[${lead.last_media_type}]`
                        : (lead.last_message || 'Sem mensagens').slice(0, 55)
                      return (
                        <div key={lead.phone} onClick={() => selectLead(lead.phone)}
                          style={{
                            padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #111',
                            background: isSelected ? '#1a3a1a' : 'transparent',
                            transition: 'background 0.15s',
                          }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {/* Avatar */}
                              <div style={{
                                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                background: '#1a3a1a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 14, color: '#4ade80', fontWeight: 700, border: `2px solid ${tc.border}`
                              }}>
                                {(lead.name || lead.phone).charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#4ade80' : '#e8f0e8' }}>
                                  {lead.name || lead.phone}
                                </div>
                                <div style={{ fontSize: 11, color: '#4b5563' }}>{lead.phone}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
                                color: tc.color, background: tc.bg, border: `1px solid ${tc.border}`
                              }}>
                                {tc.emoji} {tc.label}
                              </span>
                              {lead.last_message_at && (
                                <span style={{ fontSize: 10, color: '#4b5563' }}>
                                  {new Date(lead.last_message_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{
                            fontSize: 12, color: lead.last_message_role === 'user' ? '#a3b8a3' : '#6b7c6b',
                            marginLeft: 44, marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {lead.last_message_role === 'assistant' ? '🤖 ' : ''}{preview}
                          </div>
                        </div>
                      )
                    })
                }
              </div>

              {/* Botão atualizar */}
              <div style={{ padding: '10px 16px', borderTop: '1px solid #1a3a1a' }}>
                <button onClick={loadConversations} disabled={convLoading}
                  style={{ ...btnStyle('#1a3a1a', '#4ade80'), width: '100%', padding: '7px 0', fontSize: 12, textAlign: 'center' }}>
                  {convLoading ? 'Atualizando...' : '↻ Atualizar conversas'}
                </button>
              </div>
            </div>

            {/* ── Painel da conversa ──────────────────── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0a0f0a' }}>
              {!selectedPhone ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563', fontSize: 14 }}>
                  ← Selecione uma conversa para visualizar
                </div>
              ) : (() => {
                const lead = convLeads.find(l => l.phone === selectedPhone)
                const tc = lead ? TEMP_CONFIG[lead.temperature] : null
                return (
                  <>
                    {/* Header do lead */}
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #1a3a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: '#e8f0e8' }}>{lead?.name || selectedPhone}</span>
                          {tc && (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, color: tc.color, background: tc.bg, border: `1px solid ${tc.border}` }}>
                              {tc.emoji} {tc.label}
                            </span>
                          )}
                          {lead?.spin_stage && (
                            <span className={`spin-badge badge-${lead.spin_stage}`} style={{ fontSize: 11 }}>
                              {lead.spin_stage}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7c6b', marginTop: 2 }}>
                          📱 {selectedPhone}
                          {lead?.dor_principal && <span style={{ marginLeft: 12, color: '#fbbf24' }}>💬 {lead.dor_principal}</span>}
                        </div>
                      </div>
                      <a href={`https://wa.me/${selectedPhone}`} target="_blank" rel="noopener noreferrer"
                        style={{ ...btnStyle('#1a3a2a', '#4ade80'), padding: '6px 14px', fontSize: 12, textDecoration: 'none' }}>
                        Abrir WhatsApp
                      </a>
                    </div>

                    {/* Mensagens */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {msgLoading ? (
                        <div style={{ textAlign: 'center', color: '#6b7c6b', paddingTop: 40 }}>Carregando mensagens...</div>
                      ) : messages.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#6b7c6b', paddingTop: 40 }}>Nenhuma mensagem registrada.</div>
                      ) : (
                        messages.map(msg => {
                          const isUser = msg.role === 'user'
                          const isAudio = msg.media_type === 'audio'
                          const isImage = msg.media_type === 'image'
                          return (
                            <div key={msg.id} style={{ display: 'flex', justifyContent: isUser ? 'flex-start' : 'flex-end' }}>
                              <div style={{
                                maxWidth: '70%',
                                padding: '10px 14px',
                                borderRadius: isUser ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                                background: isUser ? '#1a2a1a' : '#0f2a1f',
                                border: `1px solid ${isUser ? '#1a3a1a' : '#166534'}`,
                                fontSize: 13,
                                color: '#e8f0e8',
                                lineHeight: 1.5,
                              }}>
                                {isAudio && <div style={{ fontSize: 11, color: '#6b7c6b', marginBottom: 4 }}>🎵 Áudio transcrito</div>}
                                {isImage && <div style={{ fontSize: 11, color: '#6b7c6b', marginBottom: 4 }}>🖼️ Imagem</div>}
                                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
                                <div style={{ fontSize: 10, color: '#4b5563', marginTop: 6, textAlign: 'right' }}>
                                  {isUser ? '👤 Lead' : '🤖 Isa'} · {msg.created_at ? new Date(msg.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>

        ) : tab === 'agendamentos' ? (

          /* ─── Agendamentos ─────────────────────────── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {agendamentos.length === 0 && (
              <div style={{ color: '#6b7c6b', textAlign: 'center', padding: 60 }}>
                Nenhum agendamento ainda. O agente ainda está convertendo leads! 🌱
              </div>
            )}
            {agendamentos.map(ag => (
              <div key={ag.id} className="fade-in" style={{
                background: '#111811',
                border: '1px solid #1a3a1a',
                borderRadius: 12,
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: 20
              }}>
                <div style={{ textAlign: 'center', minWidth: 64 }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: '#4ade80', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
                    {ag.data_visita.split('-')[2]}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7c6b', marginTop: 2 }}>
                    {new Date(ag.data_visita + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase()}
                  </div>
                  <div style={{ fontSize: 13, color: '#a3b8a3', fontWeight: 600, marginTop: 4 }}>
                    {ag.hora_visita.slice(0, 5)}
                  </div>
                </div>
                <div style={{ width: 1, height: 60, background: '#1a3a1a' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#e8f0e8' }}>
                    {ag.lead_name || 'Lead sem nome'}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7c6b', marginTop: 2 }}>
                    📱 {ag.lead_phone}
                  </div>
                  {ag.dor_principal && (
                    <div style={{ fontSize: 13, color: '#fbbf24', marginTop: 6, background: '#3a2e1a', borderRadius: 6, padding: '4px 10px', display: 'inline-block' }}>
                      💬 {ag.dor_principal}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <span className={`spin-badge ${STATUS_COLORS[ag.status]}`} style={{ border: '1px solid', borderRadius: 999, padding: '2px 12px', fontSize: 11 }}>
                    {ag.status}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <a href={`https://wa.me/${ag.lead_phone}`} target="_blank" rel="noopener noreferrer" style={btnStyle('#1a3a2a', '#4ade80')}>
                      WhatsApp
                    </a>
                    {ag.status === 'pendente' && (
                      <>
                        <button onClick={() => updateStatus(ag.id, 'confirmado')} style={btnStyle('#1a3a1a', '#4ade80')}>Confirmar</button>
                        <button onClick={() => updateStatus(ag.id, 'cancelado')} style={btnStyle('#3a1a1a', '#f87171')}>Cancelar</button>
                      </>
                    )}
                    {ag.status === 'confirmado' && (
                      <button onClick={() => updateStatus(ag.id, 'realizado')} style={btnStyle('#1a2a3a', '#60a5fa')}>Realizado</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

        ) : tab === 'leads' ? (

          /* ─── Leads ─────────────────────────────────── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leads.length === 0 && (
              <div style={{ color: '#6b7c6b', textAlign: 'center', padding: 60 }}>Nenhum lead ainda.</div>
            )}
            {leads.map(lead => (
              <div key={lead.id} className="fade-in" style={{
                background: '#111811',
                border: '1px solid #1a3a1a',
                borderRadius: 10,
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 16
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#e8f0e8' }}>{lead.name || 'Sem nome'}</div>
                  <div style={{ fontSize: 13, color: '#6b7c6b' }}>📱 {lead.phone}</div>
                  {lead.dor_principal && (
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Dor: {lead.dor_principal}</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div className={`spin-badge badge-${lead.spin_stage}`}>{STAGE_LABELS[lead.spin_stage]}</div>
                  <div style={{ fontSize: 11, color: '#4b5563' }}>{formatDateTime(lead.updated_at)}</div>
                  <a href={`https://wa.me/${lead.phone}`} target="_blank" rel="noopener noreferrer"
                    style={{ ...btnStyle('#1a3a2a', '#4ade80'), textDecoration: 'none', fontSize: 11 }}>
                    WhatsApp
                  </a>
                </div>
              </div>
            ))}
          </div>

        ) : tab === 'prompt' ? (

          /* ─── Prompt do Agente ───────────────────────── */
          <div style={{ maxWidth: 800 }}>
            <div style={{ background: '#1a2e1a', border: '1px solid #166534', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#4ade80', fontWeight: 600, marginBottom: 4 }}>✅ Prompt padrão já está ativo (prompt.xml)</div>
              <div style={{ fontSize: 12, color: '#6b7c6b' }}>
                O arquivo <code style={{ color: '#86efac' }}>prompt.xml</code> já contém toda a técnica SPIN, perfis de cliente, produto Residencial Nova Luziânia e objeções. A agente <strong style={{ color: '#a3b8a3' }}>Isa Santos</strong> já está configurada e funcionando. Use este campo apenas se quiser <strong style={{ color: '#a3b8a3' }}>substituir completamente</strong> o comportamento padrão.
              </div>
            </div>
            <p style={{ color: '#6b7c6b', fontSize: 13, marginBottom: 16 }}>
              Prompt customizado (deixe em branco para usar o padrão <code style={{ color: '#4ade80' }}>prompt.xml</code>):
            </p>
            {promptLoading ? (
              <div style={{ color: '#6b7c6b', padding: 20 }}>Carregando prompt...</div>
            ) : (
              <>
                <textarea
                  value={promptText}
                  onChange={e => setPromptText(e.target.value)}
                  placeholder="Cole aqui o prompt personalizado, ou deixe em branco para usar o padrão..."
                  style={{
                    width: '100%', minHeight: 360,
                    background: '#111811', border: '1px solid #1a3a1a', borderRadius: 10,
                    padding: 16, color: '#e8f0e8', fontSize: 13, fontFamily: 'monospace',
                    resize: 'vertical', outline: 'none', lineHeight: 1.6
                  }}
                />
                <div style={{ fontSize: 12, color: '#4b5563', marginTop: 6, marginBottom: 16 }}>
                  {promptText.length.toLocaleString('pt-BR')} caracteres
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button onClick={savePrompt} disabled={promptSaving}
                    style={{ ...btnStyle('#1a3a1a', '#4ade80'), padding: '8px 20px', fontSize: 14, opacity: promptSaving ? 0.6 : 1 }}>
                    {promptSaving ? 'Salvando...' : 'Salvar Prompt'}
                  </button>
                  <button onClick={resetPrompt} style={{ ...btnStyle('#3a1a1a', '#f87171'), padding: '8px 20px', fontSize: 14 }}>
                    Restaurar Padrão
                  </button>
                  {promptMsg && (
                    <span style={{ fontSize: 13, color: promptMsg.startsWith('✅') ? '#4ade80' : '#f87171' }}>{promptMsg}</span>
                  )}
                </div>
              </>
            )}
          </div>

        ) : tab === 'status' ? (

          /* ─── Status do Webhook ──────────────────────── */
          <div style={{ maxWidth: 700 }}>
            <div style={{ background: '#111811', border: '1px solid #1a3a1a', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#6b7c6b', marginBottom: 6 }}>URL do Webhook (configure no Meta for Developers)</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <code style={{ flex: 1, color: '#4ade80', fontSize: 13, wordBreak: 'break-all' }}>
                  {webhookStatus?.webhook_url || 'Carregando...'}
                </code>
                <button onClick={copyUrl}
                  style={{ ...btnStyle('#1a3a1a', '#4ade80'), whiteSpace: 'nowrap', padding: '6px 14px', fontSize: 12 }}>
                  {copied ? '✅ Copiado' : 'Copiar URL'}
                </button>
              </div>
            </div>
            <button onClick={loadStatus} disabled={statusLoading}
              style={{ ...btnStyle('#1a3a1a', '#4ade80'), padding: '8px 20px', fontSize: 14, marginBottom: 20, opacity: statusLoading ? 0.6 : 1 }}>
              {statusLoading ? 'Verificando...' : '🔍 Verificar Conexão'}
            </button>
            {webhookStatus && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <StatusItem ok={webhookStatus.meta_connected} label="Meta Cloud API — WhatsApp Business"
                  detail={webhookStatus.meta_phone ? `Número: ${webhookStatus.meta_phone}${webhookStatus.meta_name ? ` (${webhookStatus.meta_name})` : ''}` : webhookStatus.meta_error || 'Não conectado'} />
                <StatusItem ok={!!webhookStatus.meta_phone_number_id && webhookStatus.meta_phone_number_id !== 'não configurado'}
                  label="WHATSAPP_PHONE_NUMBER_ID configurado" detail={webhookStatus.meta_phone_number_id} />
                <StatusItem ok={webhookStatus.messages_24h !== null} label="Supabase acessível"
                  detail={webhookStatus.messages_24h !== null ? `${webhookStatus.messages_24h} mensagens nas últimas 24h` : 'Erro de conexão'} />
                <StatusItem ok={webhookStatus.leads_today !== null} label="Leads ativos hoje"
                  detail={webhookStatus.leads_today !== null ? `${webhookStatus.leads_today} leads` : '—'} />
                {webhookStatus.last_message && (
                  <StatusItem ok={true} label="Última mensagem recebida"
                    detail={`${formatDateTime(webhookStatus.last_message)} — ${webhookStatus.last_message_phone || ''}`} />
                )}
              </div>
            )}
          </div>

        ) : (

          /* ─── Configurações ──────────────────────────── */
          <div style={{ maxWidth: 700 }}>
            {cfgLoading ? (
              <div style={{ color: '#6b7c6b', padding: 20 }}>Carregando configurações...</div>
            ) : (
              <>
                {/* ── Seção QR Code WhatsApp ──────────── */}
                <Section title="WhatsApp — Conectar via QR Code">

                  {/* Status de conexão */}
                  {qrData?.connected ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: '#0f2a1a', border: '1px solid #166534', borderRadius: 12, marginBottom: 16 }}>
                      <div style={{ width: 14, height: 14, background: '#4ade80', borderRadius: '50%', flexShrink: 0, boxShadow: '0 0 8px #4ade80' }} />
                      <div>
                        <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 15 }}>✅ WhatsApp Conectado!</div>
                        <div style={{ color: '#86efac', fontSize: 13, marginTop: 2 }}>📱 {qrData.phone || 'Número conectado'}</div>
                        <div style={{ color: '#6b7c6b', fontSize: 11, marginTop: 4 }}>A Isa Santos está online e respondendo automaticamente.</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#2a1a0f', border: '1px solid #7c3d00', borderRadius: 10, marginBottom: 16 }}>
                      <div style={{ width: 12, height: 12, background: '#fb923c', borderRadius: '50%', flexShrink: 0 }} />
                      <div style={{ color: '#fb923c', fontSize: 13 }}>
                        {qrData?.error ? `⚠️ ${qrData.error}` : '⏳ Aguardando conexão...'}
                      </div>
                    </div>
                  )}

                  {/* QR Code ou instruções */}
                  {!qrData?.connected && (
                    <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>

                      {/* QR Image */}
                      <div style={{ flexShrink: 0 }}>
                        {qrData?.qr ? (
                          <div style={{ background: '#fff', padding: 12, borderRadius: 12, display: 'inline-block' }}>
                            <img src={qrData.qr} alt="QR Code WhatsApp" style={{ width: 200, height: 200, display: 'block' }} />
                          </div>
                        ) : (
                          <div style={{ width: 224, height: 224, background: '#111', border: '2px dashed #333', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                            {qrLoading ? (
                              <>
                                <div style={{ width: 32, height: 32, border: '3px solid #333', borderTop: '3px solid #4ade80', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                <div style={{ color: '#4b5563', fontSize: 12 }}>Aguardando gateway...</div>
                              </>
                            ) : (
                              <>
                                <div style={{ fontSize: 32 }}>📱</div>
                                <div style={{ color: '#4b5563', fontSize: 12, textAlign: 'center', padding: '0 16px' }}>Inicie o gateway para o QR aparecer aqui</div>
                              </>
                            )}
                          </div>
                        )}
                        <button onClick={loadQr} disabled={qrLoading} style={{ ...btnStyle('#1a2a1a', '#4ade80'), width: '100%', marginTop: 8, padding: '7px 0', fontSize: 12, opacity: qrLoading ? 0.5 : 1 }}>
                          {qrLoading ? 'Atualizando...' : '🔄 Atualizar QR'}
                        </button>
                      </div>

                      {/* Instruções */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.8 }}>
                          <div style={{ color: '#4ade80', fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Como conectar:</div>
                          <div><span style={{ color: '#4ade80' }}>1.</span> No terminal, execute:</div>
                          <div style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: 6, padding: '6px 10px', margin: '6px 0 10px', fontFamily: 'monospace', fontSize: 12, color: '#86efac' }}>
                            cd whatsapp-gateway<br/>
                            npm install<br/>
                            npm start
                          </div>
                          <div><span style={{ color: '#4ade80' }}>2.</span> O QR Code aparece aqui automaticamente.</div>
                          <div style={{ margin: '6px 0' }}><span style={{ color: '#4ade80' }}>3.</span> Abra o WhatsApp no celular.</div>
                          <div style={{ margin: '6px 0' }}><span style={{ color: '#4ade80' }}>4.</span> Vá em <strong style={{ color: '#fff' }}>Dispositivos vinculados → Vincular dispositivo</strong>.</div>
                          <div><span style={{ color: '#4ade80' }}>5.</span> Aponte a câmera para o QR Code acima.</div>
                          <div style={{ marginTop: 10, color: '#6b7c6b', fontSize: 11 }}>
                            ⚡ O QR atualiza automaticamente a cada 5 segundos.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quando conectado: botão desconectar / reiniciar */}
                  {qrData?.connected && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button onClick={loadQr} style={{ ...btnStyle('#1a2a1a', '#4ade80'), padding: '8px 18px', fontSize: 13 }}>
                        🔄 Verificar Status
                      </button>
                    </div>
                  )}

                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </Section>

                {/* ── Seção Modelo de IA ──────────────── */}
                <Section title="Modelo de IA">
                  <FieldRow label="Modelo ativo">
                    <select
                      value={cfgForm.ai_model}
                      onChange={e => setCfgForm(p => ({ ...p, ai_model: e.target.value }))}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      {AI_MODELS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </FieldRow>
                  <p style={{ fontSize: 12, color: '#4b5563', marginTop: 8 }}>
                    Modelos Groq usam GROQ_API_KEY. Modelos GPT usam OPENAI_API_KEY.
                  </p>
                </Section>

                {/* ── Seção Chaves de API ─────────────── */}
                <Section title="Chaves de API">
                  {!cfgSettings?.supabase_ready && (
                    <div style={{ background: '#2a1a00', border: '1px solid #7c3d00', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#fb923c' }}>
                      ⚠️ <strong>Supabase não configurado no Vercel.</strong> Adicione <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>SUPABASE_SERVICE_ROLE_KEY</code> nas variáveis de ambiente do Vercel para poder salvar configurações pelo painel. As chaves abaixo mostram o status das env vars atuais.
                    </div>
                  )}
                  <FieldRow label="GROQ API Key">
                    <input
                      type="password"
                      value={cfgForm.groq_api_key}
                      onChange={e => setCfgForm(p => ({ ...p, groq_api_key: e.target.value }))}
                      placeholder={cfgSettings?.groq_api_key_info.set ? '••••••••  (já configurada — cole para alterar)' : 'Informe a chave da API Groq'}
                      style={inputStyle}
                    />
                    {cfgSettings && <KeyStatus info={cfgSettings.groq_api_key_info} />}
                  </FieldRow>
                  <FieldRow label="OpenAI API Key">
                    <input
                      type="password"
                      value={cfgForm.openai_api_key}
                      onChange={e => setCfgForm(p => ({ ...p, openai_api_key: e.target.value }))}
                      placeholder={cfgSettings?.openai_api_key_info.set ? '••••••••  (já configurada — cole para alterar)' : 'Informe a chave da API OpenAI'}
                      style={inputStyle}
                    />
                    {cfgSettings && <KeyStatus info={cfgSettings.openai_api_key_info} />}
                  </FieldRow>
                  <p style={{ fontSize: 12, color: '#4b5563', marginTop: 8 }}>
                    Chaves salvas aqui sobrescrevem as variáveis de ambiente do Vercel.
                  </p>
                </Section>

                {/* ── Botão salvar ────────────────────── */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                  <button onClick={saveConfig} disabled={cfgSaving}
                    style={{ ...btnStyle('#1a3a1a', '#4ade80'), padding: '10px 28px', fontSize: 14, opacity: cfgSaving ? 0.6 : 1 }}>
                    {cfgSaving ? 'Salvando...' : 'Salvar Configurações'}
                  </button>
                  {cfgMsg && (
                    <span style={{ fontSize: 13, color: cfgMsg.startsWith('✅') ? '#4ade80' : '#f87171' }}>{cfgMsg}</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Componentes auxiliares ───────────────────────────────────

function KeyStatus({ info }: { info: FieldInfo }) {
  if (!info.set) return (
    <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>❌ Não configurada</div>
  )
  if (info.source === 'env') return (
    <div style={{ fontSize: 11, color: '#60a5fa', marginTop: 4 }}>✅ Configurada via Vercel (env var)</div>
  )
  return (
    <div style={{ fontSize: 11, color: '#4ade80', marginTop: 4 }}>✅ Configurada via painel (Supabase)</div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#111811', border: '1px solid #1a3a1a', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#4ade80', marginBottom: 16, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
      <label style={{ fontSize: 13, color: '#a3b8a3', minWidth: 200, flexShrink: 0, paddingTop: 9 }}>{label}</label>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

function StatusItem({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) {
  return (
    <div style={{
      background: '#111811', border: `1px solid ${ok ? '#1a3a1a' : '#3a1a1a'}`, borderRadius: 10,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12
    }}>
      <span style={{ fontSize: 18 }}>{ok ? '✅' : '❌'}</span>
      <div>
        <div style={{ fontSize: 14, color: '#e8f0e8', fontWeight: 500 }}>{label}</div>
        {detail && <div style={{ fontSize: 12, color: '#6b7c6b', marginTop: 2 }}>{detail}</div>}
      </div>
    </div>
  )
}

function btnStyle(bg: string, color: string) {
  return {
    background: bg,
    color,
    border: `1px solid ${color}33`,
    borderRadius: 6,
    padding: '4px 12px',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    display: 'inline-block'
  } as React.CSSProperties
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0a0f0a',
  border: '1px solid #1a3a1a',
  borderRadius: 8,
  padding: '8px 12px',
  color: '#e8f0e8',
  fontSize: 13,
  outline: 'none',
}
