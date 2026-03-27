import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans } from 'next/font/google'
import './globals.css'

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '600', '700']
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['300', '400', '500', '600']
})

export const metadata: Metadata = {
  title: 'SPIN Agent · Nova Luziânia',
  description: 'Agente de vendas inteligente para loteamentos'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${playfair.variable} ${dmSans.variable} font-body bg-dark-900 text-white antialiased`}>
        {children}
      </body>
    </html>
  )
}
