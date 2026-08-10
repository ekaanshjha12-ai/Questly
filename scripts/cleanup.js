/**
 * Removes test accounts.
 *
 * Exists because pasting a long one-liner into a hosted web console is
 * unreliable — `npm run cleanup` is short enough to type by hand.
 *
 *   npm run cleanup                  removes every *@questly.test account
 *   npm run cleanup -- %@example.com removes anything matching that SQL pattern
 *   npm run cleanup -- --list        shows accounts without deleting anything
 */

import { db } from '../server/db.js'

const arg = process.argv[2]
const listOnly = arg === '--list'
const pattern = !arg || listOnly ? '%@questly.test' : arg

const all = db.all('SELECT email FROM users ORDER BY email')
console.log(`\n${all.length} account(s) on this server:`)
for (const u of all) console.log('  ', u.email)

if (listOnly) {
  process.exit(0)
}

const doomed = db.all('SELECT email FROM users WHERE email LIKE ?', [pattern])
if (!doomed.length) {
  console.log(`\nNothing matches "${pattern}". Nothing removed.`)
  process.exit(0)
}

console.log(`\nRemoving ${doomed.length} matching "${pattern}":`)
for (const u of doomed) console.log('   -', u.email)

db.run('DELETE FROM users WHERE email LIKE ?', [pattern])

// sessions, states, verify_usage and photo_proofs all declare
// ON DELETE CASCADE, so removing the user takes their data with it. Swept
// anyway in case an older database was created before those constraints.
db.run('DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users)')
db.run('DELETE FROM states WHERE user_id NOT IN (SELECT id FROM users)')
db.run('DELETE FROM verify_usage WHERE user_id NOT IN (SELECT id FROM users)')
db.run('DELETE FROM photo_proofs WHERE user_id NOT IN (SELECT id FROM users)')

const left = db.all('SELECT email FROM users ORDER BY email')
console.log(`\nDone. ${left.length} account(s) remain:`)
for (const u of left) console.log('  ', u.email)
process.exit(0)
