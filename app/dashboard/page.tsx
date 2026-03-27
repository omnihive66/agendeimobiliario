'use client'

import { useEffect, useState } from 'react'

type SpinStage = 'S' | 'P' | 'I' | 'N' | 'DONE'
type TabKey = 'agendamentos' | 'leads' | 'prompt' | 'status'

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
    } catch (e: any) {
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
      setPromptMsg(r.ok ? '✅ Prompt salvo com sucesso!' : '❌ Erro ao salvar.')
    } catch {
      setPromptMsg('❌ Erro de conexão.')
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
    status:       'Status do Webhook'
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
          {(['agendamentos', 'leads', 'prompt', 'status'] as TabKey[]).map(t => (
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
                {/* Data */}
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

                {/* Divisor */}
                <div style={{ width: 1, height: 60, background: '#1a3a1a' }} />

                {/* Info */}
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

                {/* Status + ações */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <span className={`spin-badge ${STATUS_COLORS[ag.status]}`} style={{ border: '1px solid', borderRadius: 999, padding: '2px 12px', fontSize: 11 }}>
                    {ag.status}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {/* Botão WhatsApp */}
                    <a
                      href={`https://wa.me/${ag.lead_phone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={btnStyle('#1a3a2a', '#4ade80')}
                    >
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
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#e8f0e8' }}>
                    {lead.name || 'Sem nome'}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7c6b' }}>📱 {lead.phone}</div>
                  {lead.dor_principal && (
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                      Dor: {lead.dor_principal}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div className={`spin-badge badge-${lead.spin_stage}`}>
                    {STAGE_LABELS[lead.spin_stage]}
                  </div>
                  <div style={{ fontSize: 11, color: '#4b5563' }}>
                    {formatDateTime(lead.updated_at)}
                  </div>
                  <a
                    href={`https://wa.me/${lead.phone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...btnStyle('#1a3a2a', '#4ade80'), textDecoration: 'none', fontSize: 11 }}
                  >
                    WhatsApp
                  </a>
                </div>
              </div>
            ))}
          </div>

        ) : tab === 'prompt' ? (

          /* ─── Prompt do Agente ───────────────────────── */
          <div style={{ maxWidth: 800 }}>
            <p style={{ color: '#6b7c6b', fontSize: 13, marginBottom: 16 }}>
              Personalize o comportamento do agente Lucas. Deixe em branco para usar o prompt padrão do arquivo <code style={{ color: '#4ade80' }}>prompt.xml</code>.
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
                    width: '100%',
                    minHeight: 360,
                    background: '#111811',
                    border: '1px solid #1a3a1a',
                    borderRadius: 10,
                    padding: 16,
                    color: '#e8f0e8',
                    fontSize: 13,
                    fontFamily: 'monospace',
                    resize: 'vertical',
                    outline: 'none',
                    lineHeight: 1.6
                  }}
                />
                <div style={{ fontSize: 12, color: '#4b5563', marginTop: 6, marginBottom: 16 }}>
                  {promptText.length.toLocaleString('pt-BR')} caracteres
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    onClick={savePrompt}
                    disabled={promptSaving}
                    style={{ ...btnStyle('#1a3a1a', '#4ade80'), padding: '8px 20px', fontSize: 14, opacity: promptSaving ? 0.6 : 1 }}
                  >
                    {promptSaving ? 'Salvando...' : 'Salvar Prompt'}
                  </button>
                  <button
                    onClick={resetPrompt}
                    style={{ ...btnStyle('#3a1a1a', '#f87171'), padding: '8px 20px', fontSize: 14 }}
                  >
                    Restaurar Padrão
                  </button>
                  {promptMsg && (
                    <span style={{ fontSize: 13, color: promptMsg.startsWith('✅') ? '#4ade80' : '#f87171' }}>
                      {promptMsg}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

        ) : (

          /* ─── Status do Webhook ──────────────────────── */
          <div style={{ maxWidth: 700 }}>
            {/* URL do webhook */}
            <div style={{ background: '#111811', border: '1px solid #1a3a1a', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#6b7c6b', marginBottom: 6 }}>URL do Webhook (configure na Z-API)</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <code style={{ flex: 1, color: '#4ade80', fontSize: 13, wordBreak: 'break-all' }}>
                  {webhookStatus?.webhook_url || 'Carregando...'}
                </code>
                <button
                  onClick={copyUrl}
                  style={{ ...btnStyle('#1a3a1a', '#4ade80'), whiteSpace: 'nowrap', padding: '6px 14px', fontSize: 12 }}
                >
                  {copied ? '✅ Copiado' : 'Copiar URL'}
                </button>
              </div>
            </div>

            {/* Botão verificar */}
            <button
              onClick={loadStatus}
              disabled={statusLoading}
              style={{ ...btnStyle('#1a3a1a', '#4ade80'), padding: '8px 20px', fontSize: 14, marginBottom: 20, opacity: statusLoading ? 0.6 : 1 }}
            >
              {statusLoading ? 'Verificando...' : '🔍 Verificar Conexão'}
            </button>

            {/* Checklist de status */}
            {webhookStatus && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <StatusItem
                  ok={webhookStatus.zapi_connected}
                  label="Z-API conectada ao WhatsApp"
                  detail={webhookStatus.zapi_phone ? `Número: ${webhookStatus.zapi_phone}` : webhookStatus.zapi_error || webhookStatus.zapi_status}
                />
                <StatusItem
                  ok={!!webhookStatus.zapi_instance && webhookStatus.zapi_instance !== 'não configurado'}
                  label="ZAPI_INSTANCE_ID configurado"
                  detail={webhookStatus.zapi_instance}
                />
                <StatusItem
                  ok={webhookStatus.messages_24h !== null}
                  label="Supabase acessível"
                  detail={webhookStatus.messages_24h !== null ? `${webhookStatus.messages_24h} mensagens nas últimas 24h` : 'Erro de conexão'}
                />
                <StatusItem
                  ok={webhookStatus.leads_today !== null}
                  label="Leads ativos hoje"
                  detail={webhookStatus.leads_today !== null ? `${webhookStatus.leads_today} leads` : '—'}
                />
                {webhookStatus.last_message && (
                  <StatusItem
                    ok={true}
                    label="Última mensagem recebida"
                    detail={`${formatDateTime(webhookStatus.last_message)} — ${webhookStatus.last_message_phone || ''}`}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusItem({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) {
  return (
    <div style={{
      background: '#111811',
      border: `1px solid ${ok ? '#1a3a1a' : '#3a1a1a'}`,
      borderRadius: 10,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12
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
