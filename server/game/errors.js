/** A refusal with a status and a message fit to show the player. */
export class GameError extends Error {
  constructor(status, message, code = null, extra = null) {
    super(message)
    this.name = 'GameError'
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export const notFound = (what = 'That') => new GameError(404, `${what} could not be found.`, 'not_found')
export const conflict = (message, code = 'conflict', extra = null) => new GameError(409, message, code, extra)
export const invalid = (message, field = null) => new GameError(400, message, 'invalid', field ? { field } : null)
