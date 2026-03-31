import { getConfig } from './supabase'

// ─── URL do gateway (config Supabase > env var > local) ──────────
async function getGatewayUrl(): Promise<string> {
  const dbUrl = await getConfig('settings_gateway_url')
  return (dbUrl || process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '')
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function gatewayPost(path: string, body: object) {
  const base = await getGatewayUrl()
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Enviar texto ─────────────────────────────────────────────────
export async function sendText(phone: string, message: string) {
  try {
    await gatewayPost('/send-text', { phone, message })
  } catch (err: any) {
    console.error('[Baileys] sendText erro:', err.message)
  }
}

// ─── Enviar imagem ────────────────────────────────────────────────
export async function sendImage(phone: string, imageUrl: string, caption?: string) {
  try {
    await gatewayPost('/send-image', { phone, imageUrl, caption })
  } catch (err: any) {
    console.error('[Baileys] sendImage erro:', err.message)
  }
}

// ─── Enviar documento ─────────────────────────────────────────────
export async function sendDocument(phone: string, documentUrl: string, fileName: string) {
  try {
    await gatewayPost('/send-document', { phone, documentUrl, fileName })
  } catch (err: any) {
    console.error('[Baileys] sendDocument erro:', err.message)
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

  // Número do corretor Walquíria — env var tem prioridade, fallback hardcoded
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

// ─── Enviar mapa de disponibilidade (screenshot em tempo real) ────
export async function sendAvailabilityMap(phone: string) {
  try {
    await gatewayPost('/send-availability-map', { phone })
  } catch (err: any) {
    console.error('[Baileys] sendAvailabilityMap erro:', err.message)
  }
}

// ─── Enviar mídia do loteamento ───────────────────────────────────
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

  // Mapa de disponibilidade em tempo real
  await sendText(phone, `E olha esse mapa — disponibilidade atualizada em tempo real! 🗺️👇`)
  await delay(1500)
  await sendAvailabilityMap(phone)
  await delay(2000)

  await sendText(phone,
    `Imagina você morando num lugar assim! 🏡💚\n\nQue tal a gente tomar um café e bater um papo pessoalmente? Sem compromisso nenhum — só pra você conhecer o terreno e sentir a localização de verdade. Qual dia fica melhor pra você? 😊`)
}
