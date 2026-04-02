import { NextRequest, NextResponse } from 'next/server'
import {
  getLead, upsertLead, getHistory,
  saveMessage, createAgendamento, markCorretorNotified,
  getConfig
} from '@/lib/supabase'
import { runAgent, analyzeImage } from '@/lib/agent'
import { transcribeAudioFromBuffer } from '@/lib/transcribe'
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
import {
  sendText as sendTextEvo,
  sendLoteamentoMedia as sendMediaEvo,
  notifyCorretor as notifyEvo,
  markAsRead as markAsReadEvo,
} from '@/lib/evolution-gateway'

// Seleciona canal ativo: 'evolution' | 'baileys' | 'meta'
async function getActiveChannel(): Promise<'evolution' | 'baileys' | 'meta'> {
  const ch = await getConfig('settings_active_channel').catch(() => null)
  if (ch === 'meta') return 'meta'
  if (ch === 'evolution') return 'evolution'
  return 'baileys'
}

async function sendText(phone: string, message: string) {
  const ch = await getActiveChannel()
  if (ch === 'meta') return sendTextMeta(phone, message)
  if (ch === 'evolution') return sendTextEvo(phone, message)
  return sendTextBaileys(phone, message)
}

async function sendLoteamentoMedia(phone: string) {
  const ch = await getActiveChannel()
  if (ch === 'meta') return sendMediaMeta(phone)
  if (ch === 'evolution') return sendMediaEvo(phone)
  return sendMediaBaileys(phone)
}

async function notifyCorretor(params: Parameters<typeof notifyMeta>[0]) {
  const ch = await getActiveChannel()
  if (ch === 'meta') return notifyMeta(params)
  if (ch === 'evolution') return notifyEvo(params)
  return notifyBaileys(params)
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
    (await getConfig('settings_meta_verify_token').catch(() => null)) ||
    process.env.WHATSAPP_VERIFY_TOKEN ||
    'spin-agent-verify'

  if (mode === 'subscribe' && token === verifyToken) {
    return new Response(challenge || '', { status: 200 })
  }

  // Evolution API — verificação de webhook (retorna 200 sempre)
  return new Response('ok', { status: 200 })
}

// ─── POST — mensagens recebidas ───────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // ── Formato Evolution API ──────────────────────────────────
    if (body?.event === 'messages.upsert' && body?.data) {
      const data = body.data
      if (data?.key?.fromMe) return NextResponse.json({ ok: true })

      const phone     = (data.key?.remoteJid || '').replace('@s.whatsapp.net', '').replace('@g.us', '')
      const messageId = data.key?.id || ''
      const name      = data.pushName || undefined

      // ignora grupos
      if (data.key?.remoteJid?.endsWith('@g.us')) return NextResponse.json({ ok: true })
      if (!phone || !messageId) return NextResponse.json({ ok: true })
      if (processed.has(messageId)) return NextResponse.json({ ok: true })
      processed.add(messageId)
      setTimeout(() => processed.delete(messageId), 300_000)

      const msgType: string = data.messageType || 'conversation'
      let userText = ''
      let mediaType = 'text'

      if (msgType === 'conversation' || msgType === 'extendedTextMessage') {
        userText = data.message?.conversation || data.message?.extendedTextMessage?.text || ''
      } else if (msgType === 'audioMessage' || msgType === 'pttMessage') {
        mediaType = 'audio'
        userText = '[Áudio recebido]'
      } else if (msgType === 'imageMessage') {
        mediaType = 'image'
        userText = data.message?.imageMessage?.caption || '[Imagem recebida]'
      } else if (msgType === 'documentMessage') {
        mediaType = 'document'
        userText = '[Documento enviado pelo lead]'
      } else {
        userText = data.message?.conversation || ''
      }

      if (!userText.trim()) return NextResponse.json({ ok: true })

      // Marcar como lido
      markAsReadEvo(phone, messageId).catch(() => {})

      return await processMessage({ phone, messageId, contactName: name, userText, mediaType })
    }

    // ── Formato Baileys gateway ────────────────────────────────
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

// ─── Processamento comum ──────────────────────────────────────
async function processMessage({ phone, messageId, contactName, userText, mediaType }: {
  phone: string
  messageId: string
  contactName?: string
  userText: string
  mediaType: string
}) {
  try {
    let lead = await getLead(phone)
    if (!lead) lead = await upsertLead(phone, { spin_stage: 'S' })

    if (contactName && !lead.name) {
      await upsertLead(phone, { name: contactName })
      lead = { ...lead, name: contactName }
    }

    const history = await getHistory(phone, 20)
    await saveMessage(phone, 'user', userText, mediaType)
    const agentResponse = await runAgent(lead, history, userText)

    if (Object.keys(agentResponse.updates).length > 0) {
      await upsertLead(phone, agentResponse.updates as any)
      Object.assign(lead, agentResponse.updates)
    }

    await saveMessage(phone, 'assistant', agentResponse.text, 'text')
    await sendText(phone, agentResponse.text)

    if (agentResponse.shouldSendMedia) {
      await new Promise(r => setTimeout(r, 2000))
      await sendLoteamentoMedia(phone)
    }

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
    console.error('[Webhook] Erro:', err)
    return NextResponse.json({ ok: true })
  }
}
