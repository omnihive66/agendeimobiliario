import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, any> = {}

  // Verifica env vars
  results.env = {
    GROQ_API_KEY: process.env.GROQ_API_KEY ? `set (${process.env.GROQ_API_KEY.slice(0, 8)}...)` : 'MISSING',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING',
    ZAPI_INSTANCE_ID: process.env.ZAPI_INSTANCE_ID ? `set (${process.env.ZAPI_INSTANCE_ID.slice(0, 8)}...)` : 'MISSING',
    ZAPI_TOKEN: process.env.ZAPI_TOKEN ? 'set' : 'MISSING',
    ZAPI_CLIENT_TOKEN: process.env.ZAPI_CLIENT_TOKEN ? 'set' : 'MISSING',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'MISSING',
  }

  // Testa Groq via SDK (igual ao agent.ts)
  try {
    const Groq = (await import('groq-sdk')).default
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' })
    const r = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 20,
      temperature: 0.65,
      messages: [
        { role: 'system', content: 'Você é uma assistente.' },
        { role: 'user', content: 'oi' }
      ]
    })
    results.groq = { ok: true, response: r.choices[0]?.message?.content }
  } catch (e: any) {
    results.groq = { ok: false, error: e?.message, name: e?.name, status: e?.status, stack: e?.stack?.slice(0, 300) }
  }

  // Testa Groq com prompt grande (igual ao agent.ts)
  try {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const xml = readFileSync(join(process.cwd(), 'lib', 'prompt.xml'), 'utf-8')
    const Groq = (await import('groq-sdk')).default
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' })
    const r = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 100,
      temperature: 0.65,
      messages: [
        { role: 'system', content: xml + '\n<LeadContext><SpinStage>S</SpinStage></LeadContext>' },
        { role: 'user', content: 'oi' }
      ]
    })
    results.groqWithPrompt = { ok: true, response: r.choices[0]?.message?.content?.slice(0, 100) }
  } catch (e: any) {
    results.groqWithPrompt = { ok: false, error: e?.message, status: e?.status, name: e?.name }
  }

  // Testa Supabase config
  try {
    const { supabase } = await import('@/lib/supabase')
    const { data, error } = await supabase.from('config').select('key').limit(3)
    results.supabase = { ok: !error, rows: data?.length, error: error?.message }
  } catch (e: any) {
    results.supabase = { ok: false, error: e?.message }
  }

  // Testa leitura do prompt.xml
  try {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const xml = readFileSync(join(process.cwd(), 'lib', 'prompt.xml'), 'utf-8')
    results.promptXml = { ok: true, length: xml.length }
  } catch (e: any) {
    results.promptXml = { ok: false, error: e?.message }
  }

  return NextResponse.json(results)
}
