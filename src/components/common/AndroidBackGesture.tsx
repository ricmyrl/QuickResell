import { useCallback } from 'react'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

function isSafeReturnPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}

export function AndroidBackGesture() {
  const location = useLocation()
  const navigate = useNavigate()
  const dragX = useMotionValue(0)
  const backdropOpacity = useTransform(dragX, [0, 120], [0, 0.16], { clamp: true })
  const handleOpacity = useTransform(dragX, [0, 18, 48], [0, 0.65, 1], { clamp: true })
  const handleScale = useTransform(dragX, [0, 50, 130], [0.72, 1, 1.08], { clamp: true })

  const goBack = useCallback(() => {
    const historyIndex = (window.history.state as { idx?: unknown } | null)?.idx
    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1)
      return
    }

    const returnTo = typeof location.state === 'object' && location.state !== null && 'returnTo' in location.state
      ? location.state.returnTo
      : null
    if (isSafeReturnPath(returnTo)) {
      navigate(returnTo, { replace: true })
    } else if (location.pathname.startsWith('/seller/')) {
      navigate('/seller', { replace: true })
    } else if (location.pathname !== '/') {
      navigate('/', { replace: true })
    }
  }, [location.pathname, location.state, navigate])

  return <>
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[115] bg-[#14221c]"
      style={{ opacity: backdropOpacity }}
    />
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-1/2 z-[116] grid size-12 -translate-y-1/2 place-items-center"
      style={{ x: dragX, opacity: handleOpacity, scale: handleScale }}
    >
      <span className="grid size-11 place-items-center rounded-full border border-white/60 bg-white text-[#294b3c] shadow-[0_8px_28px_rgba(12,28,20,.25)]">
        <ArrowLeft size={19} strokeWidth={2.5} />
      </span>
    </motion.div>
    <motion.div
      aria-label="Swipe right from the left edge to go back"
      className="fixed inset-y-0 left-0 z-[117] w-5 touch-pan-y"
      drag="x"
      dragConstraints={{ left: 0, right: 150 }}
      dragDirectionLock
      dragElastic={0.08}
      dragMomentum={false}
      style={{ x: dragX }}
      onPointerDownCapture={(event) => {
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onDragEnd={(_event, info) => {
        if (info.offset.x >= 76 || (info.offset.x >= 30 && info.velocity.x >= 650)) goBack()
      }}
    />
  </>
}
