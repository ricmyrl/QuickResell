import type { ReactNode } from 'react'

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] ${className}`}>{children}</span>
}

export function LiveBadge() {
  return <Badge className="live-pulse bg-[#d94b3d] text-white"><span className="size-1.5 rounded-full bg-white" />Live bid</Badge>
}
