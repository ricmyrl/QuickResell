import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Activity, BellRing, Check, ChevronRight, Eye, EyeOff, Search, ShieldCheck, Trash2, WalletCards } from 'lucide-react'
import type { Auction, AuctionWatchlistRule } from '../../types'
import { Button } from '../common/Button'

type RuleDraft = { maxBid: string; bidStep: string; autoBidEnabled: boolean; confirmed: boolean }
type InitialRuleDraft = { auctionRoomId: string; maxBid?: number; bidStep?: number }
type Props = {
  auctions: Auction[]
  rules: AuctionWatchlistRule[]
  loading: boolean
  error: string
  savingId: string | null
  initialDraft: InitialRuleDraft | null
  onSave: (auctionRoomId: string, draft: { maxBid: number; bidStep: number; autoBidEnabled: boolean; authorizationConfirmed: boolean }) => Promise<{ emailNotified?: boolean } | void>
  onRemove: (auctionRoomId: string) => Promise<void>
  onOpenAuction: (auction: Auction) => void
  onRequestSignIn: () => void
  signedIn: boolean
  emailConfirmed: boolean
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

function createDraft(rule?: AuctionWatchlistRule, initial?: InitialRuleDraft): RuleDraft {
  return {
    maxBid: String(rule?.maxBid ?? initial?.maxBid ?? ''),
    bidStep: String(rule?.bidStep ?? initial?.bidStep ?? 5),
    autoBidEnabled: rule?.autoBidEnabled ?? false,
    confirmed: rule?.autoBidEnabled ?? false,
  }
}

export function AuctionWatchlistPage({ auctions, rules, loading, error, savingId, initialDraft, onSave, onRemove, onOpenAuction, onRequestSignIn, signedIn, emailConfirmed }: Props) {
  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({})
  const [scoutAlertMessage, setScoutAlertMessage] = useState<string | null>(null)
  const ruleByAuction = new Map(rules.map((rule) => [rule.auctionRoomId, rule]))
  const draftFor = (auctionId: string) => drafts[auctionId] ?? createDraft(ruleByAuction.get(auctionId), initialDraft?.auctionRoomId === auctionId ? initialDraft : undefined)
  const visibleAuctions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return auctions.filter((auction) => auction.status === 'ACTIVE' && (!query || `${auction.title} ${auction.category} ${auction.location}`.toLowerCase().includes(query)))
  }, [auctions, search])

  const updateDraft = (auctionId: string, update: Partial<RuleDraft>) => {
    setDrafts((current) => ({ ...current, [auctionId]: { ...draftFor(auctionId), ...update } }))
  }

  const handleSave = async (auction: Auction) => {
    if (!signedIn) {
      onRequestSignIn()
      return
    }
    if (!emailConfirmed) return
    const draft = draftFor(auction.id)
    const maxBid = Number(draft.maxBid)
    const bidStep = Number(draft.bidStep)
    if (!Number.isFinite(maxBid) || maxBid <= 0 || maxBid > 10_000_000) {
      updateDraft(auction.id, { confirmed: false })
      return
    }
    if (!Number.isFinite(bidStep) || bidStep <= 0 || bidStep > maxBid) {
      updateDraft(auction.id, { confirmed: false })
      return
    }
    if (draft.autoBidEnabled && !draft.confirmed) return
    const result = await onSave(auction.id, { maxBid, bidStep, autoBidEnabled: draft.autoBidEnabled, authorizationConfirmed: draft.confirmed })
    setScoutAlertMessage(result?.emailNotified ? 'Scout alert email sent to your inbox.' : null)
    setDrafts((current) => ({ ...current, [auction.id]: { ...draft, confirmed: false } }))
  }

  const trackedRules = [...rules].sort((left, right) => Number(right.autoBidEnabled) - Number(left.autoBidEnabled))

  return <section className="min-w-0 pb-4 enter-up">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-2 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#647b62]"><Eye size={13} /> Personal watchlist</p><h1 className="font-display text-[30px] font-semibold leading-tight text-[#20382c] sm:text-[34px]">Set your price. Scout watches.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#78867d]">Save auctions, set a hard maximum, and choose how much Scout may raise each bid. Your rules stay yours.</p></div>
      <div className="flex items-center gap-2 rounded-xl border border-[#e0e8df] bg-white px-3 py-2 text-xs text-[#708074]"><ShieldCheck size={15} className="text-[#5a805a]" /> Bids never exceed your max</div>
    </header>

    {!signedIn && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8dfc8] bg-[#fffaf0] px-4 py-3"><p className="text-sm text-[#64573c]">Sign in and confirm your email to save watchlists and enable Scout bids.</p><Button variant="secondary" onClick={onRequestSignIn} className="min-h-9 px-3 text-xs">Sign in</Button></div>}
    {signedIn && !emailConfirmed && <div role="status" className="mb-5 rounded-xl border border-[#e8dfc8] bg-[#fffaf0] px-4 py-3 text-sm text-[#64573c]">Confirm your email before saving watchlist rules or enabling bids.</div>}
    {error && <div role="alert" className="mb-5 rounded-xl border border-[#efd7d2] bg-white px-4 py-3 text-sm text-[#a04b3f]">{error}</div>}
    {scoutAlertMessage && <div role="status" className="mb-5 rounded-xl border border-[#dfe8dc] bg-[#edf7ee] px-4 py-3 text-sm font-medium text-[#2f5335]">{scoutAlertMessage}</div>}

    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <SummaryMetric icon={<Eye size={16} />} label="Watching" value={rules.length.toString()} note="Auctions saved" />
      <SummaryMetric icon={<Activity size={16} />} label="Scout rules" value={rules.filter((rule) => rule.autoBidEnabled).length.toString()} note="Currently enabled" />
      <div className="col-span-2 rounded-[12px] border border-[#dfe8dc] bg-[#eef4e9] p-4 sm:col-span-1"><div className="flex items-center gap-2 text-xs font-medium text-[#657a65]"><WalletCards size={16} /> Your guardrail</div><p className="font-display mt-2 text-sm font-semibold text-[#35503a]">You choose the ceiling</p><p className="mt-1 text-[11px] leading-4 text-[#788878]">Scout watches competition and bid steps. It cannot spend beyond your maximum.</p></div>
    </div>

    <section className="mb-7 overflow-hidden rounded-[14px] border border-[#e2e9e2] bg-white">
      <div className="flex items-center justify-between border-b border-[#edf1ed] px-4 py-4 sm:px-5"><div><h2 className="font-display text-base font-semibold text-[#293e31]">Your watchlist</h2><p className="mt-1 text-xs text-[#879289]">Review price rules, pause Scout, or remove an auction.</p></div><span className="rounded-full bg-[#edf4eb] px-2.5 py-1 text-xs font-bold text-[#5d795d]">{rules.length}</span></div>
      {loading ? <p className="px-5 py-8 text-center text-sm text-[#869188]">Loading your watchlist…</p> : trackedRules.length ? <div className="divide-y divide-[#edf1ed]">{trackedRules.map((rule) => rule.auction && <AuctionRuleCard key={rule.id} auction={rule.auction} rule={rule} draft={draftFor(rule.auctionRoomId)} onDraftChange={(update) => updateDraft(rule.auctionRoomId, update)} onSave={() => void handleSave(rule.auction)} onRemove={() => void onRemove(rule.auctionRoomId)} onOpen={() => onOpenAuction(rule.auction)} saving={savingId === rule.auctionRoomId} />)}</div> : <EmptyWatchlist signedIn={signedIn} onBrowse={() => document.getElementById('scout-auction-browser')?.scrollIntoView({ behavior: 'smooth' })} />}
    </section>

    <section id="scout-auction-browser" className="overflow-hidden rounded-[14px] border border-[#e2e9e2] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ed] px-4 py-4 sm:px-5"><div><h2 className="font-display text-base font-semibold text-[#293e31]">Find an auction to watch</h2><p className="mt-1 text-xs text-[#879289]">Choose a maximum and bid step for any live room.</p></div><span className="rounded-full bg-[#f1f4ef] px-2.5 py-1 text-xs font-semibold text-[#738076]">{visibleAuctions.length} live</span></div>
      <div className="border-b border-[#edf1ed] bg-[#fbfcfa] px-4 py-3 sm:px-5"><label className="relative block max-w-md"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa49b]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by item, category, or campus" aria-label="Search live auctions" className="h-10 w-full rounded-lg border border-[#e2e8e2] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[#a2aca5] focus:border-[#91aa92]" /></label></div>
      {visibleAuctions.length ? <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">{visibleAuctions.map((auction) => <AuctionSetupCard key={auction.id} auction={auction} rule={ruleByAuction.get(auction.id)} draft={draftFor(auction.id)} onDraftChange={(update) => updateDraft(auction.id, update)} onSave={() => void handleSave(auction)} onOpen={() => onOpenAuction(auction)} saving={savingId === auction.id} />)}</div> : <div className="px-5 py-10 text-center text-sm text-[#879289]">{search ? 'No live auctions match that search.' : 'There are no live auctions right now.'}</div>}
    </section>
    <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-[#869188]"><BellRing size={13} className="mt-0.5 shrink-0" />Scout bidding is an opt-in convenience, not a guarantee of winning. Review notifications and auction status regularly.</p>
  </section>
}

function AuctionSetupCard({ auction, rule, draft, onDraftChange, onSave, onOpen, saving }: { auction: Auction; rule?: AuctionWatchlistRule; draft: RuleDraft; onDraftChange: (update: Partial<RuleDraft>) => void; onSave: () => void; onOpen: () => void; saving: boolean }) {
  const maxBid = Number(draft.maxBid)
    const invalidCeiling = draft.maxBid !== '' && (!Number.isFinite(maxBid) || maxBid <= auction.currentHighestBid)
    const missingCeiling = draft.maxBid.trim() === ''
    const lowStep = draft.bidStep !== '' && (!Number.isFinite(Number(draft.bidStep)) || Number(draft.bidStep) <= 0 || (maxBid > 0 && Number(draft.bidStep) > maxBid))
  return <article className="overflow-hidden rounded-[12px] border border-[#e5ebe4] bg-white">
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 border-b border-[#eff2ee] p-3 text-left transition hover:bg-[#fafbf9]"><div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-[#f0f3ee]">{auction.image ? <img src={auction.image} alt={auction.title} className="size-full object-cover" /> : <Activity size={18} className="text-[#8e9b90]" />}</div><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#35463a]">{auction.title}</span><span className="mt-1 block truncate text-[10px] text-[#879289]">{auction.category} · {auction.location}</span></span><span className="shrink-0 text-right"><span className="block font-display text-sm font-semibold text-[#2e4534]">{currency.format(auction.currentHighestBid)}</span><span className="text-[9px] text-[#96a097]">current bid</span></span></button>
    <div className="space-y-3 p-3.5">
      <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-semibold text-[#718075]">Your max price<input inputMode="decimal" type="number" min={auction.currentHighestBid + 0.01} max="10000000" step="0.01" value={draft.maxBid} onChange={(event) => onDraftChange({ maxBid: event.target.value, confirmed: false })} placeholder={`Above ${currency.format(auction.currentHighestBid)}`} className="mt-1 h-10 w-full rounded-lg border border-[#dfe7de] px-2.5 text-xs text-[#334638] outline-none focus:border-[#90aa8d]" /></label><label className="text-[10px] font-semibold text-[#718075]">Bid step<input inputMode="decimal" type="number" min="0.01" max={maxBid || undefined} step="0.01" value={draft.bidStep} onChange={(event) => onDraftChange({ bidStep: event.target.value, confirmed: false })} className="mt-1 h-10 w-full rounded-lg border border-[#dfe7de] px-2.5 text-xs text-[#334638] outline-none focus:border-[#90aa8d]" /></label></div>
      {invalidCeiling && <p className="text-[10px] text-[#ad493e]">Set a maximum above the current bid ({currency.format(auction.currentHighestBid)}).</p>}
      {lowStep && <p className="text-[10px] text-[#ad493e]">Bid step must be positive and no greater than your maximum.</p>}
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[9px] bg-[#f5f7f3] px-3 py-2.5"><span className="min-w-0"><span className="block text-[11px] font-semibold text-[#45594a]">Let Scout bid for me</span><span className="mt-0.5 block text-[9px] leading-4 text-[#879289]">Scout may bid up to your max.</span></span><input type="checkbox" checked={draft.autoBidEnabled} onChange={(event) => onDraftChange({ autoBidEnabled: event.target.checked, confirmed: false })} className="size-4 shrink-0 accent-[#456d4c]" /></label>
      {draft.autoBidEnabled && <label className="flex items-start gap-2 text-[9px] leading-4 text-[#758276]"><input type="checkbox" checked={draft.confirmed} onChange={(event) => onDraftChange({ confirmed: event.target.checked })} className="mt-0.5 size-3.5 shrink-0 accent-[#456d4c]" /><span>I authorize Scout to place bids for this auction, only up to {currency.format(maxBid || 0)}.</span></label>}
      <div className="flex items-center justify-between gap-2"><span className="text-[9px] text-[#98a197]">{rule ? rule.autoBidEnabled ? 'Scout is watching' : 'Saved · Scout paused' : 'Not on your watchlist'}</span><Button onClick={onSave} disabled={saving || invalidCeiling || lowStep || (draft.autoBidEnabled && !draft.confirmed)} icon={rule ? <Check size={13} /> : <Eye size={13} />} className="min-h-8 rounded-lg px-3 text-[10px]">{saving ? 'Saving…' : rule ? 'Save rule' : 'Save to watchlist'}</Button></div>
      <div className="flex items-center justify-between gap-2"><span className="text-[9px] text-[#98a197]">{rule ? rule.autoBidEnabled ? 'Scout is watching' : 'Saved · Scout paused' : 'Not on your watchlist'}</span><Button onClick={onSave} disabled={saving || missingCeiling || invalidCeiling || lowStep || (draft.autoBidEnabled && !draft.confirmed)} icon={rule ? <Check size={13} /> : <Eye size={13} />} className="min-h-8 rounded-lg px-3 text-[10px]">{saving ? 'Saving…' : rule ? 'Save rule' : 'Save to watchlist'}</Button></div>
    </div>
  </article>
}

function AuctionRuleCard({ auction, rule, draft, onDraftChange, onSave, onRemove, onOpen, saving }: { auction: Auction; rule: AuctionWatchlistRule; draft: RuleDraft; onDraftChange: (update: Partial<RuleDraft>) => void; onSave: () => void; onRemove: () => void; onOpen: () => void; saving: boolean }) {
  const active = auction.status === 'ACTIVE'
  const maxBid = Number(draft.maxBid)
  const invalidCeiling = active && draft.autoBidEnabled && maxBid <= auction.currentHighestBid
  const needsConsent = draft.autoBidEnabled && !draft.confirmed
  return <article className="flex min-w-0 flex-wrap items-center gap-3 p-4 sm:px-5"><button type="button" onClick={onOpen} className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-[#f1f4ef]">{auction.image ? <img src={auction.image} alt={auction.title} className="size-full object-cover" /> : <Activity size={17} />}</button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={onOpen} className="max-w-full truncate text-left text-sm font-semibold text-[#35473c] hover:underline">{auction.title}</button><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${active && rule.autoBidEnabled ? 'bg-[#eaf4e8] text-[#4d764d]' : 'bg-[#f0f2ef] text-[#77837a]'}`}>{active ? rule.autoBidEnabled ? 'Scout on' : 'Paused' : auction.status.toLowerCase().replace('_', ' ')}</span></div><p className="mt-1 truncate text-[10px] text-[#87938b]">Current {currency.format(auction.currentHighestBid)} · Saved max {currency.format(rule.maxBid)} · Step {currency.format(rule.bidStep)}</p></div><div className="grid w-full grid-cols-2 gap-2 sm:w-[190px]"><label className="text-[9px] font-semibold text-[#718075]">Maximum<input aria-label={`Maximum bid for ${auction.title}`} inputMode="decimal" type="number" min={auction.currentHighestBid + 0.01} step="0.01" value={draft.maxBid} onChange={(event) => onDraftChange({ maxBid: event.target.value, confirmed: false })} className="mt-1 h-9 w-full rounded-lg border border-[#dfe7de] px-2 text-xs text-[#334638] outline-none focus:border-[#90aa8d]" /></label><label className="text-[9px] font-semibold text-[#718075]">Bid step<input aria-label={`Bid step for ${auction.title}`} inputMode="decimal" type="number" min="0.01" step="0.01" value={draft.bidStep} onChange={(event) => onDraftChange({ bidStep: event.target.value, confirmed: false })} className="mt-1 h-9 w-full rounded-lg border border-[#dfe7de] px-2 text-xs text-[#334638] outline-none focus:border-[#90aa8d]" /></label></div><div className="flex w-full flex-wrap items-center gap-2 sm:w-auto"><label className="flex items-center gap-2 rounded-lg bg-[#f4f6f2] px-2.5 py-2 text-[10px] font-semibold text-[#647466]"><input type="checkbox" checked={draft.autoBidEnabled && active} disabled={!active} onChange={(event) => onDraftChange({ autoBidEnabled: event.target.checked, confirmed: false })} className="size-3.5 accent-[#456d4c]" />Auto-bid</label>{draft.autoBidEnabled && !rule.autoBidEnabled && <label className="flex min-h-9 flex-1 items-center gap-1.5 text-[9px] leading-3 text-[#718075]"><input type="checkbox" checked={draft.confirmed} onChange={(event) => onDraftChange({ confirmed: event.target.checked })} className="size-3.5 shrink-0 accent-[#456d4c]" />Authorize Scout</label>}<Button variant="secondary" onClick={onSave} disabled={saving || invalidCeiling || needsConsent || (!active && draft.autoBidEnabled)} className="min-h-9 rounded-lg px-3 text-[10px]">Save</Button><button type="button" onClick={onRemove} aria-label={`Remove ${auction.title} from watchlist`} title="Remove from watchlist" className="grid size-9 shrink-0 place-items-center rounded-lg text-[#8b9690] hover:bg-[#faeeeb] hover:text-[#ad493e]"><Trash2 size={15} /></button></div></article>
  return <article className="flex min-w-0 flex-wrap items-center gap-3 p-4 sm:px-5"><button type="button" onClick={onOpen} className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-[#f1f4ef]">{auction.image ? <img src={auction.image} alt={auction.title} className="size-full object-cover" /> : <Activity size={17} />}</button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={onOpen} className="max-w-full truncate text-left text-sm font-semibold text-[#35473c] hover:underline">{auction.title}</button><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${active && rule.autoBidEnabled ? 'bg-[#eaf4e8] text-[#4d764d]' : 'bg-[#f0f2ef] text-[#77837a]'}`}>{active ? rule.autoBidEnabled ? 'Scout on' : 'Paused' : auction.status.toLowerCase().replace('_', ' ')}</span></div><p className="mt-1 truncate text-[10px] text-[#87938b]">Current {currency.format(auction.currentHighestBid)} · Saved max {currency.format(rule.maxBid)} · Step {currency.format(rule.bidStep)}</p></div><div className="grid w-full grid-cols-2 gap-2 sm:w-[190px]"><label className="text-[9px] font-semibold text-[#718075]">Maximum<input aria-label={`Maximum bid for ${auction.title}`} inputMode="decimal" type="number" min={auction.currentHighestBid + 0.01} step="0.01" value={draft.maxBid} onChange={(event) => onDraftChange({ maxBid: event.target.value, confirmed: false })} className="mt-1 h-9 w-full rounded-lg border border-[#dfe7de] px-2 text-xs text-[#334638] outline-none focus:border-[#90aa8d]" /></label><label className="text-[9px] font-semibold text-[#718075]">Bid step<input aria-label={`Bid step for ${auction.title}`} inputMode="decimal" type="number" min="0.01" step="0.01" value={draft.bidStep} onChange={(event) => onDraftChange({ bidStep: event.target.value, confirmed: false })} className="mt-1 h-9 w-full rounded-lg border border-[#dfe7de] px-2 text-xs text-[#334638] outline-none focus:border-[#90aa8d]" /></label></div><div className="flex w-full flex-wrap items-center gap-2 sm:w-auto"><label className="flex items-center gap-2 rounded-lg bg-[#f4f6f2] px-2.5 py-2 text-[10px] font-semibold text-[#647466]"><input type="checkbox" checked={draft.autoBidEnabled && active} disabled={!active} onChange={(event) => onDraftChange({ autoBidEnabled: event.target.checked, confirmed: false })} className="size-3.5 accent-[#456d4c]" />Auto-bid</label>{draft.autoBidEnabled && !draft.confirmed && <label className="flex min-h-9 flex-1 items-center gap-1.5 text-[9px] leading-3 text-[#718075]"><input type="checkbox" checked={draft.confirmed} onChange={(event) => onDraftChange({ confirmed: event.target.checked })} className="size-3.5 shrink-0 accent-[#456d4c]" />Authorize Scout</label>}<Button variant="secondary" onClick={onSave} disabled={saving || invalidCeiling || needsConsent || (!active && draft.autoBidEnabled)} className="min-h-9 rounded-lg px-3 text-[10px]">Save</Button><button type="button" onClick={onRemove} aria-label={`Remove ${auction.title} from watchlist`} title="Remove from watchlist" className="grid size-9 shrink-0 place-items-center rounded-lg text-[#8b9690] hover:bg-[#faeeeb] hover:text-[#ad493e]"><Trash2 size={15} /></button></div></article>
}

function SummaryMetric({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return <div className="rounded-[12px] border border-[#e3eae3] bg-white p-3.5"><div className="flex items-center gap-2 text-xs font-medium text-[#7d8981]"><span className="text-[#648067]">{icon}</span>{label}</div><p className="font-display mt-2 text-2xl font-semibold leading-none text-[#2a3e31]">{value}</p><p className="mt-1.5 text-[10px] text-[#929c95]">{note}</p></div>
}

function EmptyWatchlist({ signedIn, onBrowse }: { signedIn: boolean; onBrowse: () => void }) {
  return <div className="flex flex-col items-center px-5 py-8 text-center"><span className="mb-3 grid size-10 place-items-center rounded-xl bg-[#edf3e9] text-[#648065]"><EyeOff size={18} /></span><h3 className="text-sm font-semibold text-[#3a4e40]">Nothing on your watchlist yet</h3><p className="mt-1 max-w-sm text-xs leading-5 text-[#8a958d]">{signedIn ? 'Find a live auction below, set your max, and decide whether Scout may bid.' : 'Sign in to save auctions and set your own bidding rules.'}</p><button type="button" onClick={onBrowse} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#4e7153]">Browse live auctions <ChevronRight size={13} /></button></div>
}