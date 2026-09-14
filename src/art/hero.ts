import type { Appearance, Look, Slot } from '../lib/api'
import { block, cached, dot, erase, makeCanvas, mix, outline, runs, tone, type Ctx } from './pixel'

/**
 * The player's character, drawn in pixels.
 *
 * A 32 × 40 figure built in layers — anything worn on the back first, then
 * legs, body, clothing, face, hair, headwear, the tool in hand and the pet at
 * the feet — outlined as one silhouette and shown large. Each frame is cached
 * by look, so the same hero in a feed of fifty posts is drawn once.
 *
 * Two frames are produced side by side, eyes open and eyes closed, for a slow
 * idle blink done in CSS.
 */

export const HERO_W = 32
export const HERO_H = 40
const OUTLINE = '#17110e'

export const DEFAULT_APPEARANCE: Appearance = { body: 'b', skin: 'fair', hair: 'long', hairColor: 'auburn', eyes: 'green' }

const SKIN: Record<Appearance['skin'], string> = {
  porcelain: '#f7dccb',
  fair: '#f0c6a3',
  tan: '#d89f6e',
  olive: '#bf895b',
  brown: '#8f5b37',
  deep: '#5d3a24',
}

const HAIR: Record<Appearance['hairColor'], string> = {
  black: '#2a2320',
  brown: '#6b4428',
  auburn: '#9c4123',
  blonde: '#e3bf62',
  silver: '#c9ced4',
  teal: '#2b9894',
  plum: '#6f3c80',
  ember: '#d4562c',
}

const EYES: Record<Appearance['eyes'], string> = {
  dark: '#2b1d16',
  blue: '#3f78c8',
  green: '#3a9a5a',
  amber: '#c88a2c',
}

export const SKIN_SWATCHES = SKIN
export const HAIR_SWATCHES = HAIR
export const EYE_SWATCHES = EYES

interface Palette {
  skin: string
  skinShade: string
  hair: string
  hairShade: string
  hairLight: string
  eyes: string
}

function paletteFor(a: Appearance): Palette {
  const skin = SKIN[a.skin] ?? SKIN.fair
  const hair = HAIR[a.hairColor] ?? HAIR.brown
  return {
    skin,
    skinShade: tone(skin, -0.16),
    hair,
    hairShade: tone(hair, -0.28),
    hairLight: tone(hair, 0.28),
    eyes: EYES[a.eyes] ?? EYES.dark,
  }
}

/* --- the body ------------------------------------------------------------ */

function drawLegs(ctx: Ctx) {
  const pants = '#3b3f4a'
  const pantsShade = '#2c2f38'
  block(ctx, 11, 29, 20, 30, pants)
  block(ctx, 11, 31, 14, 34, pants)
  block(ctx, 17, 31, 20, 34, pants)
  block(ctx, 14, 31, 14, 34, pantsShade)
  block(ctx, 20, 31, 20, 34, pantsShade)
  const boot = '#4d3527'
  const bootShade = '#35241a'
  block(ctx, 10, 34, 14, 36, boot)
  block(ctx, 17, 34, 21, 36, boot)
  block(ctx, 10, 36, 14, 36, bootShade)
  block(ctx, 17, 36, 21, 36, bootShade)
  dot(ctx, 11, 34, tone(boot, 0.2))
  dot(ctx, 18, 34, tone(boot, 0.2))
}

function torsoSpan(body: Appearance['body']) {
  return body === 'a' ? { l: 10, r: 21, armL: [7, 9], armR: [22, 24] } : { l: 11, r: 20, armL: [8, 10], armR: [21, 23] }
}

function drawTorso(ctx: Ctx, a: Appearance, p: Palette) {
  const t = torsoSpan(a.body)
  const shirt = '#5f6b73'
  block(ctx, t.l, 19, t.r, 28, shirt)
  block(ctx, t.r - 1, 20, t.r, 28, tone(shirt, -0.2))
  block(ctx, t.armL[0], 20, t.armL[1], 27, shirt)
  block(ctx, t.armR[0], 20, t.armR[1], 27, tone(shirt, -0.2))
  // hands
  block(ctx, t.armL[0], 28, t.armL[1], 29, p.skin)
  block(ctx, t.armR[0], 28, t.armR[1], 29, p.skinShade)
  // neck
  block(ctx, 14, 18, 17, 19, p.skinShade)
  // belt
  block(ctx, t.l, 28, t.r, 28, '#3a2a1f')
  dot(ctx, 15, 28, '#c9a14a')
}

