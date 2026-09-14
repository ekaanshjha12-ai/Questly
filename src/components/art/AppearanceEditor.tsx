import type { ReactNode } from 'react'
import type { Appearance } from '../../lib/api'
import { EYE_SWATCHES, HAIR_SWATCHES, SKIN_SWATCHES } from '../../art/hero'

/**
 * Build, skin, hair and eyes for the pixel hero. Used when a player first
 * makes their character and in the wardrobe afterwards; the server checks
 * every value when the look is saved.
 */

const HAIR_STYLES: Appearance['hair'][] = ['short', 'long', 'bun', 'curly', 'braid', 'bob', 'mohawk', 'shaved']

export default function AppearanceEditor({ value, onChange }: { value: Appearance; onChange: (next: Appearance) => void }) {
  return (
    <div className="space-y-4">
      <Picker label="Build">
        {(['a', 'b'] as const).map((b) => (
          <Choice key={b} active={value.body === b} onClick={() => onChange({ ...value, body: b })} label={b === 'a' ? 'Broad' : 'Slim'} />
        ))}
      </Picker>
      <Picker label="Skin">
        {(Object.keys(SKIN_SWATCHES) as Appearance['skin'][]).map((s) => (
          <Swatch key={s} color={SKIN_SWATCHES[s]} active={value.skin === s} label={s} onClick={() => onChange({ ...value, skin: s })} />
        ))}
      </Picker>
      <Picker label="Hair">
        {HAIR_STYLES.map((h) => (
          <Choice key={h} active={value.hair === h} onClick={() => onChange({ ...value, hair: h })} label={h} />
        ))}
      </Picker>
      <Picker label="Hair colour">
        {(Object.keys(HAIR_SWATCHES) as Appearance['hairColor'][]).map((c) => (
          <Swatch key={c} color={HAIR_SWATCHES[c]} active={value.hairColor === c} label={c} onClick={() => onChange({ ...value, hairColor: c })} />
        ))}
      </Picker>
      <Picker label="Eyes">
        {(Object.keys(EYE_SWATCHES) as Appearance['eyes'][]).map((c) => (
          <Swatch key={c} color={EYE_SWATCHES[c]} active={value.eyes === c} label={c} onClick={() => onChange({ ...value, eyes: c })} />
        ))}
      </Picker>
    </div>
  )
}

function Picker({ label, children }: { label: string; children: ReactNode }) {
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
