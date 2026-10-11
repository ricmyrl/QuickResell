import { ShoppingBag, Store } from 'lucide-react'

type OrdersModeTabsProps = {
  mode: 'buyer' | 'seller'
  onChange: (mode: 'buyer' | 'seller') => void
}

export function OrdersModeTabs({ mode, onChange }: OrdersModeTabsProps) {
  return <div role="tablist" aria-label="Order type" className="inline-flex shrink-0 rounded-lg border border-[#e1e8e2] bg-white p-1">
    <button type="button" role="tab" aria-selected={mode === 'buyer'} onClick={() => onChange('buyer')} className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${mode === 'buyer' ? 'bg-[#eaf2eb] text-[#315f49]' : 'text-[#78867e] hover:text-[#34483b]'}`}>
      <ShoppingBag size={14} />Buyer
    </button>
    <button type="button" role="tab" aria-selected={mode === 'seller'} onClick={() => onChange('seller')} className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${mode === 'seller' ? 'bg-[#eaf2eb] text-[#315f49]' : 'text-[#78867e] hover:text-[#34483b]'}`}>
      <Store size={14} />Seller
    </button>
  </div>
}