function drawHead(ctx: Ctx, p: Palette, blink: boolean) {
  runs(ctx, 6, [[12, 19], [11, 20], [10, 21], [10, 21], [10, 21], [10, 21], [10, 21], [10, 21], [10, 21], [10, 21], [11, 20], [12, 19]], p.skin)
  // shade along the right and under the chin
  block(ctx, 21, 9, 21, 15, p.skinShade)
  block(ctx, 14, 17, 19, 17, p.skinShade)
  dot(ctx, 20, 16, p.skinShade)
  // ears
  block(ctx, 9, 11, 9, 13, p.skin)
  block(ctx, 22, 11, 22, 13, p.skinShade)
  // eyes
  if (blink) {
    block(ctx, 12, 13, 13, 13, tone(p.skin, -0.45))
    block(ctx, 18, 13, 19, 13, tone(p.skin, -0.45))
  } else {
    block(ctx, 12, 12, 13, 13, p.eyes)
    block(ctx, 18, 12, 19, 13, p.eyes)
    dot(ctx, 12, 12, '#ffffff')
    dot(ctx, 18, 12, '#ffffff')
    dot(ctx, 13, 13, tone(p.eyes, -0.4))
    dot(ctx, 19, 13, tone(p.eyes, -0.4))
  }
  // cheeks and mouth
  dot(ctx, 11, 14, mix(p.skin, '#e8746a', 0.35))
  dot(ctx, 20, 14, mix(p.skin, '#e8746a', 0.35))
  block(ctx, 15, 15, 16, 15, tone(p.skin, -0.32))
}

/* --- hair ----------------------------------------------------------------- */

function hairBack(ctx: Ctx, a: Appearance, p: Palette) {
  if (a.hair === 'long') {
    block(ctx, 9, 9, 22, 24, p.hairShade)
    runs(ctx, 25, [[10, 21], [11, 20]], p.hairShade)
  } else if (a.hair === 'braid') {
    for (let y = 14; y <= 27; y += 1) block(ctx, 22, y, 23, y, y % 3 === 0 ? p.hairShade : p.hair)
    block(ctx, 22, 28, 23, 28, '#c9a14a')
  } else if (a.hair === 'bob') {
    block(ctx, 9, 9, 22, 16, p.hairShade)
  } else if (a.hair === 'curly') {
    block(ctx, 8, 8, 23, 15, p.hairShade)
  }
}

function hairFront(ctx: Ctx, a: Appearance, p: Palette) {
  const { hair, hairShade, hairLight } = p
  switch (a.hair) {
    case 'shaved':
      runs(ctx, 6, [[12, 19], [11, 20], [10, 21]], mix(p.skin, hair, 0.55))
      break
    case 'mohawk':
      runs(ctx, 6, [[12, 19], [11, 20]], mix(p.skin, hair, 0.35))
      block(ctx, 14, 1, 17, 8, hair)
      block(ctx, 17, 1, 17, 8, hairShade)
      dot(ctx, 15, 2, hairLight)
      break
    case 'bun':
      block(ctx, 13, 1, 18, 5, hair)
      block(ctx, 17, 2, 18, 5, hairShade)
      dot(ctx, 14, 2, hairLight)
      runs(ctx, 5, [[12, 19], [11, 20], [10, 21], [10, 21], [10, 21]], hair)
      block(ctx, 10, 10, 10, 12, hair)
      block(ctx, 21, 10, 21, 11, hairShade)
      block(ctx, 12, 6, 14, 6, hairLight)
      break
    case 'curly':
      runs(ctx, 3, [[12, 19], [10, 21], [9, 22], [8, 23], [8, 23], [8, 23], [8, 23], [8, 11], [8, 10], [8, 9]], hair)
      for (const [x, y] of [[9, 5], [12, 4], [16, 3], [20, 4], [22, 6], [11, 7], [15, 6], [19, 7]]) dot(ctx, x, y, hairLight)
      for (const [x, y] of [[21, 8], [22, 9], [23, 8], [18, 9], [13, 9]]) dot(ctx, x, y, hairShade)
      block(ctx, 21, 10, 23, 12, hair)
      break
    case 'bob':
      runs(ctx, 4, [[12, 19], [10, 21], [9, 22], [9, 22], [9, 22], [9, 22]], hair)
      block(ctx, 9, 10, 10, 16, hair)
      block(ctx, 21, 10, 22, 16, hairShade)
      block(ctx, 11, 10, 20, 10, hair)
      block(ctx, 12, 5, 15, 5, hairLight)
      break
    case 'long':
      runs(ctx, 4, [[12, 19], [10, 21], [9, 22], [9, 22], [9, 22], [9, 22]], hair)
      block(ctx, 9, 10, 10, 20, hair)
      block(ctx, 21, 10, 22, 20, hairShade)
      block(ctx, 11, 10, 14, 10, hair)
      dot(ctx, 11, 11, hair)
      block(ctx, 12, 5, 15, 5, hairLight)
      dot(ctx, 10, 12, hairLight)
      break
    case 'braid':
      runs(ctx, 4, [[12, 19], [10, 21], [9, 22], [9, 22], [9, 22], [10, 21]], hair)
      block(ctx, 11, 10, 13, 10, hair)
      block(ctx, 9, 10, 9, 13, hair)
      block(ctx, 21, 10, 22, 14, hairShade)
      block(ctx, 12, 5, 15, 5, hairLight)
      break
    case 'short':
    default:
      runs(ctx, 4, [[12, 19], [10, 21], [9, 22], [9, 22], [9, 22], [10, 21]], hair)
      block(ctx, 11, 10, 14, 10, hair)
      dot(ctx, 11, 11, hair)
      block(ctx, 9, 10, 9, 12, hair)
      block(ctx, 21, 10, 22, 11, hairShade)
      block(ctx, 12, 5, 16, 5, hairLight)
      block(ctx, 17, 9, 20, 9, hairShade)
      break
  }
}

