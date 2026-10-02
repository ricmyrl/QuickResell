import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, ImagePlus, LoaderCircle, X } from 'lucide-react'
import type { MarketplaceListing } from '../../types'
import { createListing, getListingCategories, type ListingCategory } from '../../services/listingApi'
import { Button, IconButton } from '../common/Button'
import { useCurrency } from '../../lib/CurrencyContext'

const maxImages = 8
type SelectedImage = { file: File; previewUrl: string }

export function CreateListingPage({ onClose, session, onCreated }: {
  onClose: () => void
  session: Session | null
  onCreated: (listing: MarketplaceListing) => void
}) {
  const { currency, displayCurrency, ratesReady, localToUsd } = useCurrency()
  const [categories, setCategories] = useState<ListingCategory[]>([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [price, setPrice] = useState('')
  const [originalPrice, setOriginalPrice] = useState('')
  const [locationCampus, setLocationCampus] = useState('')
  const [quantityAvailable, setQuantityAvailable] = useState('1')
  const [images, setImages] = useState<SelectedImage[]>([])
  const previewUrls = useRef(new Set<string>())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrls.current.clear()
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void getListingCategories(session).then((items) => {
      if (!cancelled) {
        setCategories(items)
        setCategoryId((current) => current || items[0]?.id || '')
        setCategoriesLoaded(true)
      }
    }).catch((caught: unknown) => {
      if (!cancelled) {
        setError(caught instanceof Error ? caught.message : 'Could not load product categories.')
        setCategoriesLoaded(true)
      }
    })
    return () => { cancelled = true }
  }, [session])

  const reset = () => {
    setTitle('')
    setDescription('')
    setCategoryId('')
    setPrice('')
    setOriginalPrice('')
    setLocationCampus('')
    setQuantityAvailable('1')
    images.forEach(({ previewUrl }) => {
      URL.revokeObjectURL(previewUrl)
      previewUrls.current.delete(previewUrl)
    })
    setImages([])
    setError('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!session?.user.email_confirmed_at) {
      setError('Sign in with a confirmed email before adding products.')
      return
    }
    if (!categoryId) {
      setError('No product categories are available yet.')
      return
    }

    const priceUsd = localToUsd(Number(price))
    const originalPriceUsd = originalPrice.trim() ? localToUsd(Number(originalPrice)) : null
    if (priceUsd === null || (originalPrice.trim() && originalPriceUsd === null)) {
      setError('Exchange rates are unavailable. Switch to USD or try again later.')
      return
    }

    setBusy(true)
    try {
      const listing = await createListing({
        title: title.trim(),
        description: description.trim(),
        categoryId,
        price: priceUsd,
        ...(originalPrice.trim() && originalPriceUsd !== null ? { originalPrice: originalPriceUsd } : {}),
        locationCampus: locationCampus.trim(),
        quantityAvailable: Number(quantityAvailable),
      }, images.map(({ file }) => file), session)
      onCreated(listing)
      reset()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Product could not be added. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="mx-auto w-full max-w-3xl pb-8">
    <button type="button" onClick={() => { if (!busy) onClose() }} className="mb-5 inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-[#66766e] transition hover:text-[#263b33]">
      <ArrowLeft size={16} />Back to seller studio
    </button>
    <header className="mb-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-[.13em] text-[#698572]">Seller workspace</p>
      <h1 className="font-display text-3xl font-semibold text-[#1c2b26]">Add a product</h1>
      <p className="mt-2 text-sm text-[#7a8781]">Add the details and photos buyers need to find your item.</p>
    </header>
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#43564b]">Product name</span><input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Desk lamp" className="h-11 w-full rounded-xl border border-[#dfe7e1] px-3 text-sm outline-none focus:border-[#86a995] focus:ring-4 focus:ring-[#e7f0e9]" /></label>
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#43564b]">Description</span><textarea maxLength={4000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Condition, details, and pickup notes" className="w-full resize-y rounded-xl border border-[#dfe7e1] px-3 py-2.5 text-sm outline-none focus:border-[#86a995] focus:ring-4 focus:ring-[#e7f0e9]" /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#43564b]">Category</span><select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={!categoriesLoaded || categories.length === 0} className="h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3 text-sm outline-none focus:border-[#86a995] disabled:bg-[#f4f6f4]">{categories.length === 0 && <option value="">{!categoriesLoaded ? 'Loading categories…' : 'No categories found'}</option>}{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#43564b]">Quantity available</span><input type="number" required min="1" max="1000" step="1" value={quantityAvailable} onChange={(event) => setQuantityAvailable(event.target.value)} className="h-11 w-full rounded-xl border border-[#dfe7e1] px-3 text-sm outline-none focus:border-[#86a995]" /></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#43564b]">Price ({displayCurrency})</span><input type="number" required min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" className="h-11 w-full rounded-xl border border-[#dfe7e1] px-3 text-sm outline-none focus:border-[#86a995]" /></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#43564b]">Original price ({displayCurrency}, optional)</span><input type="number" min={price || '0'} step="0.01" value={originalPrice} onChange={(event) => setOriginalPrice(event.target.value)} placeholder="0.00" className="h-11 w-full rounded-xl border border-[#dfe7e1] px-3 text-sm outline-none focus:border-[#86a995]" /></label>
      </div>
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#43564b]">Campus pickup location</span><input maxLength={120} value={locationCampus} onChange={(event) => setLocationCampus(event.target.value)} placeholder="e.g. North Hall" className="h-11 w-full rounded-xl border border-[#dfe7e1] px-3 text-sm outline-none focus:border-[#86a995]" /></label>

      <div><div className="mb-1.5 flex items-center justify-between"><span className="text-xs font-semibold text-[#43564b]">Product photos</span><span className="text-[11px] text-[#87938d]">{images.length}/{maxImages}</span></div><label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#b9c9bd] bg-[#f8faf8] px-4 py-4 text-center transition hover:bg-[#f1f6f1]"><ImagePlus size={21} className="text-[#628174]" /><span className="text-xs font-semibold text-[#43564b]">Choose images</span><span className="text-[10px] text-[#87938d]">JPEG, PNG, WebP, AVIF, or GIF · up to 10 MB each</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple className="sr-only" onChange={(event) => { const available = maxImages - images.length; const selected = Array.from(event.target.files ?? []).slice(0, available).map((file) => ({ file, previewUrl: URL.createObjectURL(file) })); selected.forEach(({ previewUrl }) => previewUrls.current.add(previewUrl)); setImages((current) => [...current, ...selected]); setError(''); event.target.value = '' }} /></label>
        {images.length > 0 && <div className="mt-3 grid grid-cols-4 gap-2">{images.map(({ file, previewUrl }, index) => <div key={`${file.name}-${index}`} className="group relative aspect-square overflow-hidden rounded-lg bg-[#f1f4f1]"><img src={previewUrl} alt={`Product photo ${index + 1}`} className="size-full object-cover" /><IconButton label={`Remove photo ${index + 1}`} onClick={() => { const removed = images[index]; if (removed) { URL.revokeObjectURL(removed.previewUrl); previewUrls.current.delete(removed.previewUrl) }; setImages((current) => current.filter((_, itemIndex) => itemIndex !== index)) }} className="absolute right-1 top-1 size-7 bg-white/95 opacity-100 shadow-sm"><X size={14} /></IconButton></div>)}</div>}
      </div>

      {error && <p role="alert" className="rounded-lg border border-[#f1d8d3] bg-[#fff5f2] px-3 py-2.5 text-xs leading-5 text-[#a34237]">{error}</p>}
      {!ratesReady && currency !== 'USD' && <p role="status" className="text-xs text-[#a45145]">Exchange rates are unavailable; price entry is shown in USD until rates load.</p>}
      <div className="flex justify-end gap-2 border-t border-[#edf0ed] pt-4"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !categoriesLoaded || categories.length === 0} icon={busy ? <LoaderCircle size={16} className="animate-spin" /> : <ImagePlus size={16} />}>{busy ? 'Publishing…' : 'Publish product'}</Button></div>
    </form>
  </section>
}