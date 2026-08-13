import { AsyncLocalStorage } from 'node:async_hooks'
import { recordAiUsage } from './db.js'

/**
 * Wraps a call to the model so its tokens, latency, outcome and cost are
 * recorded.
 *
 * One wrapper rather than metering inside each of the eight generators: they
 * would drift, and a call added later would silently go uncounted. This sits at
 * the route layer, where every paid call already passes through.
 */

/** USD per million tokens, per the pricing this app is billed at. Kept here so
 * a rate change is one edit, and stamped onto each row so historical reports do
 * not move when it changes. */
const PRICING = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

const DEFAULT_MODEL = 'claude-opus-5'

export function estimateCost(model, inputTokens, outputTokens) {
  const rate = PRICING[model] ?? PRICING[DEFAULT_MODEL]
  return (inputTokens / 1e6) * rate.input + (outputTokens / 1e6) * rate.output
}

/**
 * Per-request store for token counts.
 *
 * The generators are several layers below the route, so they cannot easily hand
 * usage back up through their return values without changing every signature. A
 * module-level variable would be wrong: two requests in flight would cross, and
 * whichever finished second would be billed against the first. AsyncLocalStorage
 * keeps a bucket per request for free.
 */
const usageStore = new AsyncLocalStorage()

/** Called by a generator once the model has answered. No-op outside a meter. */
export function noteUsage(usage) {
  if (!usage) return
  usageStore.getStore()?.push(usage)
}

/**
 * Runs `fn` and records what it cost.
 *
 * A single call can make several requests to the model — the two-step flows do
 * — so every usage reported inside is summed rather than only the last.
 */
export async function meter({ userId, endpoint, model = DEFAULT_MODEL }, fn) {
  const started = Date.now()
  const bucket = []

  try {
    const result = await usageStore.run(bucket, fn)
    const input = bucket.reduce((sum, u) => sum + (u.input_tokens ?? 0), 0)
    const output = bucket.reduce((sum, u) => sum + (u.output_tokens ?? 0), 0)
    recordAiUsage({
      userId,
      endpoint,
      model,
      inputTokens: input,
      outputTokens: output,
      costUsd: estimateCost(model, input, output),
      durationMs: Date.now() - started,
      ok: true,
    })
    return result
  } catch (err) {
    // A failure still burned time and often tokens, and the failure rate is
    // half of what the dashboard is for.
    const input = bucket.reduce((sum, u) => sum + (u.input_tokens ?? 0), 0)
    const output = bucket.reduce((sum, u) => sum + (u.output_tokens ?? 0), 0)
    recordAiUsage({
      userId,
      endpoint,
      model,
      inputTokens: input,
      outputTokens: output,
      costUsd: estimateCost(model, input, output),
      durationMs: Date.now() - started,
      ok: false,
      error: err?.message ?? String(err),
    })
    throw err
  }
}