/* --- items ------------------------------------------------------------------ */

type Draw = (ctx: Ctx, a: Appearance, p: Palette) => void

interface ItemArt {
  /** Behind the body. */
  back?: Draw
  /** Over the body. */
  front?: Draw
  /** After the outline — light that should not get an edge. */
  glow?: Draw
  /** Hides the hair when worn (hoods, crowns keep hair). */
  hidesHair?: boolean
}

function clothing(base: string, opts: { shade?: number; trim?: string; long?: boolean; inner?: string; extra?: Draw }): ItemArt {
  return {
    front(ctx, a, p) {
      const t = torsoSpan(a.body)
      const shade = tone(base, opts.shade ?? -0.22)
      block(ctx, t.l, 19, t.r, 28, base)
      block(ctx, t.r - 2, 20, t.r, 28, shade)
      block(ctx, t.armL[0], 20, t.armL[1], 26, base)
      block(ctx, t.armR[0], 20, t.armR[1], 26, shade)
      if (opts.trim) {
        block(ctx, t.armL[0], 26, t.armL[1], 26, opts.trim)
        block(ctx, t.armR[0], 26, t.armR[1], 26, opts.trim)
      }
      if (opts.inner) block(ctx, 15, 19, 16, 27, opts.inner)
      else {
        block(ctx, 14, 19, 17, 19, tone(base, -0.35))
        dot(ctx, 15, 20, p.skinShade)
        dot(ctx, 16, 20, p.skinShade)
      }
      if (opts.long) {
        runs(ctx, 29, [[t.l, t.r], [t.l - 1, t.r + 1], [t.l - 1, t.r + 1], [t.l - 1, t.r + 1], [t.l - 1, t.r + 1], [t.l, t.r]], base)
        block(ctx, t.r - 1, 29, t.r + 1, 33, shade)
        block(ctx, 15, 30, 16, 34, tone(base, -0.3))
      } else {
        block(ctx, t.l, 28, t.r, 28, '#3a2a1f')
        dot(ctx, 15, 28, '#c9a14a')
      }
      opts.extra?.(ctx, a, p)
    },
  }
}

