import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Box, Coins, Lock, Palette, Sparkles } from 'lucide-react'
import { game, type Appearance, type Inventory, type InventoryItem, type Slot } from '../../lib/api'
import { useGame } from '../../game/GameProvider'
import { useRouter } from '../../app/router'
import { PageHeader } from '../../app/AppShell'
import Button from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { RarityTag, rarityBorder } from '../../components/ui/Tag'
import { messageOf, useToast } from '../../components/ui/Toast'
import HeroSprite from '../../components/art/HeroSprite'
import ItemIcon from '../../components/art/ItemIcon'
import { DEFAULT_APPEARANCE, EYE_SWATCHES, HAIR_SWATCHES, SKIN_SWATCHES } from '../../art/hero'
import { findModel } from '../../data/ranks'

const Avatar3D = lazy(() => import('../../components/Avatar3D'))

const SLOTS: { id: Slot; label: string }[] = [
  { id: 'head', label: 'Headwear' },
  { id: 'clothing', label: 'Clothing' },
  { id: 'back', label: 'Back' },
  { id: 'tool', label: 'Tools' },
  { id: 'pet', label: 'Pets' },
  { id: 'badge', label: 'Badges' },
  { id: 'special', label: 'Special' },
]

const HAIR_STYLES: Appearance['hair'][] = ['short', 'long', 'bun', 'curly', 'braid', 'bob', 'mohawk', 'shaved']

/**
 * The Character Wardrobe: what the hero wears, what is in the vault, and how
 * each locked relic is earned. Ownership comes from the server; equipping and
 * buying go through it, so nothing here can hand the player an item.
 */
