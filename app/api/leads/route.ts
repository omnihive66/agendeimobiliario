import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(100)

  return NextResponse.json(leads || [])
}
