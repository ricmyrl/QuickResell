import { BadgeCheck, Trophy } from 'lucide-react'
import { Badge } from './Badge'

export function TrustScoreBadge({ score, completedAuctions, noReserveHero = false, compact = false }: { score: number; completedAuctions: number; noReserveHero?: boolean; compact?: boolean }) {
  return <div className="flex flex-wrap items-center gap-2"><Badge className="border border-[#dfe9e2] bg-[#f2f7f3] text-[#376b59"><BadgeCheck size={12} />{Math.round(score)} trust</Badge>{!compact && <span className="text-xs text-[#7b8783]">{completedAuctions} completed</span>}{noReserveHero && <Badge className="bg-[#f0f4c9] text-[#526321]"><Trophy size={11} />No-reserve hero</Badge>}</div>
}
