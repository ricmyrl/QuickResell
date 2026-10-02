import { ChevronDown } from 'lucide-react'
import { currencyOptions, useCurrency } from '../../lib/CurrencyContext'

export function CurrencySelector({ mobile = false }: { mobile?: boolean }) {
  const { currency, detectedCountry, ratesReady, setCurrency } = useCurrency()

  return <label title={detectedCountry ? `Region detected from browser locale: ${detectedCountry}` : 'Select display currency'} className={`${mobile ? 'fixed bottom-[68px] left-3 z-40 shadow-md md:hidden' : 'w-full'} flex items-center gap-2 rounded-lg border border-[#e2e8e2] bg-white px-2.5 py-2 text-xs text-[#64756a]`}>
    <span className="min-w-0 truncate font-medium">{detectedCountry ?? 'Currency'}</span>
    <span className="relative inline-flex items-center">
      <select aria-label="Display currency" value={currency} onChange={(event) => setCurrency(event.target.value)} className="appearance-none bg-transparent pr-5 text-xs font-semibold text-[#294638] outline-none">
        {currencyOptions.map((option) => <option key={option.code} value={option.code}>{option.code}</option>)}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-0 text-[#718078]" />
    </span>
    {!ratesReady && currency !== 'USD' && <span role="status" className="text-[10px] text-[#a45145]">USD fallback</span>}
  </label>
}