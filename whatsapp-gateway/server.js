import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
} from '@whiskeysockets/baileys'
import express from 'express'
import qrcode from 'qrcode'
import pino from 'pino'
import { existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Config ──────────────────────────────────────────────────────
const PORT         = process.env.PORT || 3001
const VERCEL_URL   = process.env.VERCEL_URL || 'https://spin-agent.vercel.app'
const WEBHOOK_URL  = `${VERCEL_URL}/api/webhook`
const AUTH_FOLDER  = join(__dirname, 'auth_info')

if (!existsSync(AUTH_FOLDER)) mkdirSync(AUTH_FOLDER, { recursive: true })

// ─── Estado global ────────────────────────────────────────────────
let sock = null
let qrCodeData = null       // base64 do QR para o browser
let isConnected = false
let connectedPhone = null

// ─── Logger silencioso ────────────────────────────────────────────
const logger = pino({ level: 'silent' })

// ─── Express server ───────────────────────────────────────────────
const app = express()
app.use(express.json())

// Página do QR Code
app.get('/', (req, res) => {
  if (isConnected) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>WhatsApp Gateway — Agente Isa Santos</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0f1a0f; color: #4ade80; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #111811; border: 1px solid #1a3a1a; border-radius: 16px; padding: 40px 60px; text-align: center; }
          h1 { font-size: 28px; margin-bottom: 8px; }
          p { color: #9ca3af; margin: 4px 0; }
          .phone { font-size: 20px; color: #86efac; margin-top: 16px; font-weight: bold; }
          .dot { width: 12px; height: 12px; background: #4ade80; border-radius: 50%; display: inline-block; margin-right: 8px; animation: pulse 1.5s infinite; }
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        </style>
      </head>
      <body>
        <div class="card">
          <h1><span class="dot"></span>Agente Isa Santos Online</h1>
          <p>WhatsApp conectado com sucesso!</p>
          <div class="phone">📱 ${connectedPhone || 'Número conectado'}</div>
          <p style="margin-top:24px;font-size:13px;color:#6b7c6b">Mensagens sendo encaminhadas para o agente automaticamente.</p>
        </div>
      </body>
      </html>
    `)
  }

  if (!qrCodeData) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Aguardando QR Code...</title>
        <meta http-equiv="refresh" content="2">
        <style>
          body { font-family: Arial, sans-serif; background: #0f0f1a; color: #ccc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .spinner { width: 40px; height: 40px; border: 4px solid #333; border-top: 4px solid #60a5fa; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div style="text-align:center">
          <div class="spinner"></div>
          <p>Gerando QR Code... Aguarde.</p>
        </div>
      </body>
      </html>
    `)
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Escanear QR Code — Agente Isa Santos</title>
      <meta http-equiv="refresh" content="30">
      <style>
        body { font-family: Arial, sans-serif; background: #0f0f1a; color: #e2e8f0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #1a1a2e; border: 1px solid #2d3748; border-radius: 16px; padding: 32px 40px; text-align: center; max-width: 420px; }
        h1 { font-size: 22px; margin-bottom: 4px; color: #60a5fa; }
        p { color: #9ca3af; font-size: 14px; margin: 6px 0; }
        img { border-radius: 12px; margin: 20px 0; border: 3px solid #374151; }
        .steps { text-align: left; margin-top: 16px; }
        .step { display: flex; align-items: flex-start; gap: 10px; margin: 8px 0; font-size: 13px; color: #d1d5db; }
        .num { background: #3b82f6; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; margin-top: 1px; }
        .warn { background: #2a1a00; border: 1px solid #7c3d00; border-radius: 8px; padding: 10px 14px; margin-top: 16px; font-size: 12px; color: #fb923c; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>📱 Conectar WhatsApp</h1>
        <p>Agente Isa Santos — Residencial Nova Luziânia</p>
        <img src="${qrCodeData}" width="260" height="260" alt="QR Code" />
        <div class="steps">
          <div class="step"><div class="num">1</div><span>Abra o WhatsApp no celular</span></div>
          <div class="step"><div class="num">2</div><span>Toque nos 3 pontinhos → <strong>Dispositivos vinculados</strong></span></div>
          <div class="step"><div class="num">3</div><span>Toque em <strong>"Vincular um dispositivo"</strong></span></div>
          <div class="step"><div class="num">4</div><span>Aponte a câmera para o QR Code acima</span></div>
        </div>
        <div class="warn">⏱ O QR atualiza automaticamente a cada 30s. Se expirar, a página recarrega.</div>
      </div>
    </body>
    </html>
  `)
})

// Status da conexão
app.get('/status', (req, res) => {
  res.json({ connected: isConnected, phone: connectedPhone })
})

// QR Code em JSON (usado pelo dashboard do Vercel)
app.get('/qr', (req, res) => {
  res.json({
    connected: isConnected,
    phone: connectedPhone,
    qr: qrCodeData || null   // base64 da imagem PNG do QR
  })
})

// Enviar texto (chamado pelo Vercel)
app.post('/send-text', async (req, res) => {
  const { phone, message } = req.body
  if (!sock || !isConnected) {
    return res.status(503).json({ ok: false, error: 'WhatsApp não conectado' })
  }
  try {
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`
    await sock.sendMessage(jid, { text: message })
    res.json({ ok: true })
  } catch (err) {
    console.error('[Gateway] Erro ao enviar texto:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Enviar imagem (chamado pelo Vercel)
app.post('/send-image', async (req, res) => {
  const { phone, imageUrl, caption } = req.body
  if (!sock || !isConnected) {
    return res.status(503).json({ ok: false, error: 'WhatsApp não conectado' })
  }
  try {
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`
    await sock.sendMessage(jid, { image: { url: imageUrl }, caption: caption || '' })
    res.json({ ok: true })
  } catch (err) {
    console.error('[Gateway] Erro ao enviar imagem:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Enviar mapa de disponibilidade (screenshot em tempo real)
app.post('/send-availability-map', async (req, res) => {
  const { phone } = req.body
  if (!sock || !isConnected) {
    return res.status(503).json({ ok: false, error: 'WhatsApp não conectado' })
  }
  let browser = null
  try {
    const puppeteer = await import('puppeteer')
    browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900 })
    await page.goto(
      'https://inova-vendas.novabairros.com.br/novabairros/mapas-empreendimento/G541154841484458480RE54158416545680L/view',
      { waitUntil: 'networkidle2', timeout: 40_000 }
    )
    // Aguarda o mapa renderizar completamente
    await new Promise(r => setTimeout(r, 4000))
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 88 })
    await browser.close()
    browser = null

    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`
    await sock.sendMessage(jid, {
      image: screenshot,
      caption: '🗺️ *Mapa de disponibilidade — atualizado agora!*\nLotes em verde = disponíveis ✅  |  Vermelho = vendidos ❌'
    })
    res.json({ ok: true })
  } catch (err) {
    if (browser) await browser.close().catch(() => {})
    console.error('[Gateway] Erro ao capturar mapa de disponibilidade:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Iniciar WhatsApp via Baileys ─────────────────────────────────
async function startWhatsApp() {
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER)

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: true,   // também imprime no terminal
    browser: ['Agente Isa Santos', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  })

  // Salva credenciais sempre que atualizam
  sock.ev.on('creds.update', saveCreds)

  // QR code e status de conexão
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('\n📱 QR Code gerado! Acesse: http://localhost:' + PORT)
      console.log('   Escaneie com o WhatsApp → Dispositivos vinculados\n')
      qrCodeData = await qrcode.toDataURL(qr)
    }

    if (connection === 'open') {
      isConnected = true
      qrCodeData = null
      const phone = sock.user?.id?.replace(/:[^@]+/, '') || 'Conectado'
      connectedPhone = phone
      console.log('\n✅ WhatsApp conectado! Número:', phone)
      console.log('   Agente Isa Santos pronto para responder mensagens.\n')
    }

    if (connection === 'close') {
      isConnected = false
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('⚠️  Conexão encerrada. Reconectando:', shouldReconnect)
      if (shouldReconnect) {
        setTimeout(startWhatsApp, 3000)
      } else {
        console.log('❌ Sessão encerrada (logout). Delete a pasta auth_info/ e reinicie.')
        qrCodeData = null
        connectedPhone = null
      }
    }
  })

  // Recebe mensagens e encaminha para o Vercel
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      try {
        // Ignora mensagens do próprio número e broadcasts
        if (msg.key.fromMe) continue
        if (isJidBroadcast(msg.key.remoteJid)) continue
        if (msg.key.remoteJid?.endsWith('@g.us')) continue // ignora grupos

        const phone     = msg.key.remoteJid.replace('@s.whatsapp.net', '')
        const messageId = msg.key.id
        const name      = msg.pushName || undefined

        // Extrai texto
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          ''

        // Determina tipo
        let msgType = 'text'
        if (msg.message?.audioMessage || msg.message?.pttMessage) msgType = 'audio'
        else if (msg.message?.imageMessage) msgType = 'image'
        else if (msg.message?.documentMessage) msgType = 'document'

        console.log(`[Gateway] Mensagem de ${phone} (${name || 'sem nome'}): "${text.slice(0, 60)}"`)

        // Encaminha para o Vercel no formato interno
        const payload = {
          source: 'baileys',
          messageId,
          phone,
          name,
          type: msgType,
          text,
          fromMe: false,
          isGroup: false,
        }

        // Áudio: baixa e manda como base64
        if (msgType === 'audio') {
          try {
            const { downloadMediaMessage } = await import('@whiskeysockets/baileys')
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage })
            payload.audioBase64 = buffer.toString('base64')
            payload.audioMime   = msg.message?.audioMessage?.mimetype || 'audio/ogg'
          } catch {
            // sem áudio, segue com texto vazio
          }
        }

        const resp = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30_000),
        })

        if (!resp.ok) {
          console.error('[Gateway] Vercel respondeu com erro:', resp.status)
        }

      } catch (err) {
        console.error('[Gateway] Erro ao processar mensagem:', err.message)
      }
    }
  })
}

// ─── Inicia servidor e WhatsApp ───────────────────────────────────
app.listen(PORT, () => {
  console.log('─────────────────────────────────────────')
  console.log('  🤖 WhatsApp Gateway — Agente Isa Santos')
  console.log('─────────────────────────────────────────')
  console.log(`  Painel QR Code: http://localhost:${PORT}`)
  console.log(`  Vercel URL:     ${VERCEL_URL}`)
  console.log('─────────────────────────────────────────\n')
})

startWhatsApp()
