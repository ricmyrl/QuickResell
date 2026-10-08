import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { IconButton } from './Button'

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open, onClose])

  return <AnimatePresence>{open && <motion.div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#101a17]/55 p-2 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <motion.section role="dialog" aria-modal="true" aria-label={title} className="my-auto max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-[22px] bg-white shadow-[0_30px_100px_rgba(10,26,20,.25)]" initial={{ opacity: 0, y: 16, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .98 }} transition={{ duration: .2 }}>
      <div className="sticky top-0 flex items-center justify-between border-b border-[#edf0ed] bg-white px-4 py-3 sm:px-6 sm:py-4"><h2 className="font-display min-w-0 text-lg font-semibold text-[#192724]">{title}</h2><IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton></div>
      <div className="p-4 sm:p-6">{children}</div>
    </motion.section>
  </motion.div>}</AnimatePresence>
}
