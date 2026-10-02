declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: {
        key: string
        email: string
        amount: number
        ref: string
        currency?: string
        metadata?: Record<string, unknown>
        callback: (response: { reference?: string; status?: string; trans?: string; trxref?: string }) => void | Promise<void>
        onClose: () => void
      }) => {
        openIframe: () => void
      }
    }
  }
}

export {}
