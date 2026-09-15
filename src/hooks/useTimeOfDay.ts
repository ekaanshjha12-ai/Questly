import { useEffect, useState } from 'react'
import { timeOfDay, type TimeOfDay } from '../lib/timeOfDay'

/** The part of the day on the player's clock, kept current while the page stays open and when they come back to it. */
export function useTimeOfDay(): TimeOfDay {
  const [time, setTime] = useState(() => timeOfDay())

  useEffect(() => {
    const update = () => setTime(timeOfDay())
    const timer = window.setInterval(update, 60_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  return time
}
