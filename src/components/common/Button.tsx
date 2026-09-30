import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react'
import { motion } from 'framer-motion'

type ButtonProps = Omit<ComponentProps<typeof motion.button>, 'children'> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: ReactNode; children: ReactNode }

export function Button({ variant = 'primary', icon, children, className = '', ...props }: ButtonProps) {
  return <motion.button whileTap={{ scale: .975 }} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${variant === 'primary' ? 'bg-[#243a33] text-white hover:bg-[#34564a]' : variant === 'secondary' ? 'border border-[#dce4de] bg-white text-[#243a33] hover:bg-[#f3f7f3]' : variant === 'danger' ? 'bg-[#d94b3d] text-white hover:bg-[#bd3c31]' : 'text-[#65736e] hover:bg-[#eef2ef] hover:text-[#243a33]'} ${className}`} {...props}>{icon}{children}</motion.button>
}

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} className={`grid size-10 place-items-center rounded-xl text-[#63726c] transition-colors hover:bg-[#eef2ef] hover:text-[#243a33] ${className}`} {...props}>{children}</button>
}
