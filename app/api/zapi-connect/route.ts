import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { supabase } from '@/lib/supabase'

async function getZapiCredentials() {
  const { data } = await supabase
    .from('config')
    .select('key, value')
    .in('key', ['settings_zapi_instance_id', 'settings_zapi_token', 'settings_zapi_client_token'])

  const map: Record<string, string> = {}
  for (const row of (data || [])) map[row.key] = row.value

  return {
    instanceId:  map['settings_zapi_instance_id']  || process.env.ZAPI_INSTANCE_ID  || '',
    token:       map['settings_zapi_token']         || process.env.ZAPI_TOKEN         || '',
    clientToken: map['settings_zapi_client_token']  || process.env.ZAPI_CLIENT_TOKEN  || '',
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json()
    const { instanceId, token, clientToken } = await getZapiCredentials()

    if (!instanceId || !token) {
      return NextResponse.json(
        { ok: false, error: 'Instance ID e Token não configurados. Salve as configurações primeiro.' },
        { status: 400 }
      )
    }

    const base = `https://api.z-api.io/instances/${instanceId}/token/${token}`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (clientToken) headers['Client-Token'] = clientToken

    // ── Testar conexão ────────────────────────────────────────
    if (action === 'test') {
      const url = `${base}/status`
      const { data } = await axios.get(url, { headers, timeout: 8000 })
      const connected = data?.connected === true || data?.status === 'CONNECTED'
      return NextResponse.json({
        ok: true,
        connected,
        phone: data?.phone || data?.connectedPhone || null,
        status: data?.status || 'desconhecido',
        _debug: { instanceId: instanceId.slice(0, 8) + '...', hasToken: !!token, hasClientToken: !!clientToken },
      })
    }

    // ── Registrar webhook no Z-API ────────────────────────────
    if (action === 'register-webhook') {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
      const webhookUrl = `${appUrl}/api/webhook`

      if (!appUrl) {
        return NextResponse.json(
          { ok: false, error: 'NEXT_PUBLIC_APP_URL não configurado nas env vars do Vercel.' },
          { status: 400 }
        )
      }

      // Endpoint correto conforme documentação Z-API
      await axios.put(
        `${base}/update-webhook-received`,
        { value: webhookUrl },
        { headers, timeout: 8000 }
      )

      return NextResponse.json({ ok: true, webhookUrl })
    }

    // ── Desconectar sessão WhatsApp ───────────────────────────
    if (action === 'disconnect') {
      await axios.delete(`${base}/disconnect`, { headers, timeout: 8000 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'Ação inválida' }, { status: 400 })

  } catch (err: any) {
    const zapiData = err?.response?.data
    const zapiMsg = zapiData?.message || zapiData?.error || ''
    let msg = zapiMsg || err.message || 'Erro desconhecido'

    if (zapiMsg.toLowerCase().includes('client-token')) {
      msg = 'Z-API exige Security Token nesta instância. Acesse: Z-API dashboard → sua instância → aba "Segurança" → gere o Security Token e cole no campo "Security Token (opcional)" acima.'
    }

    return NextResponse.json({
      ok: false,
      error: msg,
      _debug: { status: err?.response?.status, body: zapiData }
    }, { status: 500 })
  }
}
