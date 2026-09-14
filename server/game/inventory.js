import { db } from '../db.js'
import { track } from './analytics.js'
import { conflict, invalid, notFound } from './errors.js'
import { ITEMS, SLOTS, STARTER_ITEMS, findItem, unlockText } from './items.js'
import { levelFromXp } from './levels.js'
import { getProgressRow, startRewards, transaction } from './rewards.js'

/**
 * The wardrobe: what a player owns, what they wear, and buying with coins.
 *
 * Owning is decided by the server alone (see rewards.js for grants); this
 * module only reads ownership and changes what is worn, and a purchase is a
 * ledger entry that spends coins the server holds.
 */

/** The base look, chosen freely — it is not earned, only drawn. */
export const APPEARANCE_OPTIONS = {
  body: ['a', 'b'],
  skin: ['porcelain', 'fair', 'tan', 'olive', 'brown', 'deep'],
  hair: ['short', 'long', 'bun', 'curly', 'shaved', 'braid', 'mohawk', 'bob'],
  hairColor: ['black', 'brown', 'auburn', 'blonde', 'silver', 'teal', 'plum', 'ember'],
  eyes: ['dark', 'blue', 'green', 'amber'],
}

export function defaultAppearance(character = 'female') {
  return character === 'male'
    ? { body: 'a', skin: 'tan', hair: 'short', hairColor: 'brown', eyes: 'dark' }
    : { body: 'b', skin: 'fair', hair: 'long', hairColor: 'auburn', eyes: 'green' }
}

export function validateAppearance(input) {
  if (!input || typeof input !== 'object') throw invalid('Choose how your character looks.', 'appearance')
  const out = {}
  for (const [key, options] of Object.entries(APPEARANCE_OPTIONS)) {
    if (!options.includes(input[key])) throw invalid(`Pick a ${key === 'hairColor' ? 'hair colour' : key} from the list.`, key)
    out[key] = input[key]
  }
  return out
}

export function setAppearance(userId, input) {
  const appearance = validateAppearance(input)
  db.run('UPDATE player_progress SET appearance = ?, updated_at = ? WHERE user_id = ?', [
    JSON.stringify(appearance),
    new Date().toISOString(),
    userId,
  ])
  return appearance
}

export function equipmentFor(userId) {
  const equipment = {}
  for (const row of db.all('SELECT slot, item_id FROM user_equipment WHERE user_id = ?', [userId])) {
    if (findItem(row.item_id)) equipment[row.slot] = row.item_id
  }
  return equipment
}

/** Gives a new player their starting gear and puts it on. */
export function grantStarterGear(userId) {
  const now = new Date().toISOString()
  for (const itemId of STARTER_ITEMS) {
    const item = findItem(itemId)
    db.run('INSERT OR IGNORE INTO user_items (user_id, item_id, source, acquired_at) VALUES (?, ?, ?, ?)', [userId, itemId, 'starter', now])
    db.run('INSERT OR IGNORE INTO user_equipment (user_id, slot, item_id) VALUES (?, ?, ?)', [userId, item.slot, itemId])
  }
}

export function inventoryView(userId) {
  const progress = getProgressRow(userId)
  const level = levelFromXp(progress?.xp ?? 0)
  const coins = progress?.coins ?? 0
  const owned = new Map(db.all('SELECT item_id, acquired_at FROM user_items WHERE user_id = ?', [userId]).map((r) => [r.item_id, r.acquired_at]))
  const equipment = equipmentFor(userId)
  const equippedIds = new Set(Object.values(equipment))

  const items = ITEMS.map((item) => {
    const rule = item.unlock
    const isOwned = owned.has(item.id)
    let state
    if (equippedIds.has(item.id)) state = 'equipped'
    else if (isOwned) state = 'owned'
    else if (rule.type === 'purchase') state = level >= rule.minLevel ? 'available' : 'locked'
    else state = 'locked'
    return {
      id: item.id,
      name: item.name,
      slot: item.slot,
      rarity: item.rarity,
      description: item.description,
      source: unlockText(item),
      state,
      acquiredAt: owned.get(item.id) ?? null,
      price: rule.type === 'purchase' ? rule.price : null,
      minLevel: rule.type === 'purchase' ? rule.minLevel : rule.type === 'level' ? rule.level : null,
      affordable: rule.type === 'purchase' ? coins >= rule.price : null,
      model: Boolean(item.model),
    }
  })
  return { coins, level, slots: SLOTS, items, equipment }
}

export function equipItem(userId, slotInput, itemIdInput) {
  const slot = String(slotInput ?? '')
  if (!SLOTS.includes(slot)) throw invalid('That is not an equipment slot.', 'slot')
  if (itemIdInput === null || itemIdInput === undefined || itemIdInput === '') {
    db.run('DELETE FROM user_equipment WHERE user_id = ? AND slot = ?', [userId, slot])
    return equipmentFor(userId)
  }
  const item = findItem(String(itemIdInput))
  if (!item) throw notFound('That item')
  if (item.slot !== slot) throw invalid(`${item.name} does not go in that slot.`, 'slot')
  const owned = db.get('SELECT 1 AS x FROM user_items WHERE user_id = ? AND item_id = ?', [userId, item.id])
  if (!owned) throw conflict('You do not own that item yet.', 'not_owned')
  db.run(
    'INSERT INTO user_equipment (user_id, slot, item_id) VALUES (?, ?, ?) ON CONFLICT(user_id, slot) DO UPDATE SET item_id = excluded.item_id',
    [userId, slot, item.id],
  )
  return equipmentFor(userId)
}

export function buyItem(userId, itemIdInput) {
  return transaction(() => {
    const item = findItem(String(itemIdInput ?? ''))
    if (!item) throw notFound('That item')
    const rule = item.unlock
    if (rule.type !== 'purchase') throw conflict('That item is earned, not bought.', 'not_for_sale')
    const owned = db.get('SELECT 1 AS x FROM user_items WHERE user_id = ? AND item_id = ?', [userId, item.id])
    if (owned) throw conflict('You already own that item.', 'owned')
    const progress = getProgressRow(userId)
    const level = levelFromXp(progress.xp)
    if (level < rule.minLevel) throw conflict(`Reach level ${rule.minLevel} to buy ${item.name}.`, 'level_locked')
    if (progress.coins < rule.price) throw conflict(`You need ${rule.price - progress.coins} more coins.`, 'insufficient_coins')

    const rewards = startRewards(userId)
    rewards.pay({ source: 'purchase', sourceId: item.id, xp: 0, coins: -rule.price, label: `Bought ${item.name}` })
    db.run('INSERT OR IGNORE INTO user_items (user_id, item_id, source, acquired_at) VALUES (?, ?, ?, ?)', [
      userId,
      item.id,
      'purchase',
      new Date().toISOString(),
    ])
    db.run(
      'INSERT INTO user_equipment (user_id, slot, item_id) VALUES (?, ?, ?) ON CONFLICT(user_id, slot) DO UPDATE SET item_id = excluded.item_id',
      [userId, item.slot, item.id],
    )
    track(userId, 'item_purchased', { item: item.id, rarity: item.rarity })
    const summary = rewards.finish()
    return { inventory: inventoryView(userId), rewards: summary }
  })
}

/** What another player may see of someone's look: base appearance and worn items. */
export function publicLook(userId) {
  const progress = getProgressRow(userId)
  let appearance = null
  try {
    appearance = progress?.appearance ? JSON.parse(progress.appearance) : null
  } catch {
    appearance = null
  }
  return { appearance, equipment: equipmentFor(userId) }
}
