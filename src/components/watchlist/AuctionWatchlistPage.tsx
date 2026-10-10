import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Activity, BellDot, Eye, EyeOff, ShieldCheck, Trash2, WalletCards } from 'lucide-react'
import type { Auction, AuctionWatchlistRule, BidStrategy } from '../../types'
import { Button } from '../common/Button'
import { useCurrency } from '../../lib/CurrencyContext'

type RuleDraft = {
  maxBid: string
  strategy: BidStrategy
  jumpMultiplier: string
  sniperWindowSeconds: string
  marginOfSafety: string
  autoBidEnabled: boolean
  confirmed: boolean
}
const strategyDescriptions: Record<BidStrategy, string> = {
  STANDARD: 'Raises by the auction’s minimum increment to stay competitive.',
  JUMP_BID: 'Uses a larger step to challenge competing bids sooner.',
  SNIPER: 'Waits until the closing window before bidding.',
  RESERVE_TARGET: 'Targets the seller’s reserve, then returns to standard steps.',
  ANALYST: 'Uses recent market value to avoid bidding above its value cap.',
}
type Props = {
  rules: AuctionWatchlistRule[]
  recentBidAuctionIds: string[]
  loading: boolean
  error: string
  savingId: string | null
  onSave: (auctionRoomId: string, draft: { maxBid: number; bidStep: number; strategy: BidStrategy; jumpMultiplier: number; sniperWindowSeconds: number; marginOfSafety: number; autoBidEnabled: boolean; authorizationConfirmed: boolean }) => Promise<{ emailNotified?: boolean } | void>
  onRemove: (auctionRoomId: string) => Promise<void>
  onOpenAuction: (auction: AuctionWatchlistRule['auction']) => void
  onRequestSignIn: () => void
  onBrowseAuctions: () => void
  signedIn: boolean
  emailConfirmed: boolean
}

function createDraft(rule: AuctionWatchlistRule | undefined, usdToLocal: (amount: number) => number | null): RuleDraft {
  const maxBid = rule?.maxBid
  return {
    maxBid: maxBid === undefined ? '' : String(usdToLocal(maxBid) ?? maxBid),
    strategy: rule?.strategy ?? 'STANDARD',
    jumpMultiplier: String(rule?.jumpMultiplier ?? 2),
    sniperWindowSeconds: String(rule?.sniperWindowSeconds ?? 120),
    marginOfSafety: String((rule?.marginOfSafety ?? 0) * 100),
    autoBidEnabled: rule?.autoBidEnabled ?? false,
    confirmed: rule?.autoBidEnabled ?? false,
  }
}

