# 🚀 Deploy — SPIN Agent Nova Luziânia
## GitHub → Vercel em 10 minutos

---

## PASSO 1 — Preparar o projeto localmente

Extraia o ZIP baixado e abra o terminal na pasta:

```bash
cd spin-agent
```

Inicialize o Git e faça o primeiro commit:

```bash
git init
git add .
git commit -m "feat: SPIN Agent Nova Luziânia - deploy inicial"
```

---

## PASSO 2 — Criar repositório no GitHub

1. Acesse https://github.com/new
2. Preencha:
   - **Repository name:** `spin-agent-nova-luziana`
   - **Visibility:** Private ← importante para proteger suas chaves
   - **NÃO marque** "Add a README file"
3. Clique em **Create repository**
4. Copie os comandos que o GitHub mostrar e rode no terminal:

```bash
git remote add origin https://github.com/SEU_USUARIO/spin-agent-nova-luziana.git
git branch -M main
git push -u origin main
```

---

## PASSO 3 — Deploy no Vercel

1. Acesse https://vercel.com/new
2. Clique em **Import Git Repository**
3. Selecione o repositório `spin-agent-nova-luziana`
4. Em **Framework Preset** → selecione **Next.js**
5. **NÃO clique em Deploy ainda** — primeiro configure as variáveis

---

## PASSO 4 — Variáveis de Ambiente no Vercel

Na tela de configuração, clique em **Environment Variables** e adicione UMA POR UMA:

### IA
| Nome | Valor |
|------|-------|
| `GROQ_API_KEY` | sua chave Groq (nova, gerada após revogar a anterior) |
| `OPENAI_API_KEY` | sua chave OpenAI (fallback — opcional para testes) |

### Supabase ← JÁ CONFIGURADO
| Nome | Valor |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://aohtryeawadcaaevecdx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvaHRyeWVhd2FkY2FhZXZlY2R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzgwNjAsImV4cCI6MjA4OTk1NDA2MH0.SrXdU4HH7j5IbXyAF6wVsRDwt7piZ_tyDwen2R7UcrA` |
| `SUPABASE_SERVICE_ROLE_KEY` | Buscar em: supabase.com → projeto loteamentos-intel → Settings → API → service_role |

### Z-API
| Nome | Valor |
|------|-------|
| `ZAPI_INSTANCE_ID` | `3F0C30F3B41441EDB3496EB5514D2922` |
| `ZAPI_TOKEN` | seu novo token (gerado após revogar o anterior) |
| `ZAPI_BASE_URL` | `https://api.z-api.io/instances` |

### Corretor
| Nome | Valor |
|------|-------|
| `CORRETOR_PHONE` | número com DDI: ex `5561999999999` |
| `CORRETOR_NAME` | `Rodrigo` |

### App
| Nome | Valor |
|------|-------|
| `NEXT_PUBLIC_APP_URL` | deixe em branco por agora — preencher após o deploy com a URL gerada |
| `WEBHOOK_SECRET` | `spin-agent-nova-luziana-2025` |

### Loteamento
| Nome | Valor |
|------|-------|
| `LOTEAMENTO_NAME` | `Nova Luziânia` |
| `LOTEAMENTO_CIDADE` | `Luziânia, GO` |
| `LOTEAMENTO_PARCELA_MIN` | `301` |

6. Clique em **Deploy** 🚀

---

## PASSO 5 — Após o deploy

Vercel vai gerar uma URL como: `https://spin-agent-nova-luziana.vercel.app`

**5.1 — Atualize a variável NEXT_PUBLIC_APP_URL:**
- Vá em Vercel → seu projeto → Settings → Environment Variables
- Edite `NEXT_PUBLIC_APP_URL` com a URL gerada
- Clique em **Redeploy**

**5.2 — Teste o painel:**
Acesse: `https://spin-agent-nova-luziana.vercel.app/dashboard`

---

## PASSO 6 — Configurar Webhook na Z-API

1. Acesse https://app.z-api.io
2. Entre na sua instância `3F0C30F3B41441EDB3496EB5514D2922`
3. Vá em **Webhooks**
4. Configure:
   - **URL:** `https://spin-agent-nova-luziana.vercel.app/api/webhook`
   - **Eventos:** marque "Ao receber mensagem" e "Ao receber mensagem de grupo" (desmarcar grupo)
5. Salve

**6.1 — Teste imediato:**
Envie qualquer mensagem para o número conectado na Z-API e o agente deve responder!

---

## PASSO 7 — Verificar se está tudo funcionando

Acesse o painel e veja a aba **◉ Status do Webhook**:
`https://spin-agent-nova-luziana.vercel.app/dashboard`

Checklist:
- ✅ Supabase conectado
- ✅ Z-API online
- ✅ Agente respondendo
- ✅ Mensagens aparecendo no painel

---

## ⚠️ Segurança — Ações obrigatórias ANTES do deploy

1. **Groq:** gere nova chave em https://console.groq.com → API Keys → Create
2. **Z-API:** regenere o token em https://app.z-api.io → sua instância → Token

---

## 🔄 Como atualizar o agente depois

Qualquer mudança no código:
```bash
git add .
git commit -m "update: descrição da mudança"
git push
```
O Vercel faz o redeploy automaticamente em ~1 minuto.

Para mudar apenas o **prompt** sem redeploy:
Acesse o painel → aba **⚙ Prompt do Agente** → edite e salve.
