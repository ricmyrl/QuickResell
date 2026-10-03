import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return createPortal(<div role="dialog" aria-modal="true" aria-label={`${alt} image viewer`} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 sm:p-8" onClick={onClose}>
    <button type="button" autoFocus onClick={onClose} aria-label="Close image viewer" className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full bg-white/95 text-[#243a33] shadow-lg sm:right-5 sm:top-5"><X size={20} /></button>
    <img src={src} alt={alt} className="max-h-[calc(100dvh-1.5rem)] max-w-full object-contain sm:max-h-[calc(100dvh-4rem)]" onClick={(event) => event.stopPropagation()} />
  </div>, document.body)
}
