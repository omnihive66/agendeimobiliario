import { NextRequest, NextResponse } from 'next/server'

const SETTING_KEYS = [
  'settings_meta_phone_number_id',
  'settings_meta_access_token',
  'settings_meta_verify_token',
  'settings_groq_api_key',
  'settings_openai_api_key',
  'settings_ai_model',
]

function supabaseReady() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return url && !url.includes('placeholder') && key && !key.includes('placeholder')
}

// GET — retorna estado de todas as configurações
export async function GET() {
  const fromEnv = {
    meta_phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    meta_access_token:    process.env.WHATSAPP_ACCESS_TOKEN    || '',
    meta_verify_token:    process.env.WHATSAPP_VERIFY_TOKEN    || '',
    groq_api_key:         process.env.GROQ_API_KEY             || '',
    openai_api_key:       process.env.OPENAI_API_KEY           || '',
    ai_model:             '',
  }

  const fromDb: Record<string, string> = {}

  if (supabaseReady()) {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data } = await supabase
        .from('config')
        .select('key, value')
        .in('key', SETTING_KEYS)
      for (const row of (data || [])) {
        fromDb[row.key.replace('settings_', '')] = row.value
      }
    } catch {
      // continua com env vars
    }
  }

  function fieldInfo(envVal: string, dbVal?: string) {
    if (dbVal) return { set: true, source: 'config' as const }
    if (envVal) return { set: true, source: 'env' as const }
    return { set: false, source: null }
  }

  return NextResponse.json({
    supabase_ready: supabaseReady(),

    meta_phone_number_id:      fromDb['meta_phone_number_id'] || fromEnv.meta_phone_number_id,
    meta_phone_number_id_info: fieldInfo(fromEnv.meta_phone_number_id, fromDb['meta_phone_number_id']),
    meta_access_token_info:    fieldInfo(fromEnv.meta_access_token,    fromDb['meta_access_token']),
    meta_verify_token:         fromDb['meta_verify_token'] || fromEnv.meta_verify_token || 'spin-agent-verify',
    meta_verify_token_info:    fieldInfo(fromEnv.meta_verify_token,    fromDb['meta_verify_token']),

    groq_api_key_info:         fieldInfo(fromEnv.groq_api_key,     fromDb['groq_api_key']),
    openai_api_key_info:       fieldInfo(fromEnv.openai_api_key,   fromDb['openai_api_key']),

    ai_model: fromDb['ai_model'] || 'llama-3.3-70b-versatile',
  })
}

// POST — salva no Supabase
export async function POST(req: NextRequest) {
  if (!supabaseReady()) {
    return NextResponse.json(
      { error: 'Supabase não configurado. Adicione NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Vercel.' },
      { status: 503 }
    )
  }

  try {
    const body = await req.json()
    const { supabase } = await import('@/lib/supabase')

    const fieldToKey: Record<string, string> = {
      meta_phone_number_id: 'settings_meta_phone_number_id',
      meta_access_token:    'settings_meta_access_token',
      meta_verify_token:    'settings_meta_verify_token',
      groq_api_key:         'settings_groq_api_key',
      openai_api_key:       'settings_openai_api_key',
      ai_model:             'settings_ai_model',
    }

    const upserts: Array<{ key: string; value: string; updated_at: string }> = []
    for (const [field, key] of Object.entries(fieldToKey)) {
      const val = body[field]
      if (val !== undefined && val !== '') {
        upserts.push({ key, value: String(val), updated_at: new Date().toISOString() })
      }
    }

    for (const row of upserts) {
      const { error } = await supabase
        .from('config')
        .upsert({ key: row.key, value: row.value, updated_at: row.updated_at }, { onConflict: 'key' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
