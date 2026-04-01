import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  let gatewayUrl = 'http://localhost:3001'
  let dbUrl: string | null = null
  let supabaseOk = false

  try {
    dbUrl = await Promise.race([
      getConfig('settings_gateway_url'),
      new Promise<null>(r => setTimeout(() => r(null), 4000)),
    ]) as string | null
    if (dbUrl) supabaseOk = true
  } catch {
    dbUrl = null
  }

  const envUrl = process.env.WHATSAPP_GATEWAY_URL || null
  gatewayUrl = (dbUrl || envUrl || 'http://localhost:3001').replace(/\/$/, '').trim()

  try {
    const res = await fetch(`${gatewayUrl}/qr`, {
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({
        connected: false,
        qr: null,
        error: `Gateway HTTP ${res.status}`,
        debug: { gatewayUrl, supabaseOk, envUrl: envUrl ? '✅' : '❌' },
      })
    }

    const data = await res.json()
    return NextResponse.json({ ...data, debug: { gatewayUrl, supabaseOk } })

  } catch (err: any) {
    return NextResponse.json({
      connected: false,
      qr: null,
      error: err?.message || 'fetch failed',
      debug: { gatewayUrl, supabaseOk, envUrl: envUrl ? '✅' : '❌' },
    })
  }
}
