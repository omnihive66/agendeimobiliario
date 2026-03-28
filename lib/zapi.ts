import axios from 'axios'
import { getConfig } from './supabase'

// ─── Credenciais dinâmicas (config Supabase > env vars) ────────────────────
async function getZapiClient() {
  const [dbInstance, dbToken, dbClientToken] = await Promise.all([
    getConfig('settings_zapi_instance_id'),
    getConfig('settings_zapi_token'),
    getConfig('settings_zapi_client_token'),
  ])

  const instanceId  = dbInstance    || process.env.ZAPI_INSTANCE_ID  || ''
  const token       = dbToken       || process.env.ZAPI_TOKEN         || ''
  const clientToken = dbClientToken || process.env.ZAPI_CLIENT_TOKEN  || ''

  return axios.create({
    baseURL: `https://api.z-api.io/instances/${instanceId}/token/${token}`,
    headers: {
      'Content-Type': 'application/json',
      ...(clientToken ? { 'Client-Token': clientToken } : {})
    },
    timeout: 10_000
  })
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ─── Enviar texto ─────────────────────────────────────────────
export async function sendText(phone: string, message: string) {
  try {
    const zapi = await getZapiClient()
    await zapi.post('/send-text', { phone, message })
  } catch (err: any) {
    console.error('[Z-API] sendText erro:', err?.response?.data || err.message)
  }
}

// ─── Enviar imagem ────────────────────────────────────────────
export async function sendImage(phone: string, imageUrl: string, caption?: string) {
  try {
    const zapi = await getZapiClient()
    await zapi.post('/send-image', { phone, image: imageUrl, caption })
  } catch (err: any) {
    console.error('[Z-API] sendImage erro:', err?.response?.data || err.message)
  }
}

// ─── Enviar documento ─────────────────────────────────────────
export async function sendDocument(phone: string, documentUrl: string, fileName: string) {
  try {
    const zapi = await getZapiClient()
    await zapi.post('/send-document/pdf', { phone, document: documentUrl, fileName })
  } catch (err: any) {
    console.error('[Z-API] sendDocument erro:', err?.response?.data || err.message)
  }
}

// ─── Baixar URL de mídia recebida ─────────────────────────────
export async function getMediaUrl(messageId: string): Promise<string | null> {
  try {
    const zapi = await getZapiClient()
    const { data } = await zapi.get(`/download-media/${messageId}`)
    return data?.mediaUrl || null
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
  const corretorPhone = process.env.CORRETOR_PHONE!

  const perfilLabel: Record<string, string> = {
    investidor:   '📈 Investidor',
    sonhador:     '🏡 Sonhador da Casa Própria',
    conservador:  '🔒 Conservador Seguro',
    impulsivo:    '⚡ Impulsivo da Oportunidade',
  }

  const msg =
`🏡 *Novo Agendamento — Nova Luziânia*

👤 *Lead:* ${leadName || 'Não informado'}
📱 *WhatsApp:* ${phone}
${clientProfile ? `🎯 *Perfil:* ${perfilLabel[clientProfile] || clientProfile}\n` : ''}💬 *Dor principal:* ${dorPrincipal || 'Não identificada'}

📅 *Data:* ${dataVisita}
⏰ *Horário:* ${horaVisita}

_Agendado pelo Agente SPIN IA_ 🤖`

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

  await sendImage(phone,
    `${appUrl}/loteamento/foto-localizacao.jpg`,
    `📍 *Localização* — próximo ao Fórum de Luziânia, 2 min do Fórum, ao lado da BR-040, Prefeitura e Shopping na vizinhança!`
  )
  await delay(2000)

  await sendImage(phone,
    `${appUrl}/loteamento/foto-obra-atual.jpg`,
    `📷 *Foto real — obra em andamento* — terraplanagem concluída, ruas demarcadas e rotatória de entrada já asfaltada. O empreendimento está em processo de estruturação! 🏗️`
  )
  await delay(2000)

  await sendImage(phone,
    `${appUrl}/loteamento/foto-cidade-aerea.jpg`,
    `📷 *Foto real* — vista aérea mostrando o loteamento dentro de Luziânia. Cidade toda ao fundo!`
  )
  await delay(2000)

  await sendText(phone,
    `Agora veja como vai ficar quando o projeto estiver concluído! ✨ Essas são as maquetes 3D do projeto finalizado 👇`
  )
  await delay(1500)

  await sendImage(phone,
    `${appUrl}/loteamento/maquete-aerea-1.jpg`,
    `🎨 *Maquete 3D* — vista aérea do Residencial Nova Luziânia completo, com todas as ruas e lotes`
  )
  await delay(2000)

  await sendImage(phone,
    `${appUrl}/loteamento/maquete-street.jpg`,
    `🎨 *Maquete 3D* — ruas arborizadas, ciclovia, área de lazer e casas construídas. Esse é o projeto finalizado!`
  )
  await delay(2000)

  await sendImage(phone,
    `${appUrl}/loteamento/maquete-lazer-1.jpg`,
    `🎨 *Maquete 3D* — área de lazer completa: quadra esportiva, playground, pergolado e ciclovia`
  )
  await delay(2000)

  await sendImage(phone,
    `${appUrl}/loteamento/maquete-aerea-2.jpg`,
    `🎨 *Maquete 3D* — outra perspectiva aérea do empreendimento finalizado`
  )
  await delay(1500)

  await sendText(phone,
    `Imagina você morando num lugar assim! 🏡💚\n\nVer pessoalmente é completamente diferente — você sente o espaço e a localização. Que tal a gente marcar uma visita?`
  )
}