const ITEM_ART: Record<string, ItemArt> = {
  // --- clothing ---
  plain_tunic: clothing('#7c6a52', { trim: '#9c876a' }),
  ranger_jacket: clothing('#3f6a49', {
    inner: '#c9b98f',
    extra(ctx) {
      block(ctx, 12, 24, 13, 25, '#2d4c35')
      block(ctx, 18, 24, 19, 25, '#2d4c35')
      block(ctx, 13, 19, 14, 21, '#2a3b2e')
      block(ctx, 17, 19, 18, 21, '#2a3b2e')
    },
  }),
  scholar_robe: clothing('#2f4a7a', {
    long: true,
    trim: '#d9b25a',
    extra(ctx) {
      block(ctx, 15, 20, 16, 34, '#d9b25a')
      block(ctx, 14, 19, 17, 19, '#d9b25a')
    },
  }),
  forge_apron: clothing('#8c4a2e', {
    extra(ctx, a) {
      const t = torsoSpan(a.body)
      block(ctx, t.l + 1, 21, t.r - 1, 32, '#6b5847')
      block(ctx, t.r - 2, 21, t.r - 1, 32, '#54453a')
      block(ctx, 13, 26, 18, 28, '#57483b')
      block(ctx, 12, 19, 12, 21, '#6b5847')
      block(ctx, 19, 19, 19, 21, '#6b5847')
    },
  }),
  architect_hoodie: {
    back(ctx) {
      runs(ctx, 16, [[10, 21], [9, 22], [9, 22], [10, 21]], '#2b3035')
    },
    front: clothing('#3c4148', {
      extra(ctx) {
        block(ctx, 14, 21, 14, 24, '#d8d2c4')
        block(ctx, 17, 21, 17, 24, '#d8d2c4')
        block(ctx, 12, 25, 19, 27, '#33373d')
        block(ctx, 12, 25, 19, 25, '#4a5058')
      },
    }).front,
  },
  duelist_coat: clothing('#8e2b2b', {
    long: true,
    trim: '#e3b34a',
    extra(ctx) {
      for (const y of [21, 23, 25]) dot(ctx, 15, y, '#e3b34a')
      block(ctx, 16, 20, 16, 33, '#5c1b1b')
    },
  }),
  sage_vestments: clothing('#e7e1d3', {
    long: true,
    shade: -0.16,
    trim: '#d9b25a',
    extra(ctx, a) {
      const t = torsoSpan(a.body)
      for (let i = 0; i <= t.r - t.l; i += 1) dot(ctx, t.l + i, 20 + Math.floor(i * 0.75), '#2e9c6a')
      for (let i = 0; i <= t.r - t.l; i += 1) dot(ctx, t.l + i, 21 + Math.floor(i * 0.75), '#237a53')
      block(ctx, 15, 29, 16, 34, '#d9b25a')
    },
  }),

  // --- head ---
  traveler_cap: {
    front(ctx) {
      runs(ctx, 3, [[12, 19], [11, 20], [10, 21], [10, 21], [10, 21], [10, 21]], '#7a5a3a')
      block(ctx, 17, 4, 21, 8, '#5f4530')
      block(ctx, 8, 9, 23, 9, '#5a4230')
      block(ctx, 12, 4, 14, 4, '#9a7650')
      dot(ctx, 15, 3, '#c9a14a')
    },
  },
  night_owl_beanie: {
    hidesHair: false,
    front(ctx) {
      runs(ctx, 4, [[12, 19], [11, 20], [10, 21], [10, 21], [10, 21]], '#2e3a5c')
      block(ctx, 10, 8, 21, 9, '#44527a')
      for (let x = 11; x <= 20; x += 2) dot(ctx, x, 9, '#2e3a5c')
      block(ctx, 14, 1, 17, 3, '#e8e4da')
      dot(ctx, 17, 3, '#c5c0b4')
    },
  },
  scholar_hood: {
    hidesHair: true,
    back(ctx) {
      runs(ctx, 15, [[8, 23], [8, 23], [9, 22], [10, 21]], '#243a62')
    },
    front(ctx) {
      runs(ctx, 3, [[12, 19], [10, 21], [9, 22], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [9, 22]], '#2f4a7a')
      erase(ctx, 11, 9, 20, 17)
      block(ctx, 21, 5, 23, 16, '#243a62')
      block(ctx, 10, 8, 21, 8, '#d9b25a')
    },
  },
  builder_goggles: {
    front(ctx) {
      block(ctx, 9, 8, 22, 9, '#5a4230')
      for (const x0 of [11, 17]) {
        block(ctx, x0, 6, x0 + 3, 9, '#8a8f94')
        block(ctx, x0 + 1, 7, x0 + 2, 8, '#f2b33d')
        dot(ctx, x0 + 1, 7, '#fde4a0')
      }
    },
  },
  focus_circlet: {
    front(ctx) {
      block(ctx, 10, 8, 21, 8, '#c8cdd2')
      block(ctx, 10, 9, 21, 9, '#9aa1a8')
      block(ctx, 15, 7, 16, 8, '#2fd39a')
    },
    glow(ctx) {
      ctx.fillStyle = 'rgba(47, 211, 154, 0.35)'
      ctx.fillRect(13, 5, 6, 5)
    },
  },
  alchemist_hood: {
    hidesHair: true,
    back(ctx) {
      runs(ctx, 14, [[7, 24], [7, 24], [8, 23], [9, 22], [10, 21]], '#1f423e')
      block(ctx, 21, 1, 24, 5, '#1f423e')
    },
    front(ctx) {
      runs(ctx, 2, [[13, 18], [11, 21], [10, 22], [9, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [9, 22], [9, 22]], '#2e5d57')
      block(ctx, 19, 2, 23, 6, '#24504a')
      erase(ctx, 11, 9, 20, 17)
      for (const [x, y] of [[10, 9], [10, 10], [21, 9], [21, 10], [11, 8], [20, 8], [12, 7], [19, 7], [13, 7], [18, 7], [14, 7], [15, 7], [16, 7], [17, 7]]) dot(ctx, x, y, '#e3b34a')
      for (const [x, y] of [[9, 13], [22, 12], [9, 16], [22, 15]]) dot(ctx, x, y, '#f4d27a')
    },
    glow(ctx) {
      ctx.fillStyle = 'rgba(227, 179, 74, 0.25)'
      ctx.fillRect(8, 6, 16, 3)
    },
  },
  crown_of_resolve: {
    front(ctx) {
      block(ctx, 11, 5, 20, 7, '#e0b040')
      for (const x of [11, 14, 17, 20]) block(ctx, x, 2, x, 4, '#e0b040')
      block(ctx, 12, 3, 12, 4, '#e0b040')
      block(ctx, 19, 3, 19, 4, '#e0b040')
      block(ctx, 15, 1, 16, 4, '#e0b040')
      block(ctx, 18, 5, 20, 7, '#b58727')
      dot(ctx, 15, 6, '#d6453c')
      dot(ctx, 12, 6, '#2fd39a')
      dot(ctx, 19, 6, '#2fd39a')
    },
  },

  // --- back ---
  satchel: {
    front(ctx) {
      for (let i = 0; i < 10; i += 1) dot(ctx, 20 - i, 19 + i, '#5a4230')
      block(ctx, 5, 26, 10, 31, '#7a5a3a')
      block(ctx, 5, 26, 10, 27, '#5f4530')
      dot(ctx, 7, 28, '#c9a14a')
    },
  },
  scroll_quiver: {
    back(ctx) {
      block(ctx, 21, 12, 25, 25, '#6b4a30')
      block(ctx, 24, 12, 25, 25, '#523825')
      block(ctx, 21, 9, 22, 12, '#eadbb8')
      block(ctx, 23, 8, 24, 12, '#eadbb8')
      dot(ctx, 21, 11, '#b8352c')
      dot(ctx, 24, 10, '#b8352c')
    },
    front(ctx) {
      for (let i = 0; i < 10; i += 1) dot(ctx, 11 + i, 19 + i, '#6b4a30')
    },
  },
  traveler_cloak: {
    back(ctx) {
      runs(ctx, 17, [[9, 22], [8, 23], [7, 24], [7, 24], [6, 25], [6, 25], [6, 25], [6, 25], [6, 25], [6, 25], [6, 25], [6, 25], [6, 25], [6, 25], [7, 24], [7, 24], [8, 23], [9, 22], [10, 21]], '#4d3d31')
      block(ctx, 22, 20, 25, 34, '#3a2e25')
    },
    front(ctx) {
      block(ctx, 14, 19, 17, 19, '#4d3d31')
      block(ctx, 15, 19, 16, 20, '#e3b34a')
    },
  },
  ember_cape: {
    back(ctx) {
      runs(ctx, 18, [[9, 22], [7, 24], [6, 25], [5, 26], [5, 26], [5, 26], [5, 26], [5, 26], [5, 26], [5, 26], [5, 26], [5, 26], [5, 26], [6, 25], [6, 25], [7, 24], [8, 23], [9, 22]], '#b8452a')
      runs(ctx, 31, [[5, 26], [6, 25], [6, 25], [7, 24], [8, 23]], '#e36f36')
      block(ctx, 23, 20, 26, 33, '#8e3420')
    },
    glow(ctx) {
      for (const [x, y] of [[4, 30], [27, 28], [6, 36], [25, 36], [3, 25]]) {
        ctx.fillStyle = 'rgba(255, 170, 80, 0.8)'
        ctx.fillRect(x, y, 1, 1)
      }
    },
  },
  starlight_wings: {
    back(ctx) {
      runs(ctx, 8, [[2, 6], [1, 8], [0, 9], [0, 10], [0, 10], [1, 10], [1, 10], [2, 10], [3, 10], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10]], '#cfe3f7')
      runs(ctx, 8, [[25, 29], [23, 30], [22, 31], [21, 31], [21, 31], [21, 30], [21, 30], [21, 29], [21, 28], [21, 27], [21, 26], [21, 25], [21, 24], [21, 23]], '#b3cde8')
      for (const [x, y] of [[3, 11], [6, 14], [2, 13], [26, 11], [29, 13], [24, 16]]) dot(ctx, x, y, '#ffffff')
    },
    glow(ctx) {
      ctx.fillStyle = 'rgba(200, 225, 255, 0.18)'
      ctx.fillRect(0, 6, 11, 16)
      ctx.fillRect(21, 6, 11, 16)
    },
  },

  // --- tools (held in the right hand) ---
  drafting_quill: {
    front(ctx) {
      block(ctx, 26, 19, 27, 27, '#f2ede2')
      block(ctx, 27, 19, 27, 27, '#cfc7b8')
      dot(ctx, 25, 21, '#f2ede2')
      dot(ctx, 25, 23, '#f2ede2')
      block(ctx, 26, 28, 26, 30, '#3a2a1f')
    },
  },
  hourglass: {
    front(ctx) {
      block(ctx, 24, 23, 29, 23, '#c9a14a')
      block(ctx, 24, 31, 29, 31, '#c9a14a')
      runs(ctx, 24, [[25, 28], [25, 28], [26, 27], [26, 27], [26, 27], [25, 28], [25, 28]], '#dfe8ee')
      runs(ctx, 28, [[26, 27], [25, 28], [25, 28]], '#e3b34a')
      dot(ctx, 26, 25, '#e3b34a')
    },
  },
  builders_hammer: {
    front(ctx) {
      block(ctx, 26, 21, 26, 31, '#7a5a3a')
      block(ctx, 23, 19, 29, 22, '#8a9096')
      block(ctx, 23, 22, 29, 22, '#646a70')
      dot(ctx, 24, 19, '#b9c0c6')
    },
  },
  scholars_lantern: {
    front(ctx) {
      block(ctx, 26, 23, 26, 24, '#3a2a1f')
      block(ctx, 24, 25, 28, 25, '#3a2a1f')
      block(ctx, 24, 26, 28, 30, '#f2c14e')
      block(ctx, 24, 26, 24, 30, '#3a2a1f')
      block(ctx, 28, 26, 28, 30, '#3a2a1f')
      block(ctx, 24, 31, 28, 31, '#3a2a1f')
      block(ctx, 26, 27, 26, 29, '#fff3c4')
    },
    glow(ctx) {
      ctx.fillStyle = 'rgba(255, 210, 110, 0.22)'
      ctx.fillRect(21, 22, 11, 13)
      ctx.fillStyle = 'rgba(255, 210, 110, 0.18)'
      ctx.fillRect(23, 24, 7, 9)
    },
  },
  sage_elixir: {
    front(ctx) {
      block(ctx, 26, 23, 27, 25, '#dfe8ee')
      block(ctx, 25, 22, 28, 22, '#7a5a3a')
      runs(ctx, 26, [[25, 28], [24, 29], [24, 29], [24, 29], [25, 28]], '#dfe8ee')
      runs(ctx, 27, [[25, 28], [25, 28], [25, 28], [26, 27]], '#3fcf8a')
      dot(ctx, 25, 27, '#a8f0cb')
    },
    glow(ctx) {
      ctx.fillStyle = 'rgba(63, 207, 138, 0.25)'
      ctx.fillRect(22, 24, 10, 9)
    },
  },
  proof_codex: {
    front(ctx) {
      block(ctx, 23, 23, 29, 30, '#5b3a86')
      block(ctx, 28, 23, 29, 30, '#462c69')
      block(ctx, 23, 23, 23, 30, '#e3b34a')
      block(ctx, 25, 25, 27, 28, '#e3b34a')
      dot(ctx, 26, 26, '#5b3a86')
    },
  },

  // --- pets (at the feet, on the left) ---
  ink_cat: {
    front(ctx) {
      runs(ctx, 31, [[1, 2], [5, 6], [1, 6], [1, 6], [1, 6], [2, 6], [1, 7], [1, 7]], '#2a2626')
      dot(ctx, 2, 33, '#7ee07a')
      dot(ctx, 5, 33, '#7ee07a')
      block(ctx, 7, 35, 8, 35, '#2a2626')
      block(ctx, 8, 33, 8, 35, '#2a2626')
    },
  },
  focus_owl: {
    front(ctx) {
      const feather = '#7a5638'
      const dark = '#5a3e28'
      dot(ctx, 1, 29, dark)
      dot(ctx, 6, 29, dark)
      block(ctx, 1, 30, 6, 30, feather)
      block(ctx, 0, 31, 7, 33, feather)
      block(ctx, 1, 31, 3, 32, '#f2d27a')
      block(ctx, 4, 31, 6, 32, '#f2d27a')
      dot(ctx, 2, 32, '#2b1d16')
      dot(ctx, 5, 32, '#2b1d16')
      block(ctx, 3, 33, 4, 33, '#e38b2c')
      block(ctx, 1, 34, 6, 36, feather)
      block(ctx, 2, 34, 5, 37, '#e3d3b0')
      dot(ctx, 3, 35, '#b89f78')
      dot(ctx, 4, 36, '#b89f78')
      block(ctx, 1, 34, 1, 36, dark)
      block(ctx, 6, 34, 6, 36, dark)
      dot(ctx, 2, 38, '#e38b2c')
      dot(ctx, 5, 38, '#e38b2c')
    },
  },
  moss_turtle: {
    front(ctx) {
      runs(ctx, 33, [[2, 6], [1, 7], [0, 8], [0, 8]], '#4d7f3a')
      for (const [x, y] of [[3, 34], [5, 34], [2, 35], [4, 35], [6, 35]]) dot(ctx, x, y, '#6aa24f')
      block(ctx, 8, 35, 9, 36, '#9cc478')
      dot(ctx, 9, 35, '#1e2a14')
      block(ctx, 0, 37, 1, 37, '#9cc478')
      block(ctx, 6, 37, 7, 37, '#9cc478')
    },
  },
  ember_fox: {
    front(ctx) {
      runs(ctx, 30, [[1, 1], [5, 5], [1, 5], [1, 5], [1, 6], [1, 6], [1, 6], [1, 7], [2, 7]], '#d9692c')
      block(ctx, 2, 34, 5, 38, '#f4efe4')
      dot(ctx, 2, 32, '#1e1410')
      dot(ctx, 4, 32, '#1e1410')
      block(ctx, 7, 33, 8, 37, '#d9692c')
      dot(ctx, 8, 33, '#f4efe4')
    },
  },
  star_wisp: {
    front(ctx) {
      runs(ctx, 13, [[3, 4], [2, 5], [2, 5], [3, 4]], '#bff4ff')
      dot(ctx, 3, 14, '#ffffff')
    },
    glow(ctx) {
      ctx.fillStyle = 'rgba(150, 230, 255, 0.3)'
      ctx.fillRect(0, 11, 8, 8)
    },
  },
}

