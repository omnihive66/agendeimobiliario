import { NextResponse } from 'next/server'
import { supabase, getConfig } from '@/lib/supabase'

const META_VERSION = 'v21.0'
const META_BASE    = `https://graph.facebook.com/${META_VERSION}`

export async function GET() {
  const result: Record<string, any> = {
    webhook_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhook`,
    timestamp: new Date().toISOString(),
  }

  // 1. Verifica credenciais Meta e status do número
  try {
    const [dbPhoneId, dbToken] = await Promise.all([
      getConfig('settings_meta_phone_number_id'),
      getConfig('settings_meta_access_token'),
    ])
    const phoneNumberId = dbPhoneId || process.env.WHATSAPP_PHONE_NUMBER_ID || ''
    const accessToken   = dbToken   || process.env.WHATSAPP_ACCESS_TOKEN    || ''

    result.meta_phone_number_id = phoneNumberId || 'não configurado'

    if (phoneNumberId && accessToken) {
      const res = await fetch(
        `${META_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(8_000),
        }
      )
      const data = await res.json()

      if (data.error) {
        result.meta_connected = false
        result.meta_error     = data.error.message
        result.meta_phone     = null
      } else {
        result.meta_connected = true
        result.meta_phone     = data.display_phone_number || null
        result.meta_name      = data.verified_name || null
        result.meta_quality   = data.quality_rating || null
      }
    } else {
      result.meta_connected = false
      result.meta_error     = 'Credenciais não configuradas'
      result.meta_phone     = null
    }
  } catch (err: any) {
    result.meta_connected = false
    result.meta_error     = err.message || 'Timeout ao conectar'
    result.meta_phone     = null
  }

  // 2. Conta mensagens nas últimas 24h
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('mensagens')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'user')
      .gte('created_at', since)
    result.messages_24h = count ?? 0
  } catch {
    result.messages_24h = null
  }

  // 3. Leads ativos hoje
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('updated_at', today.toISOString())
    result.leads_today = count ?? 0
  } catch {
    result.leads_today = null
  }

  // 4. Última mensagem recebida
  try {
    const { data: rows } = await supabase
      .from('mensagens')
      .select('created_at, lead_phone')
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1)
    result.last_message       = rows?.[0]?.created_at || null
    result.last_message_phone = rows?.[0]?.lead_phone || null
  } catch {
    result.last_message = null
  }

  return NextResponse.json(result)
}
