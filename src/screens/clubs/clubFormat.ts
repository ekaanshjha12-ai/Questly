import type { ClubChallenge, ClubConsequence, TrialKind } from '../../lib/api'
import { REGION_META, REGION_ORDER, regionName as worldRegionName, type RegionId } from '../../data/world'

/** Words for the club system, shared by every club screen. */

/** Region names in map order, for pickers and filters. */
export const REGION_NAMES = Object.fromEntries(REGION_ORDER.map((id) => [id, REGION_META[id].name])) as Record<RegionId, string>

export const regionName = worldRegionName

export function regionAccent(id: string): string {
  return REGION_META[id as RegionId]?.accent ?? '#3fe0a0'
}

export const TRIAL_KIND_LABEL: Record<TrialKind, { label: string; unit: string; min: number; max: number; step: number; hint: string }> = {
  focus_minutes: { label: 'Timed focus', unit: 'minutes', min: 30, max: 1200, step: 30, hint: 'Minutes of focus Questly times after the trials begin.' },
  quests: { label: 'Quests completed', unit: 'quests', min: 1, max: 30, step: 1, hint: 'Any quests finished after the trials begin.' },
  streak: { label: 'Daily streak', unit: 'days', min: 2, max: 30, step: 1, hint: 'A streak of active days in a row.' },
  proof: { label: 'Quests with proof', unit: 'quests', min: 1, max: 10, step: 1, hint: 'Quests completed and verified with a photo or voice note.' },
  duels: { label: 'Duels won', unit: 'duels', min: 1, max: 5, step: 1, hint: 'Duels finished meeting the objective.' },
}

export const CONSEQUENCE_LABEL: Record<ClubConsequence, { label: string; detail: string }> = {
  warning: { label: 'A warning', detail: 'The member is warned. Nothing else changes.' },
  standing: { label: 'Loss of Club XP standing', detail: 'The Club XP the challenge would have paid is taken back from their contribution.' },
  removal: { label: 'Removal from the club', detail: 'The member is removed and can rejoin by passing the entry trials again. The leader is only warned.' },
}

export const VISIBILITY_LABEL: Record<ClubChallenge['visibility'], { label: string; detail: string }> = {
  mandatory: { label: 'Mandatory', detail: 'Every member is in it. Missing it brings the club’s consequence.' },
  optional: { label: 'Optional', detail: 'Members choose to join. No effect on membership.' },
  public: { label: 'Public', detail: 'Anyone on Questly can join — a way to meet the club.' },
}

export const ROLE_LABEL = { owner: 'Leader', officer: 'Officer', member: 'Member' } as const

export function challengeGoal(c: Pick<ClubChallenge, 'kind' | 'target' | 'durationDays'>): string {
  return c.kind === 'focus_minutes' ? `${c.target} minutes of timed focus in ${c.durationDays} days` : `Check in on ${c.target} of ${c.durationDays} days`
}

export function timeLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  if (ms <= 0) return 'Ended'
  const days = Math.floor(ms / 86_400_000)
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`
  const hours = Math.max(1, Math.floor(ms / 3_600_000))
  return `${hours} hour${hours === 1 ? '' : 's'} left`
}
