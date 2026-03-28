import { NextRequest, NextResponse } from 'next/server'

const SETTING_KEYS = [
  'settings_zapi_instance_id',
  'settings_zapi_token',
  'settings_zapi_client_token',
  'settings_groq_api_key',
  'settings_openai_api_key',
  'settings_ai_model',
]

function supabaseReady() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return url && !url.includes('placeholder') && key && !key.includes('placeholder')
}

// GET — retorna estado de todas as configurações (env vars + config Supabase)
export async function GET() {
  // ── Valores das env vars ──────────────────────────────────────
  const fromEnv = {
    zapi_instance_id:   process.env.ZAPI_INSTANCE_ID   || '',
    zapi_token:         process.env.ZAPI_TOKEN          || '',
    zapi_client_token:  process.env.ZAPI_CLIENT_TOKEN   || '',
    groq_api_key:       process.env.GROQ_API_KEY        || '',
    openai_api_key:     process.env.OPENAI_API_KEY      || '',
    ai_model:           '',
  }

  // ── Valores do banco (override) ───────────────────────────────
  const fromDb: Record<string, string> = {}

  if (supabaseReady()) {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data } = await supabase
        .from('config')
        .select('key, value')
        .in('key', SETTING_KEYS)
      for (const row of (data || [])) {
        const short = row.key.replace('settings_', '')
        fromDb[short] = row.value
      }
    } catch {
      // Supabase falhou — continua com env vars
    }
  }

  // ── Monta resposta com fonte de cada campo ────────────────────
  function fieldInfo(envVal: string, dbVal?: string) {
    if (dbVal) return { set: true, source: 'config' as const }
    if (envVal) return { set: true, source: 'env' as const }
    return { set: false, source: null }
  }

  return NextResponse.json({
    supabase_ready: supabaseReady(),

    zapi_instance_id:      fromDb['zapi_instance_id']  || fromEnv.zapi_instance_id,
    zapi_instance_source:  fieldInfo(fromEnv.zapi_instance_id, fromDb['zapi_instance_id']),

    zapi_token_info:       fieldInfo(fromEnv.zapi_token, fromDb['zapi_token']),
    zapi_client_token_info:fieldInfo(fromEnv.zapi_client_token, fromDb['zapi_client_token']),
    groq_api_key_info:     fieldInfo(fromEnv.groq_api_key, fromDb['groq_api_key']),
    openai_api_key_info:   fieldInfo(fromEnv.openai_api_key, fromDb['openai_api_key']),

    ai_model: fromDb['ai_model'] || 'llama-3.3-70b-versatile',
  })
}

// POST — salva no Supabase (requer Supabase configurado)
export async function POST(req: NextRequest) {
  if (!supabaseReady()) {
    return NextResponse.json(
      { error: 'Supabase não configurado. Adicione NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente do Vercel.' },
      { status: 503 }
    )
  }

  try {
    const body = await req.json()
    const { supabase } = await import('@/lib/supabase')

    const fieldToKey: Record<string, string> = {
      zapi_instance_id:  'settings_zapi_instance_id',
      zapi_token:        'settings_zapi_token',
      zapi_client_token: 'settings_zapi_client_token',
      groq_api_key:      'settings_groq_api_key',
      openai_api_key:    'settings_openai_api_key',
      ai_model:          'settings_ai_model',
    }

    const upserts: Array<{ key: string; value: string; updated_at: string }> = []

    for (const [field, key] of Object.entries(fieldToKey)) {
      const val = body[field]
      if (val !== undefined && val !== '') {
        upserts.push({ key, value: String(val), updated_at: new Date().toISOString() })
      }
    }

    if (upserts.length > 0) {
      for (const row of upserts) {
        const { error } = await supabase
          .from('config')
          .upsert({ key: row.key, value: row.value, updated_at: row.updated_at }, { onConflict: 'key' })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, saved: upserts.map(u => u.key) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE — remove override de uma chave
export async function DELETE(req: NextRequest) {
  if (!supabaseReady()) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 })
  }
  try {
    const { key } = await req.json()
    if (!key || !SETTING_KEYS.includes(`settings_${key}`)) {
      return NextResponse.json({ error: 'chave inválida' }, { status: 400 })
    }
    const { supabase } = await import('@/lib/supabase')
    await supabase.from('config').delete().eq('key', `settings_${key}`)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
