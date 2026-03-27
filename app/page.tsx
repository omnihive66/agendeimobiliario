import Link from 'next/link'

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0f0a' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 48, color: '#4ade80', marginBottom: 12 }}>
          SPIN Agent
        </h1>
        <p style={{ color: '#6b7c6b', fontSize: 18, marginBottom: 40 }}>
          Nova Luziânia · Agente de Vendas Inteligente
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <Link href="/dashboard" style={{
            background: '#1a3a1a',
            color: '#4ade80',
            border: '1px solid #166534',
            borderRadius: 10,
            padding: '12px 28px',
            fontSize: 15,
            textDecoration: 'none',
            fontWeight: 500
          }}>
            Painel do Corretor →
          </Link>
        </div>
        <div style={{ marginTop: 60, color: '#4b5563', fontSize: 13 }}>
          <p>Webhook: <code style={{ color: '#4ade80' }}>/api/webhook</code></p>
          <p style={{ marginTop: 4 }}>Conecte este endpoint na Z-API para ativar o agente.</p>
        </div>
      </div>
    </main>
  )
}
