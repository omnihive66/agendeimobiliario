import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const SETTING_KEYS = [
  'settings_zapi_instance_id',
  'settings_zapi_token',
  'settings_zapi_client_token',
  'settings_groq_api_key',
  'settings_openai_api_key',
  'settings_ai_model',
]

const SENSITIVE = new Set([
  'settings_zapi_token',
  'settings_zapi_client_token',
  'settings_groq_api_key',
  'settings_openai_api_key',
])

// GET — retorna configurações (valores sensíveis retornam apenas isSet)
export async function GET() {
  try {
    const { data } = await supabase
      .from('config')
      .select('key, value')
      .in('key', SETTING_KEYS)

    const map: Record<string, string> = {}
    for (const row of (data || [])) map[row.key] = row.value

    return NextResponse.json({
      zapi_instance_id:       map['settings_zapi_instance_id'] || '',
      zapi_token_set:         !!map['settings_zapi_token'],
      zapi_client_token_set:  !!map['settings_zapi_client_token'],
      groq_api_key_set:       !!map['settings_groq_api_key'],
      openai_api_key_set:     !!map['settings_openai_api_key'],
      ai_model:               map['settings_ai_model'] || 'llama-3.3-70b-versatile',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST — salva configurações (campos vazios são ignorados)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const fieldToKey: Record<string, string> = {
      zapi_instance_id:   'settings_zapi_instance_id',
      zapi_token:         'settings_zapi_token',
      zapi_client_token:  'settings_zapi_client_token',
      groq_api_key:       'settings_groq_api_key',
      openai_api_key:     'settings_openai_api_key',
      ai_model:           'settings_ai_model',
    }

    const upserts: { key: string; value: string; updated_at: string }[] = []

    for (const [field, key] of Object.entries(fieldToKey)) {
      const val = body[field]
      // Para campos sensíveis: só salva se foi fornecido um novo valor
      // Para campos não-sensíveis: salva se não for undefined
      if (val !== undefined && val !== '') {
        upserts.push({ key, value: String(val), updated_at: new Date().toISOString() })
      }
    }

    if (upserts.length > 0) {
      const { error } = await supabase
        .from('config')
        .upsert(upserts, { onConflict: 'key' })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, saved: upserts.map(u => u.key) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE — remove uma chave específica (ex: limpar credencial)
export async function DELETE(req: NextRequest) {
  try {
    const { key } = await req.json()
    if (!key || !SETTING_KEYS.includes(`settings_${key}`)) {
      return NextResponse.json({ error: 'chave inválida' }, { status: 400 })
    }
    await supabase.from('config').delete().eq('key', `settings_${key}`)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