const BADGE_COLORS: Record<string, [string, string]> = {
  badge_first_steps: ['#b87333', '#e0a66a'],
  badge_herald: ['#9aa3aa', '#dfe5ea'],
  badge_week_warrior: ['#b8352c', '#ef7a6e'],
  badge_duelist: ['#4a6fa5', '#9dbbe6'],
  badge_guild: ['#2e8a5c', '#7fd3a6'],
  badge_deep_work: ['#6a4aa0', '#e3b34a'],
}

function drawBadge(ctx: Ctx, id: string) {
  const colors = BADGE_COLORS[id]
  if (!colors) return
  block(ctx, 12, 21, 14, 23, colors[0])
  dot(ctx, 13, 22, colors[1])
}

/** Which slots draw where, in order. */
const BACK_ORDER: Slot[] = ['back', 'head', 'clothing']
const FRONT_ORDER: Slot[] = ['clothing', 'back', 'badge', 'head', 'tool', 'pet']

function renderHero(look: Look, blink: boolean): HTMLCanvasElement {
  const a = { ...DEFAULT_APPEARANCE, ...(look.appearance ?? {}) }
  const p = paletteFor(a)
  const eq = look.equipment ?? {}
  const art = (slot: Slot) => (eq[slot] ? ITEM_ART[eq[slot] as string] : undefined)
  const hoodHidesHair = Boolean(art('head')?.hidesHair)

  const { canvas, ctx } = makeCanvas(HERO_W, HERO_H)

  for (const slot of BACK_ORDER) art(slot)?.back?.(ctx, a, p)
  if (!hoodHidesHair) hairBack(ctx, a, p)
  drawLegs(ctx)
  drawTorso(ctx, a, p)
  art('clothing')?.front?.(ctx, a, p)
  art('back')?.front?.(ctx, a, p)
  if (eq.badge) drawBadge(ctx, eq.badge)
  drawHead(ctx, p, blink)
  if (!hoodHidesHair) hairFront(ctx, a, p)
  // Headwear is painted on its own layer, so a hood can cut its face opening
  // without cutting the face.
  const head = art('head')
  if (head?.front) {
    const { canvas: layer, ctx: hctx } = makeCanvas(HERO_W, HERO_H)
    head.front(hctx, a, p)
    ctx.drawImage(layer, 0, 0)
  }
  art('tool')?.front?.(ctx, a, p)
  // The hand closes over whatever it holds.
  if (eq.tool) {
    const t = torsoSpan(a.body)
    block(ctx, t.armR[0], 28, t.armR[1], 29, p.skinShade)
  }
  art('pet')?.front?.(ctx, a, p)

  outline(ctx, OUTLINE)

  for (const slot of FRONT_ORDER) art(slot)?.glow?.(ctx, a, p)

  // The shadow goes underneath everything.
  const { canvas: out, ctx: octx } = makeCanvas(HERO_W, HERO_H)
  octx.fillStyle = 'rgba(0, 0, 0, 0.32)'
  octx.fillRect(9, 37, 14, 1)
  octx.fillRect(11, 38, 10, 1)
  octx.drawImage(canvas, 0, 0)
  return out
}

