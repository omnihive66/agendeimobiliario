import { NextRequest, NextResponse } from 'next/server'
import {
  getLead, upsertLead, getHistory,
  saveMessage, createAgendamento, markCorretorNotified
} from '@/lib/supabase'
import { runAgent, analyzeImage } from '@/lib/agent'
import { transcribeAudioFromUrl } from '@/lib/transcribe'
import {
  sendText, sendLoteamentoMedia,
  notifyCorretor, getMediaUrl
} from '@/lib/zapi'

// Previne processamento duplicado
const processed = new Set<string>()

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // ─── Ignora mensagens de grupos ──────────────────────────
    if (body?.isGroup || body?.chatId?.includes('@g.us')) {
      return NextResponse.json({ ok: true })
    }

    // ─── Validação básica ────────────────────────────────────
    const messageId = body?.messageId || body?.id
    if (!messageId || processed.has(messageId)) {
      return NextResponse.json({ ok: true })
    }
    processed.add(messageId)
    // Limpa cache após 5 min
    setTimeout(() => processed.delete(messageId), 300_000)

    // Ignora mensagens do próprio bot
    if (body?.fromMe || body?.isBot) {
      return NextResponse.json({ ok: true })
    }

    const phone = body?.phone || body?.chatId?.replace('@s.whatsapp.net', '')
    if (!phone) return NextResponse.json({ ok: true })

    // ─── Identifica tipo de mensagem ─────────────────────────
    let userText = ''
    let mediaType = 'text'

    const msgType = body?.type || 'text'

    if (msgType === 'audio' || msgType === 'ptt') {
      // Áudio: transcreve via Groq Whisper
      mediaType = 'audio'
      const audioUrl = body?.audio?.audioUrl || await getMediaUrl(messageId)
      if (audioUrl) {
        const transcription = await transcribeAudioFromUrl(audioUrl)
        userText = `[Áudio transcrito]: ${transcription}`
      } else {
        userText = '[Áudio recebido - não foi possível transcrever]'
      }
    } else if (msgType === 'image') {
      // Imagem: analisa com GPT-4o Vision
      mediaType = 'image'
      const imageUrl = body?.image?.imageUrl
      if (imageUrl) {
        const description = await analyzeImage(
          imageUrl,
          'Descreva brevemente o que você vê nesta imagem em português, em 1-2 frases.'
        )
        const caption = body?.image?.caption || ''
        userText = caption
          ? `[Imagem enviada - ${description}] Legenda: ${caption}`
          : `[Imagem enviada - ${description}]`
      } else {
        userText = '[Imagem recebida]'
      }
    } else if (msgType === 'document') {
      mediaType = 'document'
      userText = '[Documento enviado pelo lead]'
    } else {
      // Texto simples
      userText = body?.text?.message || body?.text || body?.message || ''
    }

    if (!userText.trim()) return NextResponse.json({ ok: true })

    // ─── Busca ou cria lead ───────────────────────────────────
    let lead = await getLead(phone)
    if (!lead) {
      lead = await upsertLead(phone, { spin_stage: 'S' })
    }

    // ─── Busca histórico ──────────────────────────────────────
    const history = await getHistory(phone, 20)

    // ─── Salva mensagem do usuário ────────────────────────────
    await saveMessage(phone, 'user', userText, mediaType)

    // ─── Roda o agente SPIN ───────────────────────────────────
    const agentResponse = await runAgent(lead, history, userText)

    // ─── Aplica atualizações de dados ─────────────────────────
    if (Object.keys(agentResponse.updates).length > 0) {
      await upsertLead(phone, agentResponse.updates as any)
      // Atualiza lead local para notificação
      Object.assign(lead, agentResponse.updates)
    }

    // ─── Salva resposta do agente ─────────────────────────────
    await saveMessage(phone, 'assistant', agentResponse.text, 'text')

    // ─── Envia resposta ao lead ───────────────────────────────
    await sendText(phone, agentResponse.text)

    // ─── Envia mídia do loteamento ────────────────────────────
    if (agentResponse.shouldSendMedia) {
      await new Promise(r => setTimeout(r, 2000))
      await sendLoteamentoMedia(phone)
    }

    // ─── Processa agendamento ─────────────────────────────────
    if (agentResponse.agendamento) {
      try {
        const { data, hora } = agentResponse.agendamento

        // Converte data DD/MM/AAAA → AAAA-MM-DD
        const [dia, mes, ano] = data.split('/')
        const dataISO = `${ano}-${mes}-${dia}`

        const agend = await createAgendamento({
          lead_phone: phone,
          lead_name: lead.name,
          dor_principal: lead.dor_principal,
          data_visita: dataISO,
          hora_visita: hora
        })

        // Notifica corretor no WhatsApp
        await notifyCorretor({
          leadName: lead.name || 'Lead',
          phone,
          dorPrincipal: lead.dor_principal || 'Não identificada',
          dataVisita: data,
          horaVisita: hora
        })

        await markCorretorNotified(agend.id)
      } catch (agendErr) {
        console.error('[Webhook] Erro ao criar agendamento:', agendErr)
      }
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    // Sempre retorna 200 para evitar retentativas da Z-API
    console.error('[Webhook] Erro:', err)
    return NextResponse.json({ ok: true })
  }
}

// Z-API pode enviar GET para verificar o endpoint
export async function GET() {
  return NextResponse.json({ status: 'SPIN Agent online' })
}
