import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@/lib/supabase'

const META_VERSION = 'v21.0'
const META_BASE    = `https://graph.facebook.com/${META_VERSION}`

async function getMetaCredentials() {
  const [dbPhoneId, dbToken] = await Promise.all([
    getConfig('settings_meta_phone_number_id'),
    getConfig('settings_meta_access_token'),
  ])
  return {
    phoneNumberId: dbPhoneId || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken:   dbToken   || process.env.WHATSAPP_ACCESS_TOKEN    || '',
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json()
    const { phoneNumberId, accessToken } = await getMetaCredentials()

    // ── Testar credenciais ────────────────────────────────────
    if (action === 'test') {
      if (!phoneNumberId || !accessToken) {
        return NextResponse.json({
          ok: false,
          error: 'Phone Number ID e Access Token não configurados. Salve as configurações primeiro.'
        }, { status: 400 })
      }

      const res = await fetch(
        `${META_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10_000),
        }
      )
      const data = await res.json()

      if (data.error) {
        return NextResponse.json({
          ok: false,
          error: `Meta API: ${data.error.message} (código ${data.error.code})`
        }, { status: 500 })
      }

      return NextResponse.json({
        ok: true,
        phone: data.display_phone_number,
        name: data.verified_name,
        quality: data.quality_rating,
      })
    }

    // ── Informações do webhook ────────────────────────────────
    if (action === 'webhook-info') {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
      const verifyToken =
        (await getConfig('settings_meta_verify_token')) ||
        process.env.WHATSAPP_VERIFY_TOKEN ||
        'spin-agent-verify'

      return NextResponse.json({
        ok: true,
        webhookUrl: `${appUrl}/api/webhook`,
        verifyToken,
        instructions: [
          '1. Acesse: developers.facebook.com → seu App → WhatsApp → Configuração',
          '2. Em "Webhooks", clique em "Editar"',
          `3. Cole a URL do Webhook: ${appUrl}/api/webhook`,
          `4. Cole o Verify Token: ${verifyToken}`,
          '5. Clique em "Verificar e Salvar"',
          '6. Ative o campo "messages" nas assinaturas',
        ]
      })
    }

    return NextResponse.json({ ok: false, error: 'Ação inválida' }, { status: 400 })

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'Erro desconhecido' }, { status: 500 })
  }
}
