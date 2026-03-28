import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─── Tipos das tabelas (para TypeScript inferir campos das queries) ────────────
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

interface ConfigRow {
  key: string
  value: string
  updated_at: string
}

// ─── Database type — necessário para TypeScript inferir campos das queries ─────
type Database = {
  public: {
    Tables: {
      leads: {
        Row: Lead
        Insert: Omit<Lead, 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Omit<Lead, 'id'>>
      }
      mensagens: {
        Row: Mensagem
        Insert: Omit<Mensagem, 'id' | 'created_at'> & { id?: string }
        Update: Partial<Omit<Mensagem, 'id'>>
      }
      agendamentos: {
        Row: Agendamento
        Insert: Omit<Agendamento, 'id' | 'corretor_notif' | 'created_at'> & { id?: string; corretor_notif?: boolean }
        Update: Partial<Omit<Agendamento, 'id'>>
      }
      config: {
        Row: ConfigRow
        Insert: ConfigRow
        Update: Partial<ConfigRow>
      }
    }
  }
}

// ─── Cliente Supabase ────────────────────────────────────────────────────────
// Usa fallback vazio em build (Vercel não executa rotas na fase de análise);
// em runtime as env vars reais estão sempre presentes.
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key',
  { auth: { persistSession: false } }
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    .insert({ ...data, status: 'pendente' as const, corretor_notif: false })
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
