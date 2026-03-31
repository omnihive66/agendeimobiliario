import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const dbUrl = await getConfig('settings_gateway_url').catch(() => null)
    const gatewayUrl = (dbUrl || process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '')

    const res = await fetch(`${gatewayUrl}/qr`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ connected: false, qr: null, error: 'Gateway offline' }, { status: 200 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ connected: false, qr: null, error: 'Gateway não encontrado — inicie o whatsapp-gateway localmente' }, { status: 200 })
  }
}
