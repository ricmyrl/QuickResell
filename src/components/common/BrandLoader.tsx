type BrandLoaderProps = {
  label: string
  overlay?: boolean
}

export function BrandLoader({ label, overlay = false }: BrandLoaderProps) {
  return <div role="status" aria-live="polite" className={overlay ? 'fixed inset-0 z-[100] grid place-items-center bg-[#14221c]/65 px-4 text-white' : 'grid min-h-screen place-items-center bg-[#f5f7f5] px-4 text-[#243a33]'}>
    <div className="flex flex-col items-center gap-3">
      <div className="relative grid size-20 place-items-center">
        <span aria-hidden="true" className="absolute inset-1 rounded-full border-2 border-[#dfe8e1] border-r-[#d4f06b] border-t-[#70917c] animate-spin motion-reduce:animate-none" />
        <img src="/quickResell.svg" alt="" className="size-11 object-contain" />
      </div>
      <span className="font-display text-base font-bold tracking-[-.03em]">QUICK <span className="text-[#70917c]">RESELL</span></span>
      <span className="text-xs text-current/70">{label}</span>
    </div>
  </div>
}
