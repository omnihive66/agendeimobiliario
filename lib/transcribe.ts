import Groq from 'groq-sdk'
import axios from 'axios'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

export async function transcribeAudioFromUrl(audioUrl: string): Promise<string> {
  try {
    // Baixa o áudio como buffer
    const response = await axios.get(audioUrl, { responseType: 'arraybuffer' })
    const buffer = Buffer.from(response.data)

    // Cria um File a partir do buffer (necessário para Groq SDK)
    const file = new File([buffer], 'audio.ogg', { type: 'audio/ogg' })

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3',
      language: 'pt',
      response_format: 'text'
    })

    return (transcription as unknown as string).trim()
  } catch (err) {
    console.error('[Groq Whisper] Erro na transcrição:', err)
    return '[Áudio não transcrito]'
  }
}

export async function transcribeAudioFromBuffer(buffer: Buffer, mimeType = 'audio/ogg'): Promise<string> {
  try {
    const file = new File([buffer], 'audio.ogg', { type: mimeType })

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3',
      language: 'pt',
      response_format: 'text'
    })

    return (transcription as unknown as string).trim()
  } catch (err) {
    console.error('[Groq Whisper] Erro na transcrição:', err)
    return '[Áudio não transcrito]'
  }
}
