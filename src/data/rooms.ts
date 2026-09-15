import type { TimeOfDay } from '../lib/timeOfDay'
import morning from '../assets/home/room-morning.webp'
import morningSmall from '../assets/home/room-morning-960.webp'
import morningTiny from '../assets/home/room-morning-tiny.webp'
import evening from '../assets/home/room-evening.webp'
import eveningSmall from '../assets/home/room-evening-960.webp'
import eveningTiny from '../assets/home/room-evening-tiny.webp'
import night from '../assets/home/room-night.webp'
import nightSmall from '../assets/home/room-night-960.webp'
import nightTiny from '../assets/home/room-night-tiny.webp'

/**
 * The player's base on Home: a study lit by their own clock. Sunrise through
 * the window from dawn until the afternoon is out, the lamps on at dusk, rain
 * on the glass at night.
 *
 * Each picture is 1536 × 1024 with a 960-wide copy for phones and a few hundred
 * bytes of blur to hold its place. `focus` is the point the page crops around:
 * wide screens cut the picture's height, and a point below the middle keeps
 * both the window and the floor the hero stands on.
 */
export interface Room {
  src: string
  small: string
  tiny: string
  focus: string
}

const MORNING: Room = { src: morning, small: morningSmall, tiny: morningTiny, focus: '50% 70%' }

export const ROOMS: Record<TimeOfDay, Room> = {
  morning: MORNING,
  day: MORNING,
  evening: { src: evening, small: eveningSmall, tiny: eveningTiny, focus: '50% 70%' },
  night: { src: night, small: nightSmall, tiny: nightTiny, focus: '50% 70%' },
}
