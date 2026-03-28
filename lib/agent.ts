import Groq from 'groq-sdk'
import OpenAI from 'openai'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Lead, Mensagem } from './supabase'

// Placeholder keys para o build do Vercel; em runtime as env vars reais estão presentes
const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY   || 'placeholder-key' })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'placeholder-key' })

// ─── Carrega o XML do prompt ──────────────────────────────────
function loadPromptXML(): string {
  try {
    const xmlPath = join(process.cwd(), 'lib', 'prompt.xml')
    return readFileSync(xmlPath, 'utf-8')
  } catch {
    return ''
  }
}

// ─── Monta system prompt a partir do XML + estado do lead ─────
function buildSystemPrompt(lead: Lead): string {
  const xml = loadPromptXML()

  const leadContext = `
<!-- ESTADO ATUAL DO LEAD — atualizado a cada mensagem -->
<LeadContext>
  <SpinStage>${lead.spin_stage}</SpinStage>
  <Name>${lead.name || '—'}</Name>
  <Situacao>${lead.situacao || '—'}</Situacao>
  <DorPrincipal>${lead.dor_principal || '—'}</DorPrincipal>
  <Implicacao>${lead.implicacao || '—'}</Implicacao>
  <Interesse>${lead.interesse || '—'}</Interesse>
  <LoteInteresse>${lead.lote_interesse || '—'}</LoteInteresse>
</LeadContext>`

  const instructions = `
Você é o agente definido no XML acima. Siga rigorosamente:
- A estrutura SPIN conforme as <Functions>
- As <Rules> sem exceção
- O <LeadContext> para saber em qual etapa está e o que já foi coletado
- Os <InternalMarkers> para registrar atualizações (ocultos ao lead)
- O <Language> e <CommunicationStyle> em todas as respostas
Responda APENAS como o agente Lucas responderia no WhatsApp — curto, humano, com emojis.`

  return `${xml}\n${leadContext}\n${instructions}`
}

// ─── Tipos ────────────────────────────────────────────────────
interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentResponse {
  text: string
  updates: Record<string, string>
  agendamento?: { data: string; hora: string }
  shouldSendMedia: boolean
}

// ─── Parser — extrai marcadores ocultos da resposta ──────────
function parseResponse(raw: string): AgentResponse {
  const updates: Record<string, string> = {}
  let agendamento: { data: string; hora: string } | undefined
  let shouldSendMedia = false

  // Extrai [UPDATE:campo:valor]
  const updateRegex = /\[UPDATE:(\w+):([^\]]+)\]/g
  let match
  while ((match = updateRegex.exec(raw)) !== null) {
    updates[match[1]] = match[2]
  }

  // Extrai [AGENDAR:DD/MM/AAAA:HH:MM]
  const agendMatch = /\[AGENDAR:(\d{2}\/\d{2}\/\d{4}):(\d{2}:\d{2})\]/.exec(raw)
  if (agendMatch) {
    agendamento = { data: agendMatch[1], hora: agendMatch[2] }
    updates['spin_stage'] = updates['spin_stage'] || 'DONE'
    shouldSendMedia = true
  }

  // Envia mídia do loteamento ao entrar na etapa N
  if (updates['spin_stage'] === 'N') shouldSendMedia = true

  // Remove marcadores do texto final enviado ao lead
  const text = raw
    .replace(/\[UPDATE:[^\]]+\]/g, '')
    .replace(/\[AGENDAR:[^\]]+\]/g, '')
    .trim()

  return { text, updates, agendamento, shouldSendMedia }
}

// ─── Carrega prompt customizado do Supabase (painel) ─────────
async function loadCustomPrompt(): Promise<string | null> {
  try {
    const { supabase } = await import('./supabase')
    const { data } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'agent_prompt')
      .single()
    return data?.value && data.value.trim().length > 20 ? data.value : null
  } catch {
    return null
  }
}

// ─── Análise de imagem (GPT-4o Vision) ───────────────────────
export async function analyzeImage(imageUrl: string, prompt: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: prompt }
        ]
      }]
    })
    return response.choices[0]?.message?.content || ''
  } catch {
    return '[Imagem recebida]'
  }
}

// ─── Modelo de IA dinâmico (config Supabase > padrão) ────────
async function getAiModel(): Promise<string> {
  try {
    const { getConfig } = await import('./supabase')
    const model = await getConfig('settings_ai_model')
    return model || 'llama-3.3-70b-versatile'
  } catch {
    return 'llama-3.3-70b-versatile'
  }
}

// Modelos que rodam via OpenAI (não Groq)
const OPENAI_MODELS = new Set(['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o1'])

// ─── Agente principal ─────────────────────────────────────────
export async function runAgent(
  lead: Lead,
  history: Mensagem[],
  userMessage: string
): Promise<AgentResponse> {

  const aiModel = await getAiModel()

  // Prompt customizado do painel tem prioridade, mas LeadContext é sempre injetado
  const customPrompt = await loadCustomPrompt()
  let systemPrompt: string
  if (customPrompt) {
    // Injeta contexto do lead no prompt customizado para manter rastreamento de etapa
    const xml = loadPromptXML()
    const leadContext = `
<!-- ESTADO ATUAL DO LEAD — atualizado a cada mensagem -->
<LeadContext>
  <SpinStage>${lead.spin_stage}</SpinStage>
  <Name>${lead.name || '—'}</Name>
  <Situacao>${lead.situacao || '—'}</Situacao>
  <DorPrincipal>${lead.dor_principal || '—'}</DorPrincipal>
  <Implicacao>${lead.implicacao || '—'}</Implicacao>
  <Interesse>${lead.interesse || '—'}</Interesse>
  <LoteInteresse>${lead.lote_interesse || '—'}</LoteInteresse>
</LeadContext>`
    systemPrompt = `${xml}\n${leadContext}\n${customPrompt}`
  } else {
    systemPrompt = buildSystemPrompt(lead)
  }

  const messages: AgentMessage[] = history.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }))
  messages.push({ role: 'user', content: userMessage })

  try {
    let raw: string

    if (OPENAI_MODELS.has(aiModel)) {
      // ── Modelo OpenAI ─────────────────────────────────────
      const response = await openai.chat.completions.create({
        model: aiModel,
        max_tokens: 500,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ]
      })
      raw = response.choices[0]?.message?.content || ''
    } else {
      // ── Modelo Groq (padrão) ──────────────────────────────
      const response = await groq.chat.completions.create({
        model: aiModel,
        max_tokens: 500,
        temperature: 0.65,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ]
      })
      raw = response.choices[0]?.message?.content || ''
    }

    return parseResponse(raw)

  } catch (modelError) {
    console.warn(`[Agent] Modelo ${aiModel} falhou, tentando fallback...`, modelError)

    try {
      // ── Fallback: tenta o oposto (Groq <-> OpenAI) ────────
      const isFallbackOpenAI = !OPENAI_MODELS.has(aiModel)
      const response = isFallbackOpenAI
        ? await openai.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 500,
            messages: [{ role: 'system', content: systemPrompt }, ...messages]
          })
        : await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 500,
            temperature: 0.65,
            messages: [{ role: 'system', content: systemPrompt }, ...messages]
          })

      const raw = response.choices[0]?.message?.content || ''
      return parseResponse(raw)

    } catch (fallbackError) {
      console.error('[Agent] Todos os modelos falharam:', fallbackError)
      return {
        text: 'Ei, tive um probleminha aqui 😅 Pode mandar sua mensagem de novo?',
        updates: {},
        shouldSendMedia: false
      }
    }
  }
}
