import { NextResponse } from 'next/server'
import axios from 'axios'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const INSTANCE_ID = process.env.ZAPI_INSTANCE_ID || ''
  const TOKEN       = process.env.ZAPI_TOKEN || ''
  const BASE        = `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}`

  const result: Record<string, any> = {
    webhook_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhook`,
    zapi_instance: INSTANCE_ID || 'não configurado',
    timestamp: new Date().toISOString(),
  }

  // 1. Verifica conexão Z-API
  try {
    const { data } = await axios.get(`${BASE}/status`, { timeout: 5000 })
    result.zapi_connected = data?.connected === true || data?.status === 'CONNECTED'
    result.zapi_phone     = data?.phone || data?.connectedPhone || null
    result.zapi_status    = data?.status || 'desconhecido'
  } catch (err: any) {
    result.zapi_connected = false
    result.zapi_status    = 'erro ao conectar'
    result.zapi_error     = err?.response?.data?.message || err.message
  }

  // 2. Conta mensagens recebidas nas últimas 24h
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('mensagens')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'user')
      .gte('created_at', since)

    result.messages_24h = count || 0
  } catch {
    result.messages_24h = null
  }

  // 3. Conta leads ativos hoje
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('updated_at', today.toISOString())

    result.leads_today = count || 0
  } catch {
    result.leads_today = null
  }

  // 4. Última mensagem recebida
  try {
    // .limit(1) em vez de .single() para evitar inferência de 'never' no TS strict
    const { data: rows } = await supabase
      .from('mensagens')
      .select('created_at, lead_phone')
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1)

    const data = rows?.[0] ?? null
    result.last_message = data?.created_at || null
    result.last_message_phone = data?.lead_phone || null
  } catch {
    result.last_message = null
  }

  return NextResponse.json(result)
}
