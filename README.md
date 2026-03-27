# 🏡 SPIN Agent — Nova Luziânia

Agente de vendas com IA para loteamentos, usando metodologia SPIN Selling.  
Integração com WhatsApp via Z-API · Memória em Supabase · Deploy no Vercel.

---

## 🧠 O que ele faz

- Recebe mensagens do WhatsApp (texto, áudio, imagem)
- Transcreve áudios automaticamente (Groq Whisper)
- Analisa imagens enviadas pelo lead (GPT-4o Vision)
- Conduz a conversa seguindo o método SPIN (Situação → Problema → Implicação → Necessidade)
- Agenda visitas ao loteamento
- Notifica o corretor por WhatsApp com nome, dor do lead e horário
- Envia fotos e materiais do loteamento automaticamente
- Painel web para o corretor acompanhar leads e agendamentos

---

## 🗂 Estrutura do Projeto

```
spin-agent/
├── app/
│   ├── api/
│   │   ├── webhook/route.ts     ← Endpoint da Z-API (recebe mensagens)
│   │   ├── leads/route.ts       ← API de leads para o painel
│   │   └── schedule/route.ts    ← API de agendamentos
│   ├── dashboard/page.tsx       ← Painel do corretor
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── lib/
│   ├── agent.ts                 ← Cérebro IA (Claude + GPT-4o fallback)
│   ├── supabase.ts              ← Banco de dados e memória
│   ├── zapi.ts                  ← Envio de mensagens WhatsApp
│   └── transcribe.ts            ← Transcrição de áudio (Groq Whisper)
├── public/
│   └── loteamento/              ← Coloque aqui as fotos e PDF do loteamento
│       ├── foto1.jpg
│       ├── foto2.jpg
│       └── planta.pdf
├── supabase-schema.sql          ← Execute no Supabase antes de tudo
├── .env.example                 ← Copie para .env.local e preencha
└── package.json
```

---

## 🚀 Deploy Passo a Passo

### 1. Supabase — Banco de dados

1. Crie uma conta em [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. No menu lateral, vá em **SQL Editor**
4. Cole o conteúdo de `supabase-schema.sql` e execute
5. Anote: `Project URL`, `anon key` e `service_role key`

---

### 2. Variáveis de Ambiente

Copie o arquivo de exemplo:
```bash
cp .env.example .env.local
```

Preencha com suas chaves:

```env
# IA
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Z-API
ZAPI_INSTANCE_ID=seu-instance-id
ZAPI_TOKEN=seu-token
ZAPI_CLIENT_TOKEN=seu-client-token
ZAPI_BASE_URL=https://api.z-api.io/instances

# Corretor (número que receberá notificações)
CORRETOR_PHONE=5561999999999

# App
NEXT_PUBLIC_APP_URL=https://seu-projeto.vercel.app

# Loteamento
LOTEAMENTO_NAME=Nova Luziânia
LOTEAMENTO_CIDADE=Luziânia, GO
LOTEAMENTO_PRECO_MIN=45000
LOTEAMENTO_PRECO_MAX=120000
LOTEAMENTO_PARCELA_MIN=350
```

---

### 3. Fotos do Loteamento

Coloque as imagens em `public/loteamento/`:
- `foto1.jpg` — Vista aérea
- `foto2.jpg` — Infraestrutura
- `planta.pdf` — Planta do loteamento

---

### 4. GitHub

```bash
git init
git add .
git commit -m "feat: SPIN Agent Nova Luziânia"
git branch -M main
git remote add origin https://github.com/seu-usuario/spin-agent.git
git push -u origin main
```

---

### 5. Vercel — Deploy

1. Acesse [vercel.com](https://vercel.com) e faça login com GitHub
2. Clique em **Add New Project**
3. Importe o repositório `spin-agent`
4. Em **Environment Variables**, adicione todas as variáveis do `.env.example`
5. Clique em **Deploy**
6. Anote a URL gerada (ex: `https://spin-agent.vercel.app`)

---

### 6. Z-API — Conectar WhatsApp

1. Acesse [z-api.io](https://z-api.io) e crie uma instância
2. Conecte seu WhatsApp via QR Code
3. Em **Webhooks**, configure:
   - **URL:** `https://spin-agent.vercel.app/api/webhook`
   - **Eventos:** `Ao receber mensagem`
4. Salve e teste enviando uma mensagem para o número conectado

---

## 🧪 Teste Local

```bash
npm install
npm run dev
```

Acesse:
- `http://localhost:3000` — Página inicial
- `http://localhost:3000/dashboard` — Painel do corretor

Para testar o webhook localmente, use [ngrok](https://ngrok.com):
```bash
ngrok http 3000
# Cole a URL gerada na Z-API como webhook
```

---

## 🔄 Fluxo SPIN do Agente

```
Lead envia mensagem
       ↓
   Estágio S → Coleta nome, situação, família
       ↓
   Estágio P → Identifica dor (aluguel, espaço, segurança)
       ↓
   Estágio I → Amplifica consequências da dor
       ↓
   Estágio N → Apresenta loteamento como solução
       ↓
   Agendamento → Coleta data e hora
       ↓
   Notifica corretor → WhatsApp com resumo do lead
```

---

## 📊 Painel do Corretor

Acesse `/dashboard` para ver:
- **Métricas por estágio SPIN** (quantos leads em cada etapa)
- **Agendamentos** com nome, dor principal, data e hora
- **Ações:** confirmar, cancelar ou marcar como realizado
- **Lista de leads** com histórico SPIN

---

## 🤖 Modelos de IA Utilizados

| Função | Modelo | Fallback |
|--------|--------|----------|
| Conversa SPIN | Claude Opus | GPT-4o |
| Análise de imagem | GPT-4o Vision | — |
| Transcrição de áudio | Groq Whisper Large v3 | — |

---

## 🛠 Tecnologias

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (PostgreSQL + RLS)
- **Anthropic Claude** (conversa)
- **OpenAI GPT-4o** (visão + fallback)
- **Groq Whisper** (transcrição de áudio)
- **Z-API** (WhatsApp)
- **Vercel** (deploy)

---

## ❓ Dúvidas Frequentes

**O agente responde em quanto tempo?**  
Normalmente em 2-5 segundos, dependendo da API de IA.

**Posso mudar o script SPIN?**  
Sim. Edite a função `buildSystemPrompt` em `lib/agent.ts`.

**Como adicionar mais fotos do loteamento?**  
Adicione em `public/loteamento/` e edite `lib/zapi.ts` → função `sendLoteamentoMedia`.

**O agente guarda o histórico da conversa?**  
Sim. Cada lead tem seu histórico salvo no Supabase e retomado a qualquer momento.
