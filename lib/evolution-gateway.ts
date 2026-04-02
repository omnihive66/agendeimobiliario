import { getConfig } from './supabase'

// ─── Config ───────────────────────────────────────────────────────
async function getBaseUrl(): Promise<string> {
  const dbUrl = await getConfig('settings_evolution_url').catch(() => null)
  return (dbUrl || process.env.EVOLUTION_API_URL || '').replace(/\/$/, '')
}

async function getApiKey(): Promise<string> {
  const dbKey = await getConfig('settings_evolution_apikey').catch(() => null)
  return dbKey || process.env.EVOLUTION_API_KEY || ''
}

function getInstance(): string {
  return process.env.EVOLUTION_INSTANCE || 'isa-santos'
}

async function evoPost(path: string, body: object) {
  const base = await getBaseUrl()
  const key  = await getApiKey()
  if (!base) throw new Error('EVOLUTION_API_URL não configurada')

  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any)?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

async function evoGet(path: string) {
  const base = await getBaseUrl()
  const key  = await getApiKey()
  if (!base) throw new Error('EVOLUTION_API_URL não configurada')

  const res = await fetch(`${base}${path}`, {
    headers: { 'apikey': key },
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any)?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Status / QR ─────────────────────────────────────────────────
export async function getStatus(): Promise<{ connected: boolean; phone: string | null; qr: string | null }> {
  try {
    const instance = getInstance()
    const state = await evoGet(`/instance/connectionState/${instance}`)
    const connected = state?.instance?.state === 'open'
    const phone = connected ? (state?.instance?.profileName || state?.instance?.wuid || 'conectado') : null

    let qr: string | null = null
    if (!connected) {
      try {
        const qrData = await evoGet(`/instance/connect/${instance}`)
        qr = qrData?.base64 || qrData?.qrcode?.base64 || null
        if (qr && !qr.startsWith('data:')) qr = `data:image/png;base64,${qr}`
      } catch {}
    }

    return { connected, phone, qr }
  } catch {
    return { connected: false, phone: null, qr: null }
  }
}

// ─── Enviar texto ─────────────────────────────────────────────────
export async function sendText(phone: string, message: string) {
  try {
    const instance = getInstance()
    await evoPost(`/message/sendText/${instance}`, {
      number: phone.replace(/\D/g, ''),
      text: message,
    })
  } catch (err: any) {
    console.error('[Evolution] sendText erro:', err.message)
  }
}

// ─── Enviar imagem ────────────────────────────────────────────────
export async function sendImage(phone: string, imageUrl: string, caption?: string) {
  try {
    const instance = getInstance()
    await evoPost(`/message/sendMedia/${instance}`, {
      number: phone.replace(/\D/g, ''),
      mediatype: 'image',
      media: imageUrl,
      caption: caption || '',
    })
  } catch (err: any) {
    console.error('[Evolution] sendImage erro:', err.message)
  }
}

// ─── Marcar como lido ─────────────────────────────────────────────
export async function markAsRead(phone: string, messageId: string) {
  try {
    const instance = getInstance()
    await evoPost(`/chat/markMessageAsRead/${instance}`, {
      readMessages: [{ remoteJid: `${phone.replace(/\D/g, '')}@s.whatsapp.net`, id: messageId, fromMe: false }]
    })
  } catch {
    // silencioso
  }
}

// ─── Notificar corretor ───────────────────────────────────────────
export async function notifyCorretor(params: {
  leadName: string
  phone: string
  dorPrincipal: string
  dataVisita: string
  horaVisita: string
  clientProfile?: string
}) {
  const { leadName, phone, dorPrincipal, dataVisita, horaVisita, clientProfile } = params
  const corretorPhone = process.env.CORRETOR_PHONE || '556198483775'

  const perfilLabel: Record<string, string> = {
    investidor:  '📈 Investidor',
    sonhador:    '🏡 Sonhador da Casa Própria',
    conservador: '🔒 Conservador Seguro',
    impulsivo:   '⚡ Impulsivo da Oportunidade',
  }

  const nomeCliente = leadName || 'Cliente'
  const perfilTexto = clientProfile ? `\n🎯 *Perfil:* ${perfilLabel[clientProfile] || clientProfile}` : ''
  const dorTexto = dorPrincipal && dorPrincipal !== 'Não identificada' ? `\n💬 *Interesse:* ${dorPrincipal}` : ''

  const msg =
`📅 *Você tem uma agenda marcada em Luziânia!*

Olá Walquíria! A Isa agendou uma visita ao Residencial Nova Luziânia:

👤 *Cliente:* ${nomeCliente}
📱 *WhatsApp:* +${phone}${perfilTexto}${dorTexto}

📅 *Data:* ${dataVisita}
⏰ *Horário:* ${horaVisita}

Ele(a) estará te esperando no empreendimento. 🏡
_Agendado automaticamente pelo Agente SPIN IA_ 🤖`

  await sendText(corretorPhone, msg)
}

// ─── Enviar mídia do loteamento ───────────────────────────────────
export async function sendLoteamentoMedia(phone: string) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

  await sendText(phone,
    `Vou te mandar algumas imagens do Residencial Nova Luziânia agora! 📸\n\nAs fotos reais mostram como está hoje. As imagens em 3D são as maquetes de como o projeto vai ficar quando concluído — lindo demais! 🌟`
  )
  await delay(1500)

  await sendImage(phone, `${appUrl}/loteamento/foto-localizacao.jpg`,
    `📍 *Localização* — próximo ao Fórum de Luziânia, menos de 1km da BR-040!`)
  await delay(2000)

  await sendImage(phone, `${appUrl}/loteamento/foto-obra-atual.jpg`,
    `📷 *Foto real — obra atual* — terraplanagem concluída, ruas demarcadas 🏗️`)
  await delay(2000)

  await sendImage(phone, `${appUrl}/loteamento/foto-cidade-aerea.jpg`,
    `📷 *Foto real* — vista aérea do loteamento dentro de Luziânia`)
  await delay(2000)

  await sendText(phone, `Veja como vai ficar quando o projeto estiver concluído! ✨ Maquetes 3D 👇`)
  await delay(1500)

  await sendImage(phone, `${appUrl}/loteamento/maquete-aerea-1.jpg`,
    `🎨 *Maquete 3D* — vista aérea do Residencial Nova Luziânia completo`)
  await delay(2000)

  await sendImage(phone, `${appUrl}/loteamento/maquete-street.jpg`,
    `🎨 *Maquete 3D* — ruas arborizadas, ciclovia e casas construídas`)
  await delay(2000)

  await sendImage(phone, `${appUrl}/loteamento/maquete-lazer-1.jpg`,
    `🎨 *Maquete 3D* — quadra esportiva, playground e ciclovia`)
  await delay(2000)

  await sendText(phone, `E olha esse mapa — disponibilidade atualizada em tempo real! 🗺️👇`)
  await delay(1500)
  await delay(2000)

  await sendText(phone,
    `Imagina você morando num lugar assim! 🏡💚\n\nQue tal a gente tomar um café e bater um papo pessoalmente? Sem compromisso nenhum — só pra você conhecer o terreno e sentir a localização de verdade. Qual dia fica melhor pra você? 😊`)
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
