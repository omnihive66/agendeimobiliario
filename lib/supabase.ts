import { createClient } from '@supabase/supabase-js'

// Lazy singleton — não inicializa no topo do módulo para não quebrar o build
// do Next.js quando as env vars não estão presentes (ex: fase de análise estática)
let _client: ReturnType<typeof createClient> | null = null

function getClient() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios')
    _client = createClient(url, key, { auth: { persistSession: false } })
  }
  return _client
}

// Proxy mantém a mesma API (supabase.from(...)) sem inicializar na importação
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return (getClient() as any)[prop]
  }
})

// ─── Tipos ────────────────────────────────────────────────────
export type SpinStage = 'S' | 'P' | 'I' | 'N' | 'DONE'

export interface Lead {
  id: string
  phone: string
  name?: string
  spin_stage: SpinStage
  situacao?: string
  dor_principal?: string
  implicacao?: string
  interesse?: string
  lote_interesse?: string
  created_at: string
  updated_at: string
}

export interface Mensagem {
  id: string
  lead_phone: string
  role: 'user' | 'assistant'
  content: string
  media_type?: string
  created_at: string
}

export interface Agendamento {
  id: string
  lead_phone: string
  lead_name?: string
  dor_principal?: string
  data_visita: string
  hora_visita: string
  status: 'pendente' | 'confirmado' | 'cancelado' | 'realizado'
  corretor_notif: boolean
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────

export async function getLead(phone: string): Promise<Lead | null> {
  const { data } = await supabase
    .from('leads')
    .select('*')
    .eq('phone', phone)
    .single()
  return data
}

export async function upsertLead(phone: string, updates: Partial<Lead>): Promise<Lead> {
  const { data, error } = await supabase
    .from('leads')
    .upsert({ phone, ...updates }, { onConflict: 'phone' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getHistory(phone: string, limit = 20): Promise<Mensagem[]> {
  const { data } = await supabase
    .from('mensagens')
    .select('*')
    .eq('lead_phone', phone)
    .order('created_at', { ascending: true })
    .limit(limit)
  return data || []
}

export async function saveMessage(
  phone: string,
  role: 'user' | 'assistant',
  content: string,
  media_type = 'text'
) {
  await supabase.from('mensagens').insert({
    lead_phone: phone,
    role,
    content,
    media_type
  })
}

export async function createAgendamento(data: Omit<Agendamento, 'id' | 'corretor_notif' | 'status' | 'created_at'>) {
  const { data: agend, error } = await supabase
    .from('agendamentos')
    .insert({ ...data, status: 'pendente', corretor_notif: false })
    .select()
    .single()
  if (error) throw error
  return agend
}

export async function getAgendamentos(): Promise<Agendamento[]> {
  const { data } = await supabase
    .from('agendamentos')
    .select('*')
    .order('data_visita', { ascending: true })
  return data || []
}

export async function updateAgendamentoStatus(id: string, status: Agendamento['status']) {
  await supabase.from('agendamentos').update({ status }).eq('id', id)
}

export async function markCorretorNotified(id: string) {
  await supabase.from('agendamentos').update({ corretor_notif: true }).eq('id', id)
}
