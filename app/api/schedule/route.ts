import { NextRequest, NextResponse } from 'next/server'
import { getAgendamentos, updateAgendamentoStatus } from '@/lib/supabase'

export async function GET() {
  const agendamentos = await getAgendamentos()
  return NextResponse.json(agendamentos)
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json()
  await updateAgendamentoStatus(id, status)
  return NextResponse.json({ ok: true })
}
