import { getConfig } from './supabase'

const META_VERSION = 'v21.0'
const META_BASE    = `https://graph.facebook.com/${META_VERSION}`

// ─── Credenciais dinâmicas (Supabase config > env vars) ────────
async function getMetaCredentials() {
  const [dbPhoneId, dbToken] = await Promise.all([
    getConfig('settings_meta_phone_number_id'),
    getConfig('settings_meta_access_token'),
  ])
  return {
    phoneNumberId: dbPhoneId || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken:   dbToken   || process.env.WHATSAPP_ACCESS_TOKEN    || '',
  }
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function metaPost(path: string, body: object) {
  const { accessToken } = await getMetaCredentials()
  const res = await fetch(`${META_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(JSON.stringify(err?.error || err))
  }
  return res.json()
}

// ─── Enviar texto ─────────────────────────────────────────────
export async function sendText(phone: string, message: string) {
  try {
    const { phoneNumberId } = await getMetaCredentials()
    await metaPost(`/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message, preview_url: false },
    })
  } catch (err: any) {
    console.error('[Meta] sendText erro:', err.message)
  }
}

// ─── Enviar imagem ────────────────────────────────────────────
export async function sendImage(phone: string, imageUrl: string, caption?: string) {
  try {
    const { phoneNumberId } = await getMetaCredentials()
    await metaPost(`/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'image',
      image: { link: imageUrl, ...(caption ? { caption } : {}) },
    })
  } catch (err: any) {
    console.error('[Meta] sendImage erro:', err.message)
  }
}

// ─── Enviar documento ─────────────────────────────────────────
export async function sendDocument(phone: string, documentUrl: string, fileName: string) {
  try {
    const { phoneNumberId } = await getMetaCredentials()
    await metaPost(`/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'document',
      document: { link: documentUrl, filename: fileName },
    })
  } catch (err: any) {
    console.error('[Meta] sendDocument erro:', err.message)
  }
}

// ─── Baixar mídia recebida (áudio/imagem) ─────────────────────
// Meta retorna uma URL autenticada; precisamos baixar com o token
export async function downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const { accessToken } = await getMetaCredentials()

    // 1. Obtém URL da mídia
    const infoRes = await fetch(`${META_BASE}/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8_000),
    })
    if (!infoRes.ok) return null
    const info = await infoRes.json()
    const mediaUrl: string = info.url
    const mimeType: string = info.mime_type || 'application/octet-stream'

    // 2. Baixa o conteúdo com o token
    const dataRes = await fetch(mediaUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!dataRes.ok) return null

    const arrayBuffer = await dataRes.arrayBuffer()
    return { buffer: Buffer.from(arrayBuffer), mimeType }
  } catch {
    return null
  }
}

// ─── Notificar corretor ───────────────────────────────────────
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

// ─── Enviar mídia do loteamento ───────────────────────────────
export async function sendLoteamentoMedia(phone: string) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

  await sendText(phone,
    `Vou te mandar algumas imagens do Residencial Nova Luziânia agora! 📸\n\n` +
    `As fotos reais mostram como está hoje. As imagens em 3D são as maquetes de como o projeto vai ficar quando concluído — lindo demais! 🌟`
  )
  await delay(1500)

  await sendImage(phone, `${appUrl}/loteamento/foto-localizacao.jpg`,
    `📍 *Localização* — próximo ao Fórum de Luziânia, menos de 1km da BR-040!`)
  await delay(2000)

  await sendImage(phone, `${appUrl}/loteamento/foto-obra-atual.jpg`,
    `📷 *Foto real — obra em andamento* — terraplanagem concluída, ruas demarcadas, rotatória asfaltada 🏗️`)
  await delay(2000)

  await sendImage(phone, `${appUrl}/loteamento/foto-cidade-aerea.jpg`,
    `📷 *Foto real* — vista aérea do loteamento dentro de Luziânia`)
  await delay(2000)

  await sendText(phone,
    `Agora veja como vai ficar quando o projeto estiver concluído! ✨ Maquetes 3D do projeto finalizado 👇`)
  await delay(1500)

  await sendImage(phone, `${appUrl}/loteamento/maquete-aerea-1.jpg`,
    `🎨 *Maquete 3D* — vista aérea do Residencial Nova Luziânia completo`)
  await delay(2000)

  await sendImage(phone, `${appUrl}/loteamento/maquete-street.jpg`,
    `🎨 *Maquete 3D* — ruas arborizadas, ciclovia, área de lazer e casas construídas`)
  await delay(2000)

  await sendImage(phone, `${appUrl}/loteamento/maquete-lazer-1.jpg`,
    `🎨 *Maquete 3D* — quadra esportiva, playground, pergolado e ciclovia`)
  await delay(2000)

  await sendImage(phone, `${appUrl}/loteamento/maquete-aerea-2.jpg`,
    `🎨 *Maquete 3D* — outra perspectiva aérea do empreendimento finalizado`)
  await delay(1500)

  await sendText(phone,
    `Imagina você morando num lugar assim! 🏡💚\n\nVer pessoalmente é completamente diferente — você sente o espaço e a localização. Que tal a gente marcar uma visita?`)
}
