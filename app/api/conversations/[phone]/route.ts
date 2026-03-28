import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: { phone: string } }
) {
  const { data } = await supabase
    .from('mensagens')
    .select('*')
    .eq('lead_phone', params.phone)
    .order('created_at', { ascending: true })
    .limit(200)

  return NextResponse.json(data || [])
}
