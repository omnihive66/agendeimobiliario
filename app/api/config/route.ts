import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET — busca prompt customizado salvo
export async function GET() {
  try {
    // Supabase v2 infere 'never' em queries com coluna específica + strict TS;
    // cast explícito como workaround seguro (runtime sempre correto via Proxy)
    const { data: rows } = await supabase
      .from('config')
      .select('*')
      .eq('key', 'agent_prompt')
      .limit(1) as unknown as { data: Array<{ value: string; updated_at: string }> | null }

    const data = rows?.[0] ?? null
    return NextResponse.json({
      prompt: data?.value || '',
      updated_at: data?.updated_at || null
    })
  } catch {
    return NextResponse.json({ prompt: '', updated_at: null })
  }
}

// POST — salva novo prompt
export async function POST(req: NextRequest) {
  const { prompt } = await req.json()
  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'prompt inválido' }, { status: 400 })
  }

  const { error } = await supabase
    .from('config')
    .upsert(
      { key: 'agent_prompt', value: prompt, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — reseta para prompt padrão
export async function DELETE() {
  await supabase.from('config').delete().eq('key', 'agent_prompt')
  return NextResponse.json({ ok: true })
}
