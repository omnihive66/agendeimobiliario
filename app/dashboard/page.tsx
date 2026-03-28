'use client'

import { useEffect, useState } from 'react'

type SpinStage = 'S' | 'P' | 'I' | 'N' | 'DONE'
type TabKey = 'agendamentos' | 'leads' | 'prompt' | 'status' | 'config'

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
  zapi_instance: string
  zapi_connected: boolean
  zapi_phone: string | null
  zapi_status: string
  zapi_error?: string
  messages_24h: number | null
  leads_today: number | null
  last_message: string | null
  last_message_phone: string | null
  timestamp: string
}

interface Settings {
  zapi_instance_id: string
  zapi_token_set: boolean
  zapi_client_token_set: boolean
  groq_api_key_set: boolean
  openai_api_key_set: boolean
  ai_model: string
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
  const [tab, setTab] = useState<TabKey>('agendamentos')
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    zapi_instance_id: '',
    zapi_token: '',
    zapi_client_token: '',
    groq_api_key: '',
    openai_api_key: '',
    ai_model: 'llama-3.3-70b-versatile',
  })
  const [zapiTesting, setZapiTesting] = useState(false)
  const [zapiTestResult, setZapiTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [zapiRegistering, setZapiRegistering] = useState(false)
  const [zapiRegResult, setZapiRegResult] = useState<{ ok: boolean; msg: string } | null>(null)

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
      const d: Settings = await r.json()
      setCfgSettings(d)
      setCfgForm(prev => ({ ...prev, ai_model: d.ai_model, zapi_instance_id: d.zapi_instance_id }))
    } catch {
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
      if (cfgForm.zapi_instance_id) payload.zapi_instance_id = cfgForm.zapi_instance_id
      if (cfgForm.zapi_token)       payload.zapi_token = cfgForm.zapi_token
      if (cfgForm.zapi_client_token) payload.zapi_client_token = cfgForm.zapi_client_token
      if (cfgForm.groq_api_key)     payload.groq_api_key = cfgForm.groq_api_key
      if (cfgForm.openai_api_key)   payload.openai_api_key = cfgForm.openai_api_key

      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const d = await r.json()
      if (r.ok) {
        setCfgMsg('✅ Configurações salvas!')
        // limpa campos sensíveis após salvar
        setCfgForm(prev => ({ ...prev, zapi_token: '', zapi_client_token: '', groq_api_key: '', openai_api_key: '' }))
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

  async function testZapi() {
    setZapiTesting(true)
    setZapiTestResult(null)
    try {
      const r = await fetch('/api/zapi-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' })
      })
      const d = await r.json()
      if (d.ok && d.connected) {
        setZapiTestResult({ ok: true, msg: `✅ Conectado! Número: ${d.phone || 'N/A'} (${d.status})` })
      } else if (d.ok && !d.connected) {
        setZapiTestResult({ ok: false, msg: `⚠️ Z-API respondeu mas WhatsApp não está conectado. Status: ${d.status}` })
      } else {
        setZapiTestResult({ ok: false, msg: `❌ ${d.error || 'Falha na conexão'}` })
      }
    } catch (e: any) {
      setZapiTestResult({ ok: false, msg: `❌ ${e.message}` })
    } finally {
      setZapiTesting(false)
    }
  }

  async function registerWebhook() {
    setZapiRegistering(true)
    setZapiRegResult(null)
    try {
      const r = await fetch('/api/zapi-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register-webhook' })
      })
      const d = await r.json()
      if (d.ok) {
        setZapiRegResult({ ok: true, msg: `✅ Webhook registrado: ${d.webhookUrl}` })
      } else {
        setZapiRegResult({ ok: false, msg: `❌ ${d.error}` })
      }
    } catch (e: any) {
      setZapiRegResult({ ok: false, msg: `❌ ${e.message}` })
    } finally {
      setZapiRegistering(false)
    }
  }

  function copyUrl() {
    if (!webhookStatus?.webhook_url) return
    navigator.clipboard.writeText(webhookStatus.webhook_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (tab === 'prompt') loadPrompt()
    if (tab === 'status') loadStatus()
    if (tab === 'config') loadConfig()
  }, [tab])

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

  const TAB_LABELS: Record<TabKey, string> = {
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
          {(['agendamentos', 'leads', 'prompt', 'status', 'config'] as TabKey[]).map(t => (
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
              <div style={{ fontSize: 12, color: '#6b7c6b', marginBottom: 6 }}>URL do Webhook (configure na Z-API)</div>
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
                <StatusItem ok={webhookStatus.zapi_connected} label="Z-API conectada ao WhatsApp"
                  detail={webhookStatus.zapi_phone ? `Número: ${webhookStatus.zapi_phone}` : webhookStatus.zapi_error || webhookStatus.zapi_status} />
                <StatusItem ok={!!webhookStatus.zapi_instance && webhookStatus.zapi_instance !== 'não configurado'}
                  label="ZAPI_INSTANCE_ID configurado" detail={webhookStatus.zapi_instance} />
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
                {/* ── Seção Z-API ─────────────────────── */}
                <Section title="Z-API — WhatsApp">
                  <FieldRow label="Client ID (Instance ID)">
                    <input
                      type="text"
                      value={cfgForm.zapi_instance_id}
                      onChange={e => setCfgForm(p => ({ ...p, zapi_instance_id: e.target.value }))}
                      placeholder="Ex: 3F0C30F3B41441EDB3496EB5514D2922"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <FieldRow label={`Token ${cfgSettings?.zapi_token_set ? '(salvo ✓)' : '(não configurado)'}`}>
                    <input
                      type="password"
                      value={cfgForm.zapi_token}
                      onChange={e => setCfgForm(p => ({ ...p, zapi_token: e.target.value }))}
                      placeholder="Deixe em branco para manter o atual"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <FieldRow label={`API Key ${cfgSettings?.zapi_client_token_set ? '(salvo ✓)' : '(não configurada)'}`}>
                    <input
                      type="password"
                      value={cfgForm.zapi_client_token}
                      onChange={e => setCfgForm(p => ({ ...p, zapi_client_token: e.target.value }))}
                      placeholder="Deixe em branco para manter a atual"
                      style={inputStyle}
                    />
                  </FieldRow>

                  {/* Botões Z-API */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={testZapi} disabled={zapiTesting}
                      style={{ ...btnStyle('#1a2a3a', '#60a5fa'), padding: '8px 18px', fontSize: 13, opacity: zapiTesting ? 0.6 : 1 }}>
                      {zapiTesting ? 'Testando...' : '🔌 Testar Conexão'}
                    </button>
                    <button onClick={registerWebhook} disabled={zapiRegistering}
                      style={{ ...btnStyle('#1a3a2a', '#4ade80'), padding: '8px 18px', fontSize: 13, opacity: zapiRegistering ? 0.6 : 1 }}>
                      {zapiRegistering ? 'Registrando...' : '📡 Registrar Webhook'}
                    </button>
                  </div>

                  {zapiTestResult && (
                    <div style={{ marginTop: 10, fontSize: 13, color: zapiTestResult.ok ? '#4ade80' : '#f87171', padding: '8px 12px', background: zapiTestResult.ok ? '#0f2a1a' : '#2a0f0f', borderRadius: 8 }}>
                      {zapiTestResult.msg}
                    </div>
                  )}
                  {zapiRegResult && (
                    <div style={{ marginTop: 10, fontSize: 13, color: zapiRegResult.ok ? '#4ade80' : '#f87171', padding: '8px 12px', background: zapiRegResult.ok ? '#0f2a1a' : '#2a0f0f', borderRadius: 8 }}>
                      {zapiRegResult.msg}
                    </div>
                  )}
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
                  <FieldRow label={`GROQ API Key ${cfgSettings?.groq_api_key_set ? '(salva ✓)' : '(não configurada)'}`}>
                    <input
                      type="password"
                      value={cfgForm.groq_api_key}
                      onChange={e => setCfgForm(p => ({ ...p, groq_api_key: e.target.value }))}
                      placeholder="Deixe em branco para manter a atual"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <FieldRow label={`OpenAI API Key ${cfgSettings?.openai_api_key_set ? '(salva ✓)' : '(não configurada)'}`}>
                    <input
                      type="password"
                      value={cfgForm.openai_api_key}
                      onChange={e => setCfgForm(p => ({ ...p, openai_api_key: e.target.value }))}
                      placeholder="Deixe em branco para manter a atual"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <p style={{ fontSize: 12, color: '#4b5563', marginTop: 8 }}>
                    As chaves aqui sobrescrevem as variáveis de ambiente do Vercel para este agente.
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <label style={{ fontSize: 13, color: '#a3b8a3', minWidth: 260, flexShrink: 0 }}>{label}</label>
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