export function AuctionWatchlistPage({ rules, recentBidAuctionIds, loading, error, savingId, onSave, onRemove, onOpenAuction, onRequestSignIn, onBrowseAuctions, signedIn, emailConfirmed }: Props) {
  const { currency: currencyCode, localToUsd, usdToLocal } = useCurrency()
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({})
  const [scoutAlertMessage, setScoutAlertMessage] = useState<string | null>(null)
  const ruleByAuction = new Map(rules.map((rule) => [rule.auctionRoomId, rule]))
  const draftFor = (auctionId: string) => drafts[auctionId] ?? createDraft(ruleByAuction.get(auctionId), usdToLocal)

  useEffect(() => setDrafts({}), [currencyCode])

  const updateDraft = (auctionId: string, update: Partial<RuleDraft>) => {
    setDrafts((current) => ({ ...current, [auctionId]: { ...draftFor(auctionId), ...update } }))
  }

  const handleSave = async (auction: Auction) => {
    if (!signedIn) {
      onRequestSignIn()
      return
    }
    if (!emailConfirmed) return
    const existingRule = ruleByAuction.get(auction.id)
    const draft = draftFor(auction.id)
    const maxBid = localToUsd(Number(draft.maxBid))
    const bidStep = Math.min(existingRule?.bidStep ?? 6_656.34, maxBid ?? 6_656.34)
    const jumpMultiplier = Number(draft.jumpMultiplier)
    const sniperWindowSeconds = Number(draft.sniperWindowSeconds)
    const marginOfSafetyPercent = Number(draft.marginOfSafety)
    if (maxBid === null || !Number.isFinite(maxBid) || maxBid <= 0 || maxBid > 13_312_670_140) {
      updateDraft(auction.id, { confirmed: false })
      return
    }
    if (!Number.isFinite(jumpMultiplier) || jumpMultiplier < 1.5 || jumpMultiplier > 5
      || !Number.isInteger(sniperWindowSeconds) || sniperWindowSeconds < 1 || sniperWindowSeconds > 3600
      || !Number.isFinite(marginOfSafetyPercent) || marginOfSafetyPercent < 0 || marginOfSafetyPercent > 100) {
      updateDraft(auction.id, { confirmed: false })
      return
    }
    if (draft.autoBidEnabled && !existingRule?.autoBidEnabled && !draft.confirmed) return
    const result = await onSave(auction.id, {
      maxBid,
      bidStep,
      strategy: draft.strategy,
      jumpMultiplier,
      sniperWindowSeconds,
      marginOfSafety: marginOfSafetyPercent / 100,
      autoBidEnabled: draft.autoBidEnabled,
      authorizationConfirmed: draft.confirmed || Boolean(existingRule?.autoBidEnabled),
    })
    setScoutAlertMessage(result?.emailNotified ? 'Scout alert email sent to your inbox.' : null)
    setDrafts((current) => ({ ...current, [auction.id]: { ...draft, confirmed: draft.autoBidEnabled } }))
  }

  const recentBidOrder = new Map(recentBidAuctionIds.map((auctionId, index) => [auctionId, index]))
  const trackedRules = rules.filter((rule) => rule.auction.status === 'ACTIVE').sort((left, right) => {
    const leftRecent = recentBidOrder.get(left.auctionRoomId) ?? Number.MAX_SAFE_INTEGER
    const rightRecent = recentBidOrder.get(right.auctionRoomId) ?? Number.MAX_SAFE_INTEGER
    return leftRecent - rightRecent || Number(right.autoBidEnabled) - Number(left.autoBidEnabled)
  })

  return <section className="min-w-0 pb-4 enter-up">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-2 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#647b62]"><Eye size={13} /> Personal watchlist</p><h1 className="font-display text-[30px] font-semibold leading-tight text-[#20382c] sm:text-[34px]">Set your price. Scout watches.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#78867d]">Save auctions, set a hard maximum, and choose a bidding strategy for each saved auction. Your rules stay yours.</p></div>
      <div className="flex items-center gap-2 rounded-xl border border-[#e0e8df] bg-white px-3 py-2 text-xs text-[#708074]"><ShieldCheck size={15} className="text-[#5a805a]" /> Bids never exceed your max</div>
    </header>

    {!signedIn && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8dfc8] bg-[#fffaf0] px-4 py-3"><p className="text-sm text-[#64573c]">Sign in and confirm your email to save watchlists and enable Scout bids.</p><Button variant="secondary" onClick={onRequestSignIn} className="min-h-9 px-3 text-xs">Sign in</Button></div>}
    {signedIn && !emailConfirmed && <div role="status" className="mb-5 rounded-xl border border-[#e8dfc8] bg-[#fffaf0] px-4 py-3 text-sm text-[#64573c]">Confirm your email before saving watchlist rules or enabling bids.</div>}
    {error && <div role="alert" className="mb-5 rounded-xl border border-[#efd7d2] bg-white px-4 py-3 text-sm text-[#a04b3f]">{error}</div>}
    {scoutAlertMessage && <div role="status" className="mb-5 rounded-xl border border-[#dfe8dc] bg-[#edf7ee] px-4 py-3 text-sm font-medium text-[#2f5335]">{scoutAlertMessage}</div>}

    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <SummaryMetric icon={<Eye size={16} />} label="Watching" value={trackedRules.length.toString()} note="Live auctions saved" />
      <SummaryMetric icon={<Activity size={16} />} label="Scout rules" value={trackedRules.filter((rule) => rule.autoBidEnabled).length.toString()} note="Currently enabled" />
      <div className="col-span-2 rounded-[12px] border border-[#dfe8dc] bg-[#eef4e9] p-4 sm:col-span-1"><div className="flex items-center gap-2 text-xs font-medium text-[#657a65]"><WalletCards size={16} /> Your guardrail</div><p className="font-display mt-2 text-sm font-semibold text-[#35503a]">You choose the ceiling</p><p className="mt-1 text-[11px] leading-4 text-[#788878]">Scout follows the system increment schedule and never exceeds your maximum.</p></div>
    </div>

    <section className="mb-7 overflow-hidden rounded-[14px] border border-[#e2e9e2] bg-white">
      <div className="flex items-center justify-between border-b border-[#edf1ed] px-4 py-4 sm:px-5"><div><h2 className="font-display text-base font-semibold text-[#293e31]">Your watchlist</h2><p className="mt-1 text-xs text-[#879289]">Choose a bidding strategy on each saved auction. Save auctions from the live feed to add them here.</p></div><span className="rounded-full bg-[#edf4eb] px-2.5 py-1 text-xs font-bold text-[#5d795d]">{trackedRules.length}</span></div>
      {recentBidAuctionIds.length > 0 && <p role="status" className="flex items-center gap-2 border-b border-[#edf1ed] bg-[#f4f8ec] px-4 py-2.5 text-xs font-medium text-[#587448]"><BellDot size={15} />{recentBidAuctionIds.length === 1 ? 'A watched auction has a new bid. It has moved to the top.' : 'Watched auctions have new bids. Updated auctions have moved to the top.'}</p>}
      {loading ? <p className="px-5 py-8 text-center text-sm text-[#869188]">Loading your watchlist…</p> : trackedRules.length ? <div className="divide-y divide-[#edf1ed]">{trackedRules.map((rule) => <AuctionRuleCard key={rule.id} auction={rule.auction} rule={rule} draft={draftFor(rule.auctionRoomId)} onDraftChange={(update) => updateDraft(rule.auctionRoomId, update)} onSave={() => void handleSave(rule.auction)} onRemove={() => void onRemove(rule.auctionRoomId)} onOpen={() => onOpenAuction(rule.auction)} saving={savingId === rule.auctionRoomId} />)}</div> : <EmptyWatchlist signedIn={signedIn} onBrowse={onBrowseAuctions} />}
    </section>

  </section>
}

function AuctionRuleCard({ auction, rule, draft, onDraftChange, onSave, onRemove, onOpen, saving }: { auction: Auction; rule: AuctionWatchlistRule; draft: RuleDraft; onDraftChange: (update: Partial<RuleDraft>) => void; onSave: () => void; onRemove: () => void; onOpen: () => void; saving: boolean }) {
  const { formatUsd, usdToLocal } = useCurrency()
  const currency = { format: formatUsd }
  const active = auction.status === 'ACTIVE'
  const maxBid = Number(draft.maxBid)
  const currentBidLocal = usdToLocal(auction.currentHighestBid) ?? auction.currentHighestBid
  const invalidCeiling = active && draft.autoBidEnabled && maxBid <= currentBidLocal
  const needsConsent = draft.autoBidEnabled && !rule.autoBidEnabled && !draft.confirmed
  return (
    <article className="flex min-w-0 flex-wrap items-center gap-3 p-4 sm:px-5">
      <button type="button" onClick={onOpen} className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-[#f1f4ef]">
        {auction.image ? <img src={auction.image} alt={auction.title} className="size-full object-cover" loading="lazy" decoding="async" /> : <Activity size={17} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onOpen} className="max-w-full truncate text-left text-sm font-semibold text-[#35473c] hover:underline">{auction.title}</button>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${active && rule.autoBidEnabled ? 'bg-[#eaf4e8] text-[#4d764d]' : 'bg-[#f0f2ef] text-[#77837a]'}`}>
            {active ? rule.autoBidEnabled ? 'Scout on' : 'Paused' : auction.status.toLowerCase().replace('_', ' ')}
          </span>
        </div>
        <p className="mt-1 truncate text-[10px] text-[#87938b]">
          Current {currency.format(auction.currentHighestBid)} · Saved max {currency.format(rule.maxBid)} · {draft.strategy.replace('_', ' ')}
        </p>
      </div>
      <div className="grid w-full grid-cols-1 gap-2 sm:w-[100px]">
        <label className="text-[9px] font-semibold text-[#718075]">Maximum
          <input aria-label={`Maximum bid for ${auction.title}`} inputMode="decimal" type="number" min={auction.currentHighestBid + 0.01} step="0.01" value={draft.maxBid} onChange={(event) => onDraftChange({ maxBid: event.target.value, confirmed: false })} className="mt-1 h-9 w-full rounded-lg border border-[#dfe7de] px-2 text-xs text-[#334638] outline-none focus:border-[#90aa8d]" />
        </label>
      </div>
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-[11px] font-semibold text-[#526c58]">Bidding strategy
          <select aria-label={`Bidding strategy for ${auction.title}`} value={draft.strategy} onChange={(event) => onDraftChange({ strategy: event.target.value as BidStrategy, confirmed: false })} className="app-select mt-1 h-10 w-full rounded-lg border border-[#cbd9c9] bg-[#f8fbf7] px-2 text-sm font-medium text-[#293e31] outline-none focus:border-[#78977a]">
            <option value="STANDARD">Standard</option>
            <option value="JUMP_BID">Jump bid</option>
            <option value="SNIPER">Sniper</option>
            <option value="RESERVE_TARGET">Reserve target</option>
            <option value="ANALYST">Analyst</option>
          </select>
          <span className="mt-1 block text-[10px] font-normal leading-4 text-[#77867b]">{strategyDescriptions[draft.strategy]}</span>
        </label>
        {draft.strategy === 'JUMP_BID' && <label className="text-[9px] font-semibold text-[#718075]">Jump multiplier
          <input aria-label={`Jump multiplier for ${auction.title}`} type="number" min="1.5" max="5" step="0.1" value={draft.jumpMultiplier} onChange={(event) => onDraftChange({ jumpMultiplier: event.target.value, confirmed: false })} className="mt-1 h-9 w-full rounded-lg border border-[#dfe7de] px-2 text-xs text-[#334638]" />
        </label>}
        {draft.strategy === 'SNIPER' && <label className="text-[9px] font-semibold text-[#718075]">Sniper window (seconds)
          <input aria-label={`Sniper window for ${auction.title}`} type="number" min="1" max="3600" step="1" value={draft.sniperWindowSeconds} onChange={(event) => onDraftChange({ sniperWindowSeconds: event.target.value, confirmed: false })} className="mt-1 h-9 w-full rounded-lg border border-[#dfe7de] px-2 text-xs text-[#334638]" />
        </label>}
        {draft.strategy === 'ANALYST' && <label className="text-[9px] font-semibold text-[#718075]">Margin of safety (%)
          <input aria-label={`Margin of safety for ${auction.title}`} type="number" min="0" max="100" step="1" value={draft.marginOfSafety} onChange={(event) => onDraftChange({ marginOfSafety: event.target.value, confirmed: false })} className="mt-1 h-9 w-full rounded-lg border border-[#dfe7de] px-2 text-xs text-[#334638]" />
        </label>}
      </div>
      {auction.platformFeeEnabled && <p className="w-full text-[10px] leading-4 text-[#87938b]">After every 2 accepted bids, the amount of the second increase is deducted from the seller's proceeds as QuickResell's fee. Automated jump bids count once; the winner pays the displayed bid.</p>}
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <label className="flex items-center gap-2 rounded-lg bg-[#f4f6f2] px-2.5 py-2 text-[10px] font-semibold text-[#647466]">
          <input type="checkbox" checked={draft.autoBidEnabled && active} disabled={!active} onChange={(event) => onDraftChange({ autoBidEnabled: event.target.checked, confirmed: false })} className="size-3.5 accent-[#456d4c]" />Auto-bid
        </label>
        {draft.autoBidEnabled && !rule.autoBidEnabled && <label className="flex min-h-9 flex-1 items-center gap-1.5 text-[9px] leading-3 text-[#718075]">
          <input type="checkbox" checked={draft.confirmed} onChange={(event) => onDraftChange({ confirmed: event.target.checked })} className="size-3.5 shrink-0 accent-[#456d4c]" />Authorize Scout
        </label>}
        <Button variant="secondary" onClick={onSave} disabled={saving || invalidCeiling || needsConsent || (!active && draft.autoBidEnabled)} className="min-h-9 rounded-lg px-3 text-[10px]">Save</Button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${auction.title} from watchlist`} title="Remove from watchlist" className="grid size-9 shrink-0 place-items-center rounded-lg text-[#8b9690] hover:bg-[#faeeeb] hover:text-[#ad493e]"><Trash2 size={15} /></button>
      </div>
    </article>
  )
}

function SummaryMetric({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return <div className="rounded-[12px] border border-[#e3eae3] bg-white p-3.5"><div className="flex items-center gap-2 text-xs font-medium text-[#7d8981]"><span className="text-[#648067]">{icon}</span>{label}</div><p className="font-display mt-2 text-2xl font-semibold leading-none text-[#2a3e31]">{value}</p><p className="mt-1.5 text-[10px] text-[#929c95]">{note}</p></div>
}

function EmptyWatchlist({ signedIn, onBrowse }: { signedIn: boolean; onBrowse: () => void }) {
  return <div className="flex flex-col items-center px-5 py-8 text-center"><span className="mb-3 grid size-10 place-items-center rounded-xl bg-[#edf3e9] text-[#648065]"><EyeOff size={18} /></span><h3 className="text-sm font-semibold text-[#3a4e40]">Nothing on your watchlist yet</h3><p className="mt-1 max-w-sm text-xs leading-5 text-[#8a958d]">{signedIn ? 'Add a live auction from the auction feed. You can set a max and Scout rule after saving it.' : 'Sign in to save auctions and set your own bidding rules.'}</p>{signedIn && <button type="button" onClick={onBrowse} className="mt-3 text-xs font-semibold text-[#4e7153]">Browse live auctions</button>}</div>
}