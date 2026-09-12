/**
 * Hand-drawn icons for the ten sections plus the hub.
 *
 * Drawn rather than taken from a set so each silhouette can say what its
 * section actually does — a planted flag for quests, a shield bearing a rank
 * star for the hero — instead of the nearest generic shape. They are
 * plain SVG so they inherit `currentColor` and theme themselves, and cost
 * nothing to load.
 *
 * House rules, so nine icons look like one family:
 *   24x24 box, 1.75 stroke, round caps and joins, no fill except deliberate
 *   accents, and roughly a 3-unit margin so nothing crowds the edge.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, className = '', ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      // Lit like every other surface: see .icon-3d in index.css.
      className={`icon-3d ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

/** Hub — a house, because every other meaning of "home" needs explaining. */
export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 10.6 12 3.8l8.5 6.8" />
      <path d="M5.4 9.6V19a1.4 1.4 0 0 0 1.4 1.4h10.4a1.4 1.4 0 0 0 1.4-1.4V9.6" />
      <path d="M9.6 20.4v-5.2a2.4 2.4 0 0 1 4.8 0v5.2" />
    </Svg>
  )
}

/**
 * Quests — an objective flag.
 *
 * The scroll this replaced collapsed into a pennant at 16px, and a scroll is
 * too close to the to-do list's ticked lines anyway. A planted flag is a marker
 * for somewhere to get to, which is what a quest is, and its silhouette
 * survives being shrunk.
 */
export function QuestIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.6 21V3.4" />
      <path d="M6.6 4.4h10.8l-2.9 3.6 2.9 3.6H6.6" />
      <circle cx="6.6" cy="21" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** To-Do — ticked lines. Deliberately plainer than the quest flag, because
 * that is exactly the difference between the two lists. */
export function TodoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.8 7.2l1.6 1.6 2.8-3" />
      <path d="M3.8 16.2l1.6 1.6 2.8-3" />
      <path d="M11.6 7.4h8.6" />
      <path d="M11.6 16.6h8.6" />
    </Svg>
  )
}

/** Plan — a calendar with one day marked, since placing a task on a day is the
 * whole point of the planner. */
export function PlanIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2.4" />
      <path d="M3.4 9.8h17.2" />
      <path d="M8 3.4v3.4M16 3.4v3.4" />
      <circle cx="8.6" cy="14.4" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12.8 14.4h4.6M12.8 17.6h3" />
    </Svg>
  )
}

/** Focus — a stopwatch mid-run, hand past the top. */
export function FocusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="13.6" r="7.4" />
      <path d="M12 9.6v4l2.6 1.8" />
      <path d="M9.6 2.6h4.8" />
      <path d="M12 2.6v3.6" />
      <path d="M18.6 7.4l1.4-1.4" />
    </Svg>
  )
}

/**
 * Study — two cards, the back one clearly behind.
 *
 * The first attempt overlapped them so closely that it read as a single card
 * with a stray line. Offsetting them on both axes is what makes a stack look
 * like a stack at small sizes.
 */
export function StudyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4.4h9.6a2 2 0 0 1 2 2v7.2" />
      <rect x="3.4" y="8" width="13.6" height="11.6" rx="2.2" />
      <path d="M6.6 12.6h7.2M6.6 15.8h4.4" />
    </Svg>
  )
}

/** Habits — the tracker itself: a grid of days, two of them ticked. Squares
 * rather than a calendar so it cannot be mistaken for Plan. */
export function HabitsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.6" y="3.6" width="7.2" height="7.2" rx="1.9" />
      <rect x="13.2" y="3.6" width="7.2" height="7.2" rx="1.9" fill="currentColor" />
      <rect x="3.6" y="13.2" width="7.2" height="7.2" rx="1.9" fill="currentColor" />
      <rect x="13.2" y="13.2" width="7.2" height="7.2" rx="1.9" />
    </Svg>
  )
}

/** Personalise — a painter's palette, because what lives there is how the app
 * looks and feels, not how it works. A cog would promise settings it lacks. */
export function PersonaliseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.4a8.6 8.6 0 1 0 0 17.2c1.2 0 1.9-.8 1.9-1.8 0-.6-.3-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8h2.2a4.3 4.3 0 0 0 4.3-4.3c0-3.8-4-6.6-9.1-6.6Z" />
      <circle cx="7.4" cy="11.6" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="9.6" cy="7.4" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="7" r="1.25" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** Challenges — two blades crossed, each with its own guard, because a
 * challenge takes two people. */
export function ChallengesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19.8 4.2 9.4 14.6" />
      <path d="M4.2 4.2l10.4 10.4" />
      <path d="M6.9 12.3l4.8 4.8" />
      <path d="M17.1 12.3l-4.8 4.8" />
      <path d="M8.6 15.4 4.6 19.4" />
      <path d="M15.4 15.4l4 4" />
    </Svg>
  )
}

/** Goals — an arrow already in the target, not one aimed at it. */
export function GoalsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="13" r="8" />
      <circle cx="11" cy="13" r="4.2" />
      <circle cx="11" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <path d="M14.4 9.6 20.6 3.4" />
      <path d="M17.6 3.6h3v3" />
    </Svg>
  )
}

/** Hero — a shield carrying a rank star. */
export function HeroIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 19.4 5.8v6.1c0 4.2-3 7.4-7.4 9.1-4.4-1.7-7.4-4.9-7.4-9.1V5.8Z" />
      <path d="m12 8.8 1.3 2.7 3 .4-2.2 2.1.5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.2-2.1 3-.4Z" />
    </Svg>
  )
}

/** Stats — bars climbing, with the trend drawn over them. */
export function StatsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.6 20.4h16.8" />
      <path d="M6.8 20.4v-4.6M12 20.4V12M17.2 20.4V8.2" />
      <path d="m5 10.4 4.4 2.2 3.6-4 5-3" />
      <path d="M15.4 4.6h3.2v3.2" />
    </Svg>
  )
}
