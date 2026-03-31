import { NextRequest, NextResponse } from 'next/server'
import {
  getLead, upsertLead, getHistory,
  saveMessage, createAgendamento, markCorretorNotified,
  getConfig
} from '@/lib/supabase'
import { runAgent, analyzeImage } from '@/lib/agent'
import { transcribeAudioFromBuffer, transcribeAudioFromUrl } from '@/lib/transcribe'
import {
  sendText as sendTextMeta,
  sendLoteamentoMedia as sendMediaMeta,
  notifyCorretor as notifyMeta,
  downloadMedia
} from '@/lib/meta-whatsapp'
import {
  sendText as sendTextBaileys,
  sendLoteamentoMedia as sendMediaBaileys,
  notifyCorretor as notifyBaileys,
  markAsRead as markAsReadBaileys,
} from '@/lib/baileys-gateway'

// Seleciona canal ativo: 'baileys' | 'meta' (padrão: baileys)
async function getActiveChannel(): Promise<'baileys' | 'meta'> {
  const ch = await getConfig('settings_active_channel')
  return (ch === 'meta') ? 'meta' : 'baileys'
}

async function sendText(phone: string, message: string) {
  const ch = await getActiveChannel()
  return ch === 'meta' ? sendTextMeta(phone, message) : sendTextBaileys(phone, message)
}
async function sendLoteamentoMedia(phone: string) {
  const ch = await getActiveChannel()
  return ch === 'meta' ? sendMediaMeta(phone) : sendMediaBaileys(phone)
}
async function notifyCorretor(params: Parameters<typeof notifyMeta>[0]) {
  const ch = await getActiveChannel()
  return ch === 'meta' ? notifyMeta(params) : notifyBaileys(params)
}

// Previne processamento duplicado
const processed = new Set<string>()

