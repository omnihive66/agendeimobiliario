import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// ─── Tipos de aplicação ────────────────────────────────────────────────────
export type SpinStage = 'S' | 'P' | 'I' | 'N' | 'DONE'

// Lead — derivado do tipo do banco (com campos obrigatórios para o agente)
export type Lead = {
  id: string
  phone: string
  name?: string | null
  spin_stage?: string | null
  situacao?: string | null
  dor_principal?: string | null
  implicacao?: string | null
  interesse?: string | null
  lote_interesse?: string | null
  client_profile?: string | null
  followup_count?: number | null
  last_objection?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type Mensagem = {
  id: string
  lead_phone: string
  role: string
  content: string
  media_type?: string | null
  created_at?: string | null
}

export type Agendamento = {
  id: string
  lead_phone: string
  lead_name?: string | null
  dor_principal?: string | null
  data_visita: string
  hora_visita: string
  status?: string | null
  corretor_notif?: boolean | null
  created_at?: string | null
}

// ─── Cliente Supabase ────────────────────────────────────────────────────────
// Placeholder URL/key para o build do Vercel (rotas não são executadas na
// fase de análise estática — apenas importadas). Em runtime as env vars reais
// estão sempre presentes.
export const supabase: SupabaseClient<Database> = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key',
  { auth: { persistSession: false } }
)

// ─── Helpers ──────────────────────────────────────────────────────────────

export async function getLead(phone: string): Promise<Lead | null> {
  const { data } = await supabase
    .from('leads')
    .select('*')
    .eq('phone', phone)
    .maybeSingle()
  return data as Lead | null
}

export async function upsertLead(phone: string, updates: Partial<Lead>): Promise<Lead> {
  const { data, error } = await supabase
    .from('leads')
    .upsert({ phone, ...updates }, { onConflict: 'phone' })
    .select()
    .single()
  if (error) throw error
  return data as Lead
}

export async function getHistory(phone: string, limit = 20): Promise<Mensagem[]> {
  const { data } = await supabase
    .from('mensagens')
    .select('*')
    .eq('lead_phone', phone)
    .order('created_at', { ascending: true })
    .limit(limit)
  return (data ?? []) as Mensagem[]
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

export async function createAgendamento(
  input: Pick<Agendamento, 'lead_phone' | 'lead_name' | 'dor_principal' | 'data_visita' | 'hora_visita'>
): Promise<Agendamento> {
  const { data, error } = await supabase
    .from('agendamentos')
    .insert({ ...input, status: 'pendente', corretor_notif: false })
    .select()
    .single()
  if (error) throw error
  return data as Agendamento
}

export async function getAgendamentos(): Promise<Agendamento[]> {
  const { data } = await supabase
    .from('agendamentos')
    .select('*')
    .order('data_visita', { ascending: true })
  return (data ?? []) as Agendamento[]
}

export async function updateAgendamentoStatus(id: string, status: string) {
  await supabase.from('agendamentos').update({ status }).eq('id', id)
}

export async function markCorretorNotified(id: string) {
  await supabase.from('agendamentos').update({ corretor_notif: true }).eq('id', id)
}

// ─── Config helper ─────────────────────────────────────────────────────────
export async function getConfig(key: string): Promise<string | null> {
  try {
    const { data } = await supabase.from('config').select('value').eq('key', key).limit(1)
    return data?.[0]?.value || null
  } catch {
    return null
  }
}

export async function setConfig(key: string, value: string) {
  await supabase
    .from('config')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}
