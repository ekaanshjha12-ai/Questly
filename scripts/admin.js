#!/usr/bin/env node
/**
 * Creates a privileged account and prints a one-time link for claiming it.
 *
 * The password is deliberately not an input to this script. It is not typed at a
 * prompt, not passed as an argument (where it would land in shell history and
 * the process list), and not read from an environment variable (where it would
 * sit in the deploy config and every log that dumps the environment). The link
 * proves who may set a password; the holder chooses it in the browser, over TLS,
 * and enrols a second factor in the same step.
 *
 *   npm run admin -- create-superadmin you@example.com
 *   npm run admin -- create-admin colleague@example.com
 *   npm run admin -- link you@example.com     # re-issue an expired link
 *   npm run admin -- list
 */
import 'dotenv/config'
import { createPendingAdmin, hashSetupToken, makeSetupToken } from '../server/auth.js'
import { findUserByEmail, insertSetupToken, listUsers, normalizeEmail, countByRole } from '../server/db.js'

const SETUP_TTL_MINUTES = 30

function baseUrl() {
  return (
    process.env.PUBLIC_URL?.replace(/\/$/, '') ||
    process.env.RAILWAY_PUBLIC_DOMAIN?.replace(/^/, 'https://')?.replace(/\/$/, '') ||
    'http://localhost:5173'
  )
}

function issueLink(userId) {
  const token = makeSetupToken()
  const expiresAt = new Date(Date.now() + SETUP_TTL_MINUTES * 60_000).toISOString()
  insertSetupToken({ tokenHash: hashSetupToken(token), userId, expiresAt })
  return { url: `${baseUrl()}/admin-setup#${token}`, expiresAt }
}

function printLink({ url, expiresAt }, email) {
  console.log('')
  console.log('  Open this once, within %d minutes, to set the password for %s:', SETUP_TTL_MINUTES, email)
  console.log('')
  console.log('    %s', url)
  console.log('')
  console.log('  It expires at %s and works exactly once.', expiresAt)
  console.log('  Do not paste this link into chat, email or a ticket — anyone holding it')
  console.log('  can claim the account until it is used or expires.')
  console.log('')
}

const [command, emailArg] = process.argv.slice(2)

if (command === 'list') {
  const users = listUsers(500)
  const privileged = users.filter((u) => u.role !== 'user')
  console.log('\n  %d account(s), %d privileged:\n', users.length, privileged.length)
  for (const u of users) {
    const flags = [
      u.role !== 'user' ? u.role.toUpperCase() : 'user',
      u.mfa_enabled ? 'mfa' : 'no-mfa',
      u.disabled ? 'DISABLED' : null,
    ].filter(Boolean)
    console.log('    %s  [%s]', u.email.padEnd(34), flags.join(', '))
  }
  console.log('')
  process.exit(0)
}

if (command === 'create-superadmin' || command === 'create-admin' || command === 'link') {
  const email = normalizeEmail(emailArg)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('\n  Give a valid email address.\n  e.g. npm run admin -- %s you@example.com\n', command)
    process.exit(1)
  }

  const existing = findUserByEmail(email)

  if (command === 'link') {
    if (!existing) {
      console.error('\n  No account for %s. Create it first.\n', email)
      process.exit(1)
    }
    printLink(issueLink(existing.id), email)
    process.exit(0)
  }

  if (existing) {
    console.error('\n  %s already exists (role: %s).', email, existing.role)
    console.error('  To re-issue a setup link for it:  npm run admin -- link %s\n', email)
    process.exit(1)
  }

  const role = command === 'create-superadmin' ? 'superadmin' : 'admin'
  if (role === 'superadmin' && countByRole('superadmin') > 0) {
    console.error('\n  A superadmin already exists. Promote from the admin console instead.\n')
    process.exit(1)
  }

  const user = createPendingAdmin(email, role)
  console.log('\n  Created %s as %s, with no password set.', email, role)
  console.log('  It cannot be signed into until the link below is used.')
  printLink(issueLink(user.id), email)
  process.exit(0)
}

console.log(`
  Usage:
    npm run admin -- create-superadmin <email>   first root account, once only
    npm run admin -- create-admin <email>        an additional admin
    npm run admin -- link <email>                re-issue an expired setup link
    npm run admin -- list                        show accounts and their roles

  No command takes a password. The account holder sets their own through the
  one-time link, and enrols two-factor authentication at the same time.
`)
process.exit(command ? 1 : 0)