export default function WardrobeScreen() {
  const reduce = useReducedMotion()
  const { snapshot, setLook, applyRewards } = useGame()
  const { search } = useRouter()
  const toast = useToast()
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [slot, setSlot] = useState<Slot>(() => (SLOTS.some((s) => s.id === search.get('slot')) ? (search.get('slot') as Slot) : 'head'))
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Appearance>(snapshot?.look.appearance ?? DEFAULT_APPEARANCE)
  const [viewing, setViewing] = useState<InventoryItem | null>(null)

  const load = useCallback(async () => {
    try {
      setInventory(await game.inventory())
      setError(null)
    } catch (err) {
      setError(messageOf(err, 'Could not open your wardrobe.'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (snapshot?.look.appearance && !editing) setDraft(snapshot.look.appearance)
  }, [snapshot?.look.appearance, editing])

  const equipment = inventory?.equipment ?? snapshot?.look.equipment ?? {}
  const previewLook = useMemo(() => ({ appearance: editing ? draft : snapshot?.look.appearance ?? null, equipment }), [editing, draft, snapshot?.look.appearance, equipment])
  const items = (inventory?.items ?? []).filter((i) => i.slot === slot)
  const owned = (inventory?.items ?? []).filter((i) => i.state === 'owned' || i.state === 'equipped').length

  async function equip(item: InventoryItem, on: boolean) {
    setBusy(item.id)
    try {
      const { equipment: next } = await game.equip(item.slot, on ? item.id : null)
      setInventory((inv) =>
        inv
          ? {
              ...inv,
              equipment: next,
              items: inv.items.map((i) =>
                i.slot !== item.slot ? i : { ...i, state: next[i.slot] === i.id ? 'equipped' : i.state === 'equipped' ? 'owned' : i.state },
              ),
            }
          : inv,
      )
      if (snapshot) setLook({ ...snapshot.look, equipment: next })
    } catch (err) {
      toast.error('Could not change that', messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  async function buy(item: InventoryItem) {
    setBusy(item.id)
    try {
      const result = await game.buy(item.id)
      setInventory(result.inventory)
      applyRewards(result.rewards, { includeXp: false })
      if (snapshot) setLook({ ...snapshot.look, equipment: result.inventory.equipment })
      toast.success(`${item.name} is yours`, 'Equipped and ready.')
    } catch (err) {
      toast.error('Could not buy that', messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  async function saveAppearance() {
    setBusy('appearance')
    try {
      const { appearance } = await game.setAppearance(draft)
      if (snapshot) setLook({ ...snapshot.look, appearance })
      setEditing(false)
      toast.success('Your look is saved')
    } catch (err) {
      toast.error('Could not save your look', messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader title="Character Wardrobe" subtitle="Equip the relics you have earned" />

      <section className="panel-raised relative overflow-hidden px-4 pb-4 pt-3" aria-label="Your loadout">
        <div className="flex items-center justify-between">
          <span className="tag border-gold-500/50 bg-gold-500/10 text-gold-300">Active loadout</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-reward-400">
            <Coins className="h-4 w-4" /> {(inventory?.coins ?? snapshot?.progress.coins ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="relative flex justify-center py-2">
          <div className="pointer-events-none absolute inset-x-10 bottom-0 top-4 rounded-full bg-[radial-gradient(ellipse_at_50%_60%,rgba(16,185,129,0.14),transparent_70%)]" />
          <motion.div key={JSON.stringify(previewLook)} initial={reduce ? false : { scale: 0.97, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }}>
            <HeroSprite look={previewLook} height={210} still={Boolean(reduce)} label="Your character" />
          </motion.div>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {owned} of {inventory?.items.length ?? '…'} relics owned
          </span>
          <Button variant="ghost" size="sm" icon={Palette} onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            {editing ? 'Close appearance' : 'Appearance'}
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {editing && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-3 space-y-4 border-t border-ink-700/60 pt-4">
                <Picker label="Build">
                  {(['a', 'b'] as const).map((b) => (
                    <Choice key={b} active={draft.body === b} onClick={() => setDraft({ ...draft, body: b })} label={b === 'a' ? 'Broad' : 'Slim'} />
                  ))}
                </Picker>
                <Picker label="Skin">
                  {(Object.keys(SKIN_SWATCHES) as Appearance['skin'][]).map((s) => (
                    <Swatch key={s} color={SKIN_SWATCHES[s]} active={draft.skin === s} label={s} onClick={() => setDraft({ ...draft, skin: s })} />
                  ))}
                </Picker>
                <Picker label="Hair">
                  {HAIR_STYLES.map((h) => (
                    <Choice key={h} active={draft.hair === h} onClick={() => setDraft({ ...draft, hair: h })} label={h} />
                  ))}
                </Picker>
                <Picker label="Hair colour">
                  {(Object.keys(HAIR_SWATCHES) as Appearance['hairColor'][]).map((c) => (
                    <Swatch key={c} color={HAIR_SWATCHES[c]} active={draft.hairColor === c} label={c} onClick={() => setDraft({ ...draft, hairColor: c })} />
                  ))}
                </Picker>
                <Picker label="Eyes">
                  {(Object.keys(EYE_SWATCHES) as Appearance['eyes'][]).map((c) => (
                    <Swatch key={c} color={EYE_SWATCHES[c]} active={draft.eyes === c} label={c} onClick={() => setDraft({ ...draft, eyes: c })} />
                  ))}
                </Picker>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setEditing(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={saveAppearance} loading={busy === 'appearance'} className="flex-1">
                    Save look
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <div role="tablist" aria-label="Equipment slots" className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {SLOTS.map((s) => {
          const worn = equipment[s.id]
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={slot === s.id}
              onClick={() => setSlot(s.id)}
              className={`flex w-[74px] shrink-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-colors ${
                slot === s.id ? 'border-gold-500/60 bg-gold-500/10' : 'border-ink-700 bg-ink-900 hover:border-ink-500'
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-950/70">
                {worn ? <ItemIcon itemId={worn} size={34} model={s.id === 'special'} /> : <Box className="h-4 w-4 text-slate-600" />}
              </span>
              <span className={`text-[9.5px] font-bold uppercase tracking-[0.08em] ${slot === s.id ? 'text-gold-300' : 'text-slate-400'}`}>{s.label}</span>
            </button>
          )
        })}
      </div>

      <section className="mt-4" aria-label="Relic vault">
        <h2 className="eyebrow mb-2.5">Relic vault</h2>
        {error && !inventory && <ErrorState message={error} onRetry={() => void load()} />}
        {!inventory && !error && <LoadingState lines={4} label="Opening the vault" />}
        {inventory && (
          <ul className="space-y-2">
            {items.map((item, i) => (
              <motion.li key={item.id} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                <div className={`panel flex items-center gap-3 border px-3 py-3 ${item.state === 'equipped' ? 'border-gold-500/50' : ''}`}>
                  <span className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 bg-ink-950/80 ${rarityBorder(item.rarity)} ${item.state === 'locked' ? 'opacity-50 grayscale' : ''}`}>
                    <ItemIcon itemId={item.id} size={44} model={item.model} />
                    {item.state === 'locked' && <Lock className="absolute -bottom-1 -right-1 h-4 w-4 rounded bg-ink-900 p-0.5 text-slate-400" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`truncate text-sm font-semibold ${item.state === 'locked' ? 'text-slate-400' : 'text-slate-100'}`}>{item.name}</p>
                      <RarityTag rarity={item.rarity} />
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{item.description}</p>
                    <p className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold text-slate-400">
                      <Sparkles className="h-3 w-3 text-reward-400" /> {item.source}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {item.state === 'equipped' && (
                      <Button variant="secondary" size="sm" loading={busy === item.id} onClick={() => equip(item, false)}>
                        Unequip
                      </Button>
                    )}
                    {item.state === 'owned' && (
                      <Button size="sm" loading={busy === item.id} onClick={() => equip(item, true)}>
                        Equip
                      </Button>
                    )}
                    {item.state === 'available' && (
                      <Button variant="gold" size="sm" icon={Coins} disabled={!item.affordable} loading={busy === item.id} onClick={() => buy(item)}>
                        {item.price?.toLocaleString()}
                      </Button>
                    )}
                    {item.state === 'locked' && <span className="tag border-ink-600 text-slate-500">Locked</span>}
                    {item.model && item.state !== 'locked' && (
                      <button type="button" onClick={() => setViewing(item)} className="text-[11px] font-semibold text-gold-400 hover:text-gold-300">
                        View 3D
                      </button>
                    )}
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.name} subtitle={viewing ? `${viewing.rarity} special form` : undefined}>
        {viewing && (
          <div className="h-[380px] w-full">
            <Suspense fallback={<LoadingState lines={1} label="Loading 3D model" />}>
              <Avatar3D modelUrl={findModel(viewing.id)?.modelUrl ?? ''} accent="#e2a634" level={snapshot?.progress.level ?? 1} interactive hideBadge />
            </Suspense>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function Picker({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-2">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {children}
      </div>
    </div>
  )
}

function Choice({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`min-h-[34px] rounded-lg border px-3 text-xs font-semibold capitalize ${active ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-ink-600 bg-ink-900 text-slate-300'}`}
    >
      {label}
    </button>
  )
}

function Swatch({ color, active, onClick, label }: { color: string; active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`h-9 w-9 rounded-full border-2 transition-transform ${active ? 'scale-110 border-gold-400' : 'border-ink-600'}`}
      style={{ background: color }}
    />
  )
}