// ─── GET — verificação do webhook pela Meta ────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken =
    (await getConfig('settings_meta_verify_token')) ||
    process.env.WHATSAPP_VERIFY_TOKEN ||
    'spin-agent-verify'

  if (mode === 'subscribe' && token === verifyToken) {
    return new Response(challenge || '', { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

// ─── POST — mensagens recebidas (Baileys gateway ou Meta Cloud API)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // ── Formato Baileys gateway (source: 'baileys') ────────────
    if (body?.source === 'baileys') {
      const { phone, messageId, name: contactName, type: msgType, text, audioBase64, audioMime } = body

      if (!messageId || processed.has(messageId)) return NextResponse.json({ ok: true })
      processed.add(messageId)
      setTimeout(() => processed.delete(messageId), 300_000)

      if (!phone) return NextResponse.json({ ok: true })

      let userText = text || ''
      let mediaType = msgType || 'text'

      if (msgType === 'audio' && audioBase64) {
        const buffer = Buffer.from(audioBase64, 'base64')
        const transcription = await transcribeAudioFromBuffer(buffer, audioMime || 'audio/ogg')
        userText = `[Áudio transcrito]: ${transcription}`
      } else if (msgType === 'image' && !text) {
        userText = '[Imagem recebida]'
      } else if (msgType === 'document') {
        userText = '[Documento enviado pelo lead]'
      }

      if (!userText.trim()) return NextResponse.json({ ok: true })

      // Marcar como lido imediatamente (Z-API style)
      markAsReadBaileys(phone, messageId).catch(() => {})

      return await processMessage({ phone, messageId, contactName, userText, mediaType })
    }

    // ── Formato Meta Cloud API ─────────────────────────────────
    const value = body?.entry?.[0]?.changes?.[0]?.value
    if (!value) return NextResponse.json({ ok: true })
    if (value.statuses?.length) return NextResponse.json({ ok: true })
    if (!value.messages?.length) return NextResponse.json({ ok: true })

    const msg = value.messages[0]
    const phone     = msg.from
    const messageId = msg.id

    if (!messageId || processed.has(messageId)) return NextResponse.json({ ok: true })
    processed.add(messageId)
    setTimeout(() => processed.delete(messageId), 300_000)

    if (!phone) return NextResponse.json({ ok: true })

    const contactName: string | undefined = value.contacts?.[0]?.profile?.name
    let userText = ''
    let mediaType = 'text'
    const msgType: string = msg.type || 'text'

    if (msgType === 'audio' || msgType === 'voice') {
      mediaType = 'audio'
      const mediaId = msg.audio?.id || msg.voice?.id
      if (mediaId) {
        const downloaded = await downloadMedia(mediaId)
        if (downloaded) {
          const transcription = await transcribeAudioFromBuffer(downloaded.buffer, downloaded.mimeType)
          userText = `[Áudio transcrito]: ${transcription}`
        } else {
          userText = '[Áudio recebido — não foi possível transcrever]'
        }
      }
    } else if (msgType === 'image') {
      mediaType = 'image'
      const mediaId = msg.image?.id
      if (mediaId) {
        const downloaded = await downloadMedia(mediaId)
        if (downloaded) {
          const base64 = downloaded.buffer.toString('base64')
          const dataUrl = `data:${downloaded.mimeType};base64,${base64}`
          const description = await analyzeImage(dataUrl, 'Descreva brevemente o que você vê nesta imagem em português, em 1-2 frases.')
          const caption = msg.image?.caption || ''
          userText = caption ? `[Imagem enviada - ${description}] Legenda: ${caption}` : `[Imagem enviada - ${description}]`
        } else {
          userText = '[Imagem recebida]'
        }
      }
    } else if (msgType === 'document') {
      mediaType = 'document'
      userText = '[Documento enviado pelo lead]'
    } else {
      userText = msg.text?.body || msg.interactive?.button_reply?.title || ''
    }

    if (!userText.trim()) return NextResponse.json({ ok: true })

    return await processMessage({ phone, messageId, contactName, userText, mediaType })

  } catch (err) {
    console.error('[Webhook] Erro:', err)
    return NextResponse.json({ ok: true })
  }
}

// ─── Processamento comum de mensagens ────────────────────────────
async function processMessage({ phone, messageId, contactName, userText, mediaType }: {
  phone: string
  messageId: string
  contactName?: string
  userText: string
  mediaType: string
}) {
  try {

    // ─── Busca ou cria lead ──────────────────────────────────────
    let lead = await getLead(phone)
    if (!lead) {
      lead = await upsertLead(phone, { spin_stage: 'S' })
    }

    // Salva nome do contato se ainda não tiver
    if (contactName && !lead.name) {
      await upsertLead(phone, { name: contactName })
      lead = { ...lead, name: contactName }
    }

    // ─── Busca histórico ─────────────────────────────────────────
    const history = await getHistory(phone, 20)

    // ─── Salva mensagem do usuário ───────────────────────────────
    await saveMessage(phone, 'user', userText, mediaType)

    // ─── Roda o agente SPIN ──────────────────────────────────────
    const agentResponse = await runAgent(lead, history, userText)

    // ─── Aplica atualizações de dados ────────────────────────────
    if (Object.keys(agentResponse.updates).length > 0) {
      await upsertLead(phone, agentResponse.updates as any)
      Object.assign(lead, agentResponse.updates)
    }

    // ─── Salva e envia resposta ──────────────────────────────────
    await saveMessage(phone, 'assistant', agentResponse.text, 'text')
    await sendText(phone, agentResponse.text)

    // ─── Envia mídia do loteamento ───────────────────────────────
    if (agentResponse.shouldSendMedia) {
      await new Promise(r => setTimeout(r, 2000))
      await sendLoteamentoMedia(phone)
    }

    // ─── Processa agendamento ────────────────────────────────────
    if (agentResponse.agendamento) {
      try {
        const { data, hora } = agentResponse.agendamento
        const [dia, mes, ano] = data.split('/')
        const dataISO = `${ano}-${mes}-${dia}`

        const agend = await createAgendamento({
          lead_phone: phone,
          lead_name: lead.name,
          dor_principal: lead.dor_principal,
          data_visita: dataISO,
          hora_visita: hora
        })

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
    // Sempre retorna 200 para evitar retentativas da Meta
    console.error('[Webhook] Erro:', err)
    return NextResponse.json({ ok: true })
  }
}
