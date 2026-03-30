import { NextRequest, NextResponse } from 'next/server'
import {
  getLead, upsertLead, getHistory,
  saveMessage, createAgendamento, markCorretorNotified,
  getConfig
} from '@/lib/supabase'
import { runAgent, analyzeImage } from '@/lib/agent'
import { transcribeAudioFromBuffer, transcribeAudioFromUrl } from '@/lib/transcribe'
import {
  sendText, sendLoteamentoMedia,
  notifyCorretor, downloadMedia
} from '@/lib/meta-whatsapp'

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

// ─── POST — mensagens recebidas via Meta Cloud API ─────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Meta envolve tudo em entry.changes.value
    const value = body?.entry?.[0]?.changes?.[0]?.value
    if (!value) return NextResponse.json({ ok: true })

    // Ignora notificações de status (delivered, read, failed)
    if (value.statuses?.length) return NextResponse.json({ ok: true })

    // Precisa ter mensagem
    if (!value.messages?.length) return NextResponse.json({ ok: true })

    const msg = value.messages[0]
    const phone     = msg.from       // ex: "5511999999999"
    const messageId = msg.id

    // Dedup
    if (!messageId || processed.has(messageId)) return NextResponse.json({ ok: true })
    processed.add(messageId)
    setTimeout(() => processed.delete(messageId), 300_000)

    if (!phone) return NextResponse.json({ ok: true })

    // Nome do contato (se disponível)
    const contactName: string | undefined = value.contacts?.[0]?.profile?.name

    // ─── Identifica tipo e extrai texto ─────────────────────────
    let userText = ''
    let mediaType = 'text'
    const msgType: string = msg.type || 'text'

    if (msgType === 'audio' || msgType === 'voice') {
      mediaType = 'audio'
      const mediaId: string | undefined = msg.audio?.id || msg.voice?.id
      if (mediaId) {
        const downloaded = await downloadMedia(mediaId)
        if (downloaded) {
          const transcription = await transcribeAudioFromBuffer(
            downloaded.buffer,
            downloaded.mimeType
          )
          userText = `[Áudio transcrito]: ${transcription}`
        } else {
          userText = '[Áudio recebido — não foi possível transcrever]'
        }
      } else {
        userText = '[Áudio recebido — não foi possível transcrever]'
      }
    } else if (msgType === 'image') {
      mediaType = 'image'
      const mediaId: string | undefined = msg.image?.id
      if (mediaId) {
        // Obtém URL autenticada para análise com GPT-4o Vision
        const downloaded = await downloadMedia(mediaId)
        if (downloaded) {
          // Converte para base64 URL para análise
          const base64 = downloaded.buffer.toString('base64')
          const dataUrl = `data:${downloaded.mimeType};base64,${base64}`
          const description = await analyzeImage(
            dataUrl,
            'Descreva brevemente o que você vê nesta imagem em português, em 1-2 frases.'
          )
          const caption = msg.image?.caption || ''
          userText = caption
            ? `[Imagem enviada - ${description}] Legenda: ${caption}`
            : `[Imagem enviada - ${description}]`
        } else {
          userText = '[Imagem recebida]'
        }
      } else {
        userText = '[Imagem recebida]'
      }
    } else if (msgType === 'document') {
      mediaType = 'document'
      userText = '[Documento enviado pelo lead]'
    } else if (msgType === 'text') {
      userText = msg.text?.body || ''
    } else if (msgType === 'interactive') {
      // Botões de resposta e listas
      userText = msg.interactive?.button_reply?.title ||
                 msg.interactive?.list_reply?.title ||
                 '[Interação recebida]'
    } else if (msgType === 'location') {
      const { latitude, longitude } = msg.location || {}
      userText = `[Localização enviada: ${latitude}, ${longitude}]`
    } else {
      userText = `[Mensagem tipo ${msgType}]`
    }

    if (!userText.trim()) return NextResponse.json({ ok: true })

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
