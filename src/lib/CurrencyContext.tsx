import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

const regionCurrency: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', UG: 'UGX', TZ: 'TZS', RW: 'RWF',
  GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', JP: 'JPY', CN: 'CNY',
  BR: 'BRL', MX: 'MXN', CH: 'CHF', SG: 'SGD', AE: 'AED',
  AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR', FR: 'EUR',
  GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR', LV: 'EUR', MT: 'EUR',
  NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR',
}

type CurrencyContextValue = {
  currency: string
  displayCurrency: string
  ratesReady: boolean
  ratesUpdatedAt: string | null
  rateError: string
  formatUsd: (amount: number, fractionDigits?: number) => string
  localToUsd: (amount: number) => number | null
  usdToLocal: (amount: number) => number | null
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

function browserRegion(): string | null {
  if (typeof navigator === 'undefined') return null
  for (const localeTag of navigator.languages) {
    try {
      const region = new Intl.Locale(localeTag).region
      if (region) return region
    } catch {
      continue
    }
  }
  return null
}

function localeCurrency(): string {
  const region = browserRegion()
  return region ? regionCurrency[region] ?? 'USD' : 'USD'
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency] = useState(localeCurrency)
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 })
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null)
  const [rateError, setRateError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const apiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '')
    if (!apiUrl) {
      setRateError('Currency rates are unavailable. Showing USD.')
      return () => controller.abort()
    }

    void fetch(`${apiUrl}/currency/rates`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Currency rates are unavailable. Showing USD.')
        return response.json() as Promise<{ base: string; rates: Record<string, number>; updatedAt: string }>
      })
      .then((data) => {
        if (data.base !== 'USD' || !data.rates || !Number.isFinite(data.rates.NGN)) throw new Error('Currency rates are unavailable. Showing USD.')
        setRates({ ...data.rates, USD: 1 })
        setRatesUpdatedAt(data.updatedAt)
        setRateError('')
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setRateError(error instanceof Error ? error.message : 'Currency rates are unavailable. Showing USD.')
      })

    return () => controller.abort()
  }, [])

  const value = useMemo<CurrencyContextValue>(() => {
    const rate = rates[currency]
    const ratesReady = currency === 'USD' || (Number.isFinite(rate) && rate > 0)
    const activeCurrency = ratesReady ? currency : 'USD'
    const activeRate = ratesReady ? rate ?? 1 : 1
    const locale = typeof navigator === 'undefined' ? 'en-US' : navigator.languages[0] ?? 'en-US'

    return {
      currency,
      displayCurrency: activeCurrency,
      ratesReady,
      ratesUpdatedAt,
      rateError,
      formatUsd: (amount, fractionDigits = 2) => new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: activeCurrency,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(amount * activeRate),
      localToUsd: (amount) => Number.isFinite(amount) && (ratesReady || currency === 'USD') ? amount / activeRate : null,
      usdToLocal: (amount) => Number.isFinite(amount) && (ratesReady || currency === 'USD') ? amount * activeRate : null,
    }
  }, [currency, rates, ratesUpdatedAt, rateError])

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency(): CurrencyContextValue {
  const value = useContext(CurrencyContext)
  if (!value) throw new Error('useCurrency must be used within CurrencyProvider.')
  return value
}