/** A two-frame sprite sheet (open, blink) for this look, as a data URL. */
export function heroSheet(look: Look): string {
  return cached(`hero:${JSON.stringify(look.appearance)}:${JSON.stringify(look.equipment)}`, () => {
    const { canvas, ctx } = makeCanvas(HERO_W * 2, HERO_H)
    ctx.drawImage(renderHero(look, false), 0, 0)
    ctx.drawImage(renderHero(look, true), HERO_W, 0)
    return canvas.toDataURL('image/png')
  })
}

/** A single still frame. */
export function heroFrame(look: Look): string {
  return cached(`hero-still:${JSON.stringify(look.appearance)}:${JSON.stringify(look.equipment)}`, () =>
    renderHero(look, false).toDataURL('image/png'),
  )
}

/**
 * An item on its own, for the wardrobe: its layers drawn onto a blank canvas,
 * trimmed, centred and outlined in a 24 × 24 tile.
 */
export function itemIcon(itemId: string): string | null {
  const art = ITEM_ART[itemId]
  const badge = BADGE_COLORS[itemId]
  if (!art && !badge) return null
  return cached(`item:${itemId}`, () => {
    const { canvas: layer, ctx } = makeCanvas(HERO_W, HERO_H)
    if (badge) {
      // A medal, since a chest pin is three pixels.
      const [base, light] = badge
      block(ctx, 12, 4, 19, 11, '#6b4a30')
      block(ctx, 13, 4, 14, 11, '#8a6440')
      runs(ctx, 12, [[13, 18], [12, 19], [11, 20], [11, 20], [11, 20], [11, 20], [12, 19], [13, 18]], base)
      block(ctx, 14, 14, 17, 17, light)
      block(ctx, 15, 15, 16, 16, base)
    } else {
      const a = DEFAULT_APPEARANCE
      const p = paletteFor(a)
      art.back?.(ctx, a, p)
      art.front?.(ctx, a, p)
    }
    const box = (() => {
      const data = ctx.getImageData(0, 0, HERO_W, HERO_H).data
      let minX = HERO_W, minY = HERO_H, maxX = -1, maxY = -1
      for (let y = 0; y < HERO_H; y += 1) {
        for (let x = 0; x < HERO_W; x += 1) {
          if (data[(y * HERO_W + x) * 4 + 3] > 0) {
            minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
          }
        }
      }
      return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
    })()
    const size = 24
    const { canvas, ctx: out } = makeCanvas(size, size)
    if (box) {
      const scale = Math.max(1, Math.floor(Math.min((size - 4) / box.w, (size - 4) / box.h)))
      const w = box.w * scale
      const h = box.h * scale
      out.drawImage(layer, box.x, box.y, box.w, box.h, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h)
      outline(out, OUTLINE)
      if (!badge && art.glow) {
        // A soft halo stands in for the item's own light.
        out.globalCompositeOperation = 'destination-over'
        out.fillStyle = 'rgba(255, 220, 140, 0.18)'
        out.fillRect(2, 2, size - 4, size - 4)
        out.globalCompositeOperation = 'source-over'
      }
    }
    return canvas.toDataURL('image/png')
  })
}

export function hasItemArt(itemId: string): boolean {
  return Boolean(ITEM_ART[itemId] || BADGE_COLORS[itemId])
}
