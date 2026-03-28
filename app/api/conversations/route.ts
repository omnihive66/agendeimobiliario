import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// ─── Classificação de temperatura ─────────────────────────────
function calcTemperature(spinStage: string | null, updatedAt: string | null): 'quente' | 'morno' | 'frio' {
  const hoursSince = updatedAt
    ? (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60)
    : 999

  if (spinStage === 'DONE') return 'quente'
  if (spinStage === 'N' && hoursSince < 48) return 'quente'
  if (spinStage === 'N') return 'morno'
  if (spinStage === 'I' && hoursSince < 72) return 'morno'
  if (spinStage === 'P' && hoursSince < 24) return 'morno'
  if (hoursSince > 72) return 'frio'
  if (spinStage === 'S') return 'frio'
  return 'morno'
}

export async function GET() {
  // 1. Busca todos os leads
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (!leads || leads.length === 0) return NextResponse.json([])

  // 2. Busca última mensagem de cada lead em paralelo
  const phones = leads.map(l => l.phone)

  const lastMsgResults = await Promise.all(
    phones.map(phone =>
      supabase
        .from('mensagens')
        .select('content, role, created_at, media_type')
        .eq('lead_phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .then(({ data }) => ({ phone, msg: data?.[0] || null }))
    )
  )

  const lastMsgMap: Record<string, typeof lastMsgResults[0]['msg']> = {}
  for (const { phone, msg } of lastMsgResults) {
    lastMsgMap[phone] = msg
  }

  // 3. Monta resposta com temperatura
  const result = leads.map(lead => {
    const lastMsg = lastMsgMap[lead.phone]
    return {
      ...lead,
      temperature: calcTemperature(lead.spin_stage, lead.updated_at),
      last_message:      lastMsg?.content   || null,
      last_message_role: lastMsg?.role       || null,
      last_message_at:   lastMsg?.created_at || null,
      last_media_type:   lastMsg?.media_type || null,
    }
  })

  // Ordena por última mensagem (mais recente primeiro)
  result.sort((a, b) => {
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
    return tb - ta
  })

  return NextResponse.json(result)
}
