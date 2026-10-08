import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Trash2, X } from 'lucide-react'
import type { NotificationItem } from '../../types'
import { IconButton } from './Button'
import { useCurrency } from '../../lib/CurrencyContext'
import { formatNotificationMessage } from './notificationMessage'

export function NotificationsPanel({ open, notifications, onClose, onMarkAllRead, onRead, onDelete }: {
  open: boolean
  notifications: NotificationItem[]
  onClose: () => void
  onMarkAllRead: () => void
  onRead: (notification: NotificationItem) => void
  onDelete: (notification: NotificationItem) => void
}) {
  const { formatUsd } = useCurrency()
  const content = <>
    <div className="flex items-center justify-between border-b border-[#eef2ee] px-4 py-3">
      <div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#909c96]">Alerts</p><p className="mt-0.5 text-sm font-semibold text-[#2a4035]">Your marketplace feed</p></div>
      <div className="flex items-center gap-2">
        {notifications.some((item) => !item.isRead) && <button type="button" onClick={onMarkAllRead} className="text-[11px] font-semibold text-[#3d6e5d] underline-offset-2 hover:underline">Clear all</button>}
        <IconButton label="Close alerts" onClick={onClose}><X size={18} /></IconButton>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
      {notifications.length === 0
        ? <div className="rounded-xl bg-[#f7faf7] px-3 py-5 text-center text-xs text-[#7d8a84]">No notifications yet. New bids, order updates, and price changes will appear here.</div>
        : <AnimatePresence initial={false}>{notifications.slice(0, 8).map((notification) => <motion.div key={notification.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} className="relative mb-2 overflow-hidden rounded-xl bg-[#bd493e]">
          <button type="button" aria-label={`Delete ${notification.title}`} onClick={() => onDelete(notification)} className="absolute inset-y-0 right-0 flex w-[88px] flex-col items-center justify-center gap-1 text-xs font-semibold text-white"><Trash2 size={17} />Delete</button>
          <motion.button
            type="button"
            drag="x"
            dragConstraints={{ left: -88, right: 0 }}
            dragElastic={0.08}
            onDragEnd={(_, info) => {
              if (info.offset.x < -70 || info.velocity.x < -500) onDelete(notification)
            }}
            onClick={() => onRead(notification)}
            className={`relative flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${notification.isRead ? 'border-transparent bg-[#f9faf9]' : 'border-[#e4f0e7] bg-[#edf8f1]'}`}
          >
            <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${notification.type === 'OUTBID' || notification.type === 'AUCTION_CLOSED' ? 'bg-[#fff3ef] text-[#c8574a]' : notification.type === 'AUCTION_WON' || notification.type === 'LISTING_SOLD' ? 'bg-[#eaf9ea] text-[#3c7d5b]' : 'bg-[#edf2ff] text-[#536ab9]'}`}><Bell size={14} /></span>
            <span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold uppercase tracking-[.08em] text-[#8a9891]">{notification.type.replace(/_/g, ' ').toLowerCase()}</span><span className="mt-0.5 block text-sm font-semibold text-[#21372f]">{notification.title}</span><span className="mt-1 block text-xs leading-5 text-[#75837d]">{formatNotificationMessage(notification.message, formatUsd)}</span></span>
          </motion.button>
        </motion.div>)}</AnimatePresence>}
    </div>
  </>

  return createPortal(<AnimatePresence>
      {open && <motion.div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#101a17]/55 sm:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
        <motion.section role="dialog" aria-modal="true" aria-label="Alerts" className="flex max-h-[82dvh] w-full flex-col overflow-hidden rounded-t-[24px] border-t border-[#e4eae5] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-20px_60px_rgba(20,40,30,.18)]" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
          <div className="flex justify-center py-2.5"><span className="h-1 w-10 rounded-full bg-[#d8e0da]" /></div>
          <div className="flex min-h-0 flex-1 flex-col">{content}</div>
        </motion.section>
      </motion.div>}
    </AnimatePresence>, document.body)
}
