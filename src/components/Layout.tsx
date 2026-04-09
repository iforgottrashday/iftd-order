import type { ReactNode } from 'react'
import AppHeader from './AppHeader'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <AppHeader />
      <main className="max-w-[480px] mx-auto bg-white min-h-[calc(100vh-56px)]">
        {children}
      </main>
    </div>
  )
}
