import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

const regionCurrency: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', UG: 'UGX', TZ: 'TZS', RW: 'RWF',
  GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', JP: 'JPY', CN: 'CNY',
  BR: 'BRL', MX: 'MXN', CH: 'CHF', SG: 'SGD', AE: 'AED',
  AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR', FR: 'EUR',
  GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR', LV: 'EUR', MT: 'EUR',
  NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR',
}
const supportedCurrencies = new Set<string>(['USD', ...new Set(Object.values(regionCurrency))])
const currencyStorageKey = 'quickresell.currency'

type CurrencyContextValue = {
  currency: string
  displayCurrency: string
  ratesReady: boolean
  ratesUpdatedAt: string | null
  rateError: string
  setCurrency: (currency: string) => void
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

function readStoredCurrency(): string | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(currencyStorageKey)
  if (!stored) return null
  const normalized = stored.trim().toUpperCase()
  return supportedCurrencies.has(normalized) ? normalized : null
}

function writeStoredCurrency(currency: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(currencyStorageKey, currency.toUpperCase())
}

async function detectCurrencyFromLocation(): Promise<string> {
  try {
    const response = await fetch('https://ipapi.co/json/', { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error('Location resolution failed')

    const payload = await response.json() as { country_code?: string; currency?: string }
    const locationCurrency = payload.currency?.trim().toUpperCase()
    if (locationCurrency && supportedCurrencies.has(locationCurrency)) return locationCurrency

    const region = payload.country_code?.trim().toUpperCase()
    if (region && regionCurrency[region]) return regionCurrency[region]
  } catch {
    // Fall back to the browser locale and then USD if no location data is available.
  }

  return localeCurrency()
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<string>(() => readStoredCurrency() ?? 'USD')
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 })
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null)
  const [rateError, setRateError] = useState('')

  useEffect(() => {
    const storedCurrency = readStoredCurrency()
    if (storedCurrency) {
      setCurrencyState(storedCurrency)
      return
    }

    let active = true
    void detectCurrencyFromLocation().then((resolvedCurrency) => {
      if (!active) return
      setCurrencyState(resolvedCurrency)
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    writeStoredCurrency(currency)
  }, [currency])

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

  const setCurrency = (nextCurrency: string) => {
    const normalized = nextCurrency.trim().toUpperCase()
    if (normalized && supportedCurrencies.has(normalized)) setCurrencyState(normalized)
  }

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
      setCurrency,
      formatUsd: (amount, fractionDigits = 2) => new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: activeCurrency,
        currencyDisplay: activeCurrency === 'NGN' ? 'narrowSymbol' : 'symbol',
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