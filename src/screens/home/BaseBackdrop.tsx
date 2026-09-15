import { useState } from 'react'
import { ROOMS } from '../../data/rooms'
import type { TimeOfDay } from '../../lib/timeOfDay'

/**
 * The room behind the top of Home, edge to edge across the page (it spans the
 * whole content area, not just the column). It fades into the page above, so
 * the title reads in either theme, and below, so the cards stand on the page
 * rather than on the picture. Decorative: nothing in it needs to be read.
 */
export default function BaseBackdrop({ time }: { time: TimeOfDay }) {
  const room = ROOMS[time]
  const [shown, setShown] = useState<string | null>(null)

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[25rem] w-screen -translate-x-1/2 overflow-hidden sm:h-[30rem] lg:h-[clamp(34rem,38vw,42rem)] lg:w-[calc(100vw-15rem)]"
    >
      <div className="absolute inset-0 scale-110 bg-cover blur-xl" style={{ backgroundImage: `url(${room.tiny})`, backgroundPosition: room.focus }} />
      <img
        key={room.src}
        src={room.src}
        srcSet={`${room.small} 960w, ${room.src} 1536w`}
        // Cropped to cover, a phone shows the picture wider than the screen.
        sizes="(min-width: 1024px) calc(100vw - 15rem), (min-width: 600px) 100vw, 600px"
        alt=""
        draggable={false}
        decoding="async"
        onLoad={() => setShown(room.src)}
        className={`absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-700 motion-reduce:transition-none ${
          shown === room.src ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ objectPosition: room.focus }}
      />
      <div className="base-scrim absolute inset-0" />
    </div>
  )
}
