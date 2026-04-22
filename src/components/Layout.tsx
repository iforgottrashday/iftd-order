import type { ReactNode } from 'react'
import AppHeader from './AppHeader'
import BottomNav from './BottomNav'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="h-screen overflow-hidden bg-[#F5F5F5]">
      <AppHeader />
      <main className="max-w-[480px] mx-auto w-full bg-white h-[calc(100vh-56px)] overflow-y-auto pb-16">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
