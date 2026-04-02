import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/supabase'
import { getStatus } from '@/lib/evolution-gateway'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const channel = await getConfig('settings_active_channel').catch(() => null) || 'baileys'

    // ── Evolution API ──────────────────────────────────────────
    if (channel === 'evolution') {
      const status = await getStatus()
      return NextResponse.json(status)
    }

    // ── Baileys gateway ────────────────────────────────────────
    let gatewayUrl = 'http://localhost:3001'
    try {
      const dbUrl = await getConfig('settings_gateway_url')
      gatewayUrl = (dbUrl || process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '').trim()
    } catch {}

    const res = await fetch(`${gatewayUrl}/qr`, {
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ connected: false, qr: null, error: `Gateway HTTP ${res.status}` })
    }

    return NextResponse.json(await res.json())

  } catch (err: any) {
    return NextResponse.json({ connected: false, qr: null, error: err?.message || 'erro desconhecido' })
  }
}
