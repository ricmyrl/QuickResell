import { createContext, useContext, useMemo, type ReactNode } from "react"

type CurrencyContextValue = {
  currency: "NGN"
  displayCurrency: "NGN"
  ratesReady: true
  ratesUpdatedAt: null
  rateError: ""
  setCurrency: (currency: string) => void
  formatUsd: (amount: number, fractionDigits?: number) => string
  localToUsd: (amount: number) => number | null
  usdToLocal: (amount: number) => number | null
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const value = useMemo<CurrencyContextValue>(() => ({
    currency: "NGN",
    displayCurrency: "NGN",
    ratesReady: true,
    ratesUpdatedAt: null,
    rateError: "",
    setCurrency: () => undefined,
    formatUsd: (amount, fractionDigits = 2) => new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount),
    localToUsd: (amount) => Number.isFinite(amount) ? amount : null,
    usdToLocal: (amount) => Number.isFinite(amount) ? amount : null,
  }), [])

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency(): CurrencyContextValue {
  const value = useContext(CurrencyContext)
  if (!value) throw new Error("useCurrency must be used within CurrencyProvider.")
  return value
}
