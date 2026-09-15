import express from 'express'
import { findSession, findUserById, isSuspended } from '../db.js'
import {
  acceptPolicies,
  adminPolicyView,
  isPolicySlug,
  listPolicies,
  pendingAcceptances,
  policyVariables,
  publicPolicy,
  resetPolicy,
  savePolicy,
} from '../policies.js'
import {
  SUPPORT_REPLY_MAX,
  closeSupportRequest,
  fileSupportRequest,
  getSupportRequest,
  listMySupport,
  listSupport,
  openSupportCount,
  openSupportCountFor,
  validateSupportRequest,
} from '../support.js'

/**
 * Terms, privacy, guidelines and safety, readable by anyone — they have to be,
 * before an account exists — and Contact & support. Editing documents is for
 * the superadmin; reading and answering support is for any admin.
 */
export function legalRoutes({ requireAuth, requireAdmin, requireSuperadmin, rateLimit, audit, notify, sessionCookie }) {
  const router = express.Router()
  const throttleRead = rateLimit({ name: 'policies', max: 120, windowMs: 60_000, by: 'ip' })
  const throttleSupportUser = rateLimit({ name: 'support-user', max: 5, windowMs: 60 * 60_000, by: 'user' })
  const throttleSupportIp = rateLimit({ name: 'support-ip', max: 3, windowMs: 60 * 60_000, by: 'ip' })
  const throttleAdmin = rateLimit({ name: 'admin-legal', max: 60, windowMs: 60_000, by: 'user' })

  router.get('/policies', throttleRead, (req, res) => {
    const { operator, contactEmail } = policyVariables()
    res.json({ policies: listPolicies(), contact: { operator, email: contactEmail || null } })
  })

  router.get('/policies/:slug', throttleRead, (req, res) => {
    const policy = publicPolicy(String(req.params.slug ?? ''))
    if (!policy) {
      res.status(404).json({ error: 'No such document.' })
      return
    }
    res.json({ policy })
  })

  router.post('/policies/accept', requireAuth, (req, res) => {
    acceptPolicies(req.user.id)
    audit({ userId: req.user.id, email: req.user.email, event: 'policies.accept', outcome: 'success', ip: req.ip })
    res.json({ pending: pendingAcceptances(req.user.id) })
  })

  /** Whoever holds a working session, or null: support is open to people who cannot sign in. */
  function signedInUser(req) {
    const session = findSession(req.cookies?.[sessionCookie])
    const user = session ? findUserById(session.user_id) : null
    return user && !user.disabled && !isSuspended(user) ? user : null
  }

  router.post(
    '/support',
    (req, res, next) => {
      const user = signedInUser(req)
      if (user) req.user = { id: user.id, email: user.email }
      next()
    },
    (req, res, next) => (req.user ? throttleSupportUser(req, res, next) : throttleSupportIp(req, res, next)),
    (req, res) => {
      const checked = validateSupportRequest(req.body, { signedIn: Boolean(req.user) })
      if (!checked.ok) {
        res.status(400).json({ error: checked.error })
        return
      }
      if (req.user && openSupportCountFor(req.user.id) >= 5) {
        res.status(429).json({ error: 'You already have five open requests. We will get to them — thank you for your patience.' })
        return
      }
      const id = fileSupportRequest({ userId: req.user?.id ?? null, ...checked.value })
      audit({ userId: req.user?.id ?? null, email: req.user?.email ?? null, event: 'support.request', outcome: 'filed', ip: req.ip, detail: `${checked.value.kind} ${id}` })
      res.status(201).json({ ok: true, id })
    },
  )

  router.get('/support/mine', requireAuth, (req, res) => {
    res.json({ requests: listMySupport(req.user.id) })
  })

  /* --- admin --------------------------------------------------------------- */

  router.get('/admin/policies', requireAuth, requireAdmin, throttleAdmin, (req, res) => {
    res.json({ policies: adminPolicyView(), variables: policyVariables(), canEdit: req.user.role === 'superadmin' })
  })

  router.put('/admin/policies/:slug', requireAuth, requireSuperadmin, throttleAdmin, (req, res) => {
    const slug = String(req.params.slug ?? '')
    if (!isPolicySlug(slug)) {
      res.status(404).json({ error: 'No such document.' })
      return
    }
    const saved = savePolicy(slug, req.body, req.user.id)
    if (!saved.ok) {
      res.status(400).json({ error: saved.error })
      return
    }
    audit({ userId: req.user.id, email: req.user.email, event: 'admin.policy_edit', outcome: 'success', ip: req.ip, detail: `${slug} v${saved.version}${req.body?.material === true ? ' (material)' : ''}` })
    res.json({ policies: adminPolicyView() })
  })

  router.post('/admin/policies/:slug/reset', requireAuth, requireSuperadmin, throttleAdmin, (req, res) => {
    const slug = String(req.params.slug ?? '')
    const reset = isPolicySlug(slug) ? resetPolicy(slug, req.user.id) : { ok: false, error: 'No such document.' }
    if (!reset.ok) {
      res.status(400).json({ error: reset.error })
      return
    }
    audit({ userId: req.user.id, email: req.user.email, event: 'admin.policy_reset', outcome: 'success', ip: req.ip, detail: `${slug} v${reset.version}` })
    res.json({ policies: adminPolicyView() })
  })

  router.get('/admin/support', requireAuth, requireAdmin, throttleAdmin, (req, res) => {
    const status = req.query.status === 'closed' ? 'closed' : 'open'
    res.json({ requests: listSupport(status), open: openSupportCount() })
  })

  router.post('/admin/support/:id/close', requireAuth, requireAdmin, throttleAdmin, (req, res) => {
    const request = getSupportRequest(req.params.id)
    if (!request) {
      res.status(404).json({ error: 'No such request.' })
      return
    }
    const reply = typeof req.body?.reply === 'string' ? req.body.reply.trim().slice(0, SUPPORT_REPLY_MAX) : ''
    if (reply && !request.user_id) {
      res.status(400).json({ error: 'This person has no account to reply to. Write to them at their email address, then close the request.' })
      return
    }
    if (!closeSupportRequest(request.id, { reply: reply || null, adminId: req.user.id })) {
      res.status(409).json({ error: 'That request has already been closed.' })
      return
    }
    if (reply) {
      notify(request.user_id, {
        kind: 'system',
        title: 'The Questly team replied',
        body: reply.length > 280 ? `${reply.slice(0, 280)}…` : reply,
        link: '/support',
      })
    }
    audit({ userId: req.user.id, email: req.user.email, event: 'admin.support_close', outcome: reply ? 'replied' : 'closed', ip: req.ip, detail: request.id })
    res.json({ requests: listSupport('open'), open: openSupportCount() })
  })

  return router
}
