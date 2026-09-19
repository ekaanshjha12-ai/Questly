import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { makeWorld } from './helpers.mjs'

/**
 * Journeys end to end, the way a player takes them: an account from sign-up
 * to deletion, a duel offered and turned down, a message request and the
 * protections around under-18s, an account taken out by staff, and requests
 * that try to do more than they are allowed to.
 */

/** A date of birth this many years ago, so the ages in here never drift. */
function yearsAgo(years) {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - years)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 10)
}

const sessionOf = (res) => res.headers.get('set-cookie')?.match(/questly_session=([^;]+)/)?.[1] ?? null

const terms = (opponent) => ({
  opponent, name: 'Morning pages', objective: 'Write a page every morning', rules: 'One page, before noon',
  durationDays: 3, rewardXp: 100, minCheckins: 2, startMode: 'accept', mode: 'checkin', proof: 'optional',
})

describe('journeys', () => {
  const world = makeWorld()
  const url = (path) => `http://127.0.0.1:${world.port}${path}`
  const postJson = (path, body, headers = {}) =>
    fetch(url(path), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  let ada
  let ben
  let cy
  let dan
  let warden
  let chief

  before(async () => {
    ada = world.seedPlayer({ username: 'ada', displayName: 'Ada' })
    ben = world.seedPlayer({ username: 'ben', displayName: 'Ben' })
    cy = world.seedPlayer({ username: 'cy', displayName: 'Cy', birthdate: yearsAgo(16) })
    dan = world.seedPlayer({ username: 'dan', displayName: 'Dan' })
    warden = world.seedPlayer({ username: 'warden', role: 'admin' })
    chief = world.seedPlayer({ username: 'chief', role: 'superadmin' })
    await world.start()
  })

  after(async () => {
    await world.destroy()
  })

  it('takes an account from sign-up to sign-out, back in, and away with everything it made', async () => {
    const anon = world.client()
    const email = 'vera@example.test'
    const password = 'correct horse battery'

    const young = await anon('POST', '/api/auth/signup', { email: 'kid@example.test', password, name: 'Kid', username: 'kiddo', birthdate: yearsAgo(12), acceptTerms: true })
    assert.equal(young.status, 403)
    assert.equal(young.body.code, 'underage')

    const signup = await postJson('/api/auth/signup', { email, password, name: 'Vera', username: 'vera', birthdate: '1999-04-04', acceptTerms: true, role: 'superadmin' })
    assert.equal(signup.status, 201)
    assert.equal((await signup.json()).user.role, 'user', 'a role in the request body is ignored')
    let token = sessionOf(signup)
    let vera = world.client(token)

    // Signing out ends the session on the server, not only in the browser.
    assert.equal((await vera('POST', '/api/auth/logout')).status, 204)
    assert.equal((await vera('GET', '/api/me')).status, 401, 'the old cookie signs nobody in')

    const login = await postJson('/api/auth/login', { email: 'Vera@Example.test', password })
    assert.equal(login.status, 200)
    token = sessionOf(login)
    vera = world.client(token)
    assert.equal((await vera('GET', '/api/me')).body.user.username, 'vera')

    const locked = await vera('PUT', '/api/me/profile', { birthdate: '2001-01-01' })
    assert.equal(locked.status, 400)
    assert.equal(locked.body.code, 'birthdate_locked')
    const edited = await vera('PUT', '/api/me/profile', { bio: 'Learning to draw, one sketch a day', role: 'admin' })
    assert.equal(edited.status, 200)
    assert.equal(edited.body.user.bio, 'Learning to draw, one sketch a day')
    assert.equal(edited.body.user.role, 'user')

    assert.equal((await vera('POST', '/api/posts', { kind: 'update', body: 'Finished my first sketchbook page today' })).status, 201)
    assert.equal((await vera('POST', '/api/messages/start', { username: 'ada', body: 'Hi Ada, loved your study plan' })).status, 201)
    assert.equal((await ada.client('POST', '/api/users/vera/block')).status, 200)
    assert.equal((await vera('POST', '/api/users/ben/block')).status, 200)
    assert.equal((await vera('POST', '/api/support', { kind: 'other', body: 'How do club trials work, exactly?' })).status, 201)

    const exported = await fetch(url('/api/account/export'), { headers: { Cookie: `questly_session=${token}` } })
    assert.equal(exported.status, 200)
    assert.match(exported.headers.get('content-disposition') ?? '', /attachment/)
    const data = await exported.json()
    assert.equal(data.account.email, email)
    assert.equal(data.account.birthdate, '1999-04-04')
    assert.ok(data.posts.some((p) => p.body === 'Finished my first sketchbook page today'))
    assert.deepEqual(data.messages.map((m) => [m.with_username, m.body]), [['ada', 'Hi Ada, loved your study plan']])
    assert.deepEqual(data.blocked.map((b) => b.username), ['ben'], 'who they blocked, not who blocked them')
    assert.equal(data.supportRequests[0].body, 'How do club trials work, exactly?')
    assert.ok(data.policiesAccepted.length >= 2)
    assert.ok(data.sessions.length >= 1 && data.sessions.every((s) => !('token' in s)))
    const text = JSON.stringify(data)
    assert.ok(!text.includes('ada@example.test') && !text.includes(token) && !text.includes('password'), 'no one else’s account and no secrets')

    assert.equal((await vera('POST', '/api/account/delete', { password: 'not my password' })).status, 401)
    assert.equal((await vera('GET', '/api/me')).status, 200, 'a wrong password deletes nothing')
    assert.equal((await vera('POST', '/api/account/delete', { password })).status, 204)
    assert.equal((await vera('GET', '/api/me')).status, 401)
    assert.equal((await postJson('/api/auth/login', { email, password })).status, 401)
    assert.equal((await ben.client('GET', '/api/users/vera')).status, 404)
    assert.ok(!(await ben.client('GET', '/api/feed')).body.posts.some((p) => p.body.includes('sketchbook')), 'their posts went with them')

    const again = await anon('POST', '/api/auth/signup', { email, password, name: 'Vera', username: 'vera', birthdate: '1999-04-04', acceptTerms: true })
    assert.equal(again.status, 201, 'the email and the username are free again')
  })

  it('lets a duel offer be turned down or withdrawn, and only by the side it belongs to', async () => {
    const offer = await ada.client('POST', '/api/challenges', terms('ben'))
    assert.equal(offer.status, 201)
    const id = offer.body.challenge.id
    assert.equal(offer.body.challenge.status, 'sent')

    for (const [method, path, body] of [
      ['GET', `/api/challenges/${id}`],
      ['POST', `/api/challenges/${id}/respond`, { accept: true }],
      ['POST', `/api/challenges/${id}/cancel`, {}],
      ['POST', `/api/challenges/${id}/checkin`, { note: 'Sneaking in' }],
      ['GET', `/api/challenges/${id}/messages`],
      ['POST', `/api/challenges/${id}/messages`, { body: 'Let me join' }],
    ]) {
      assert.equal((await dan.client(method, path, body)).status, 404, `an outsider cannot ${method} ${path.replace(id, ':id')}`)
    }
    assert.equal((await ada.client('POST', `/api/challenges/${id}/respond`, { accept: true })).status, 403, 'the sender cannot accept their own offer')
    assert.equal((await ben.client('POST', `/api/challenges/${id}/cancel`, {})).status, 409, 'only the sender withdraws')

    const declined = await ben.client('POST', `/api/challenges/${id}/respond`, { accept: false })
    assert.equal(declined.status, 200)
    assert.equal(declined.body.challenge.status, 'rejected')
    assert.equal((await ben.client('POST', `/api/challenges/${id}/respond`, { accept: true })).status, 409, 'a declined offer stays declined')
    assert.ok((await ada.client('GET', '/api/notifications')).body.notifications.some((n) => n.kind === 'challenge_rejected'))

    const second = await ada.client('POST', '/api/challenges', terms('ben'))
    assert.equal(second.status, 201, 'a declined offer leaves room for another')
    assert.equal((await ada.client('POST', '/api/challenges', terms('ben'))).body.code, 'already_open', 'but not two at once')
    assert.equal((await ada.client('POST', `/api/challenges/${second.body.challenge.id}/cancel`, {})).status, 200)
    assert.equal((await ben.client('POST', `/api/challenges/${second.body.challenge.id}/respond`, { accept: true })).status, 409, 'a withdrawn offer cannot be accepted')

    assert.equal((await ben.client('PUT', '/api/me/settings', { challengesOpen: false })).body.user.challengesOpen, false)
    const closed = await ada.client('POST', '/api/challenges', terms('ben'))
    assert.equal(closed.status, 403)
    assert.equal(closed.body.code, 'closed')
    await ben.client('PUT', '/api/me/settings', { challengesOpen: true })

    const greedy = await ada.client('POST', '/api/challenges', { ...terms('ben'), rewardXp: 2000 })
    assert.equal(greedy.status, 400, 'a three-day duel cannot promise more XP than its cap')
    assert.equal(greedy.body.field, 'rewardXp')
  })

  it('leaves a message request for its recipient to answer, and keeps under-18s’ protections on the server', async () => {
    const started = await ben.client('POST', '/api/messages/start', { username: 'dan', body: 'Hey Dan, want to duel on reading?' })
    assert.equal(started.status, 201)
    const id = started.body.conversation.id
    assert.equal(started.body.conversation.requestForMe, false)
    const inbox = await dan.client('GET', '/api/messages')
    assert.equal(inbox.body.requests, 1)
    assert.equal(inbox.body.conversations[0].requestForMe, true)

    for (const [method, path, body] of [
      ['GET', `/api/messages/${id}`],
      ['POST', `/api/messages/${id}`, { body: 'Let me in' }],
      ['POST', `/api/messages/${id}/accept`, {}],
      ['POST', `/api/messages/${id}/decline`, {}],
    ]) {
      assert.equal((await ada.client(method, path, body)).status, 404, `an outsider cannot ${method} ${path.replace(id, ':id')}`)
    }
    assert.equal((await ben.client('POST', `/api/messages/${id}/accept`, {})).status, 409, 'the sender cannot accept their own request')

    assert.equal((await dan.client('POST', `/api/messages/${id}/decline`, {})).status, 200)
    assert.equal((await dan.client('GET', '/api/messages')).body.conversations.length, 0, 'a declined request leaves the inbox')
    assert.equal((await ben.client('GET', '/api/messages')).body.conversations.length, 1, 'and stays, quietly, with the sender')

    const number = await ben.client('POST', `/api/messages/${id}`, { body: 'Text me on +44 7700 900123 instead' })
    assert.equal(number.status, 400)
    assert.equal(number.body.code, 'contact_details')

    // An adult and a sixteen-year-old may talk, with the riskier requests stopped.
    const hello = await ada.client('POST', '/api/messages/start', { username: 'cy', body: 'Good luck with the maths quest' })
    assert.equal(hello.status, 201)
    assert.equal(hello.body.conversation.otherAge, 'under18')
    const school = await ada.client('POST', `/api/messages/${hello.body.conversation.id}`, { body: 'What school do you go to?' })
    assert.equal(school.status, 400)
    assert.equal(school.body.code, 'unsafe')

    // The young player turns contact with adults off, and every way in closes.
    assert.equal((await cy.client('PUT', '/api/me/settings', { adultMessages: false })).body.user.adultMessages, false)
    assert.equal((await ada.client('GET', '/api/users/cy')).status, 404)
    assert.equal((await ada.client('POST', `/api/messages/${hello.body.conversation.id}`, { body: 'Are you still there?' })).status, 404)
    assert.equal((await ada.client('POST', '/api/challenges', terms('cy'))).status, 404)
    const toCy = await cy.client('GET', '/api/messages/with/ada')
    assert.equal(toCy.status, 404)
    assert.match(toCy.body.error, /turned off contact with adults/, 'said plainly to the young player')
    assert.equal((await ada.client('GET', '/api/users/cy')).body.error, 'That player is not available.', 'and to the adult, no different from anyone unavailable')
    assert.equal((await ada.client('PUT', '/api/me/settings', { adultMessages: false })).body.user.adultMessages, true, 'an adult has no such switch')
  })

  it('takes a suspended or disabled account out at once, and keeps those powers with staff', async () => {
    for (const [action, body] of [['suspend', { days: 1 }], ['disabled', { disabled: true }], ['role', { role: 'admin' }], ['xp', { delta: 500 }], ['reset-link', {}]]) {
      assert.equal((await ada.client('POST', `/api/admin/users/${ben.id}/${action}`, body)).status, 404, `a player cannot ${action}`)
    }
    assert.equal((await ada.client('DELETE', `/api/admin/users/${ben.id}`)).status, 404)
    assert.equal((await warden.client('POST', `/api/admin/users/${warden.id}/role`, { role: 'superadmin' })).status, 404, 'an admin cannot promote themselves')
    assert.equal((await warden.client('DELETE', `/api/admin/users/${ben.id}`)).status, 404, 'deleting accounts is for the superadmin')
    assert.equal((await warden.client('POST', `/api/admin/users/${chief.id}/suspend`, { days: 3 })).status, 403, 'nor can an admin suspend the superadmin')
    assert.equal((await warden.client('POST', `/api/admin/users/${warden.id}/disabled`, { disabled: true })).status, 400, 'or lock themselves out')

    assert.equal((await ben.client('GET', '/api/me')).status, 200)
    assert.equal((await warden.client('POST', `/api/admin/users/${ben.id}/suspend`, { days: 2 })).status, 200)
    // Every session ends with the suspension; signing back in is what explains why.
    assert.equal((await ben.client('GET', '/api/me')).status, 401, 'a session already open stops working')
    await warden.client('POST', `/api/admin/users/${ben.id}/suspend`, { until: null })
    assert.equal((await ben.client('GET', '/api/me')).status, 401, 'and does not come back when the suspension is lifted')

    assert.equal((await warden.client('POST', `/api/admin/users/${dan.id}/disabled`, { disabled: true })).status, 200)
    assert.equal((await dan.client('GET', '/api/me')).status, 401)
    assert.equal((await ada.client('GET', '/api/users/dan')).status, 404, 'nobody can reach a disabled account')

    const denied = await chief.client('GET', '/api/admin/audit?event=authz.denied')
    assert.ok(denied.body.entries.some((e) => e.user_id === ada.id || e.email === 'ada@example.test'), 'every refused attempt is on the security log')
    const actions = await chief.client('GET', '/api/admin/audit?prefix=admin')
    assert.ok(['admin.suspend', 'admin.set_disabled'].every((event) => actions.body.entries.some((e) => e.event === event)))
  })

  it('does only what a request is allowed to, whatever else it carries and wherever it comes from', async () => {
    const quest = await ada.client('POST', '/api/quests', { type: 'optional', title: 'Tidy the notes', durationMin: 10, xp: 99999, status: 'completed', userId: cy.id })
    assert.equal(quest.status, 201)
    assert.ok(quest.body.quest.xp < 1000, 'the reward is the server’s figure')
    assert.notEqual(quest.body.quest.status, 'completed')
    assert.equal((await cy.client('GET', `/api/quests/${quest.body.quest.id}`)).status, 404, 'and it is Ada’s, not whoever the body names')
    const edited = await ada.client('PATCH', `/api/quests/${quest.body.quest.id}`, { title: 'Tidy all the notes', xp: 50000, xpReward: 50000 })
    assert.equal(edited.status, 200)
    assert.equal(edited.body.quest.xp, quest.body.quest.xp)

    const saved = await ada.client('PUT', '/api/state', { state: { onboarded: true, player: { name: 'Ada', character: 'female', createdAt: '2026-08-01T00:00:00.000Z' }, goals: [], xp: 999999, level: 99 } })
    assert.ok(saved.status < 300)
    const progress = await ada.client('GET', '/api/game')
    assert.ok(progress.body.progress.xp < 1000 && progress.body.progress.level < 5, 'progress written into a save is not progress')

    const cookie = { Cookie: `questly_session=${ada.token}` }
    const foreign = await postJson('/api/posts', { kind: 'update', body: 'Posted from somewhere else entirely' }, { ...cookie, Origin: 'https://evil.example' })
    assert.equal(foreign.status, 403, 'a change sent from another site is refused')
    const home = await postJson('/api/posts', { kind: 'update', body: 'Posted from Questly itself' }, { ...cookie, Origin: url('') })
    assert.equal(home.status, 201)
    const peek = await fetch(url('/api/feed'), { headers: { ...cookie, Origin: 'https://evil.example' } })
    assert.equal(peek.headers.get('access-control-allow-origin'), null, 'and no other site may read an answer')
    assert.ok(!(await ada.client('GET', '/api/feed')).body.posts.some((p) => p.body.includes('somewhere else')))
  })

  it('opens the website to a visitor and the app to everyone else', async (t) => {
    const visitor = await fetch(url('/'))
    // Only when there is a build to serve; a clean checkout has no dist yet.
    if (!visitor.ok) return t.skip('nothing built to serve')
    const page = await visitor.text()
    assert.match(page, /Turn your goals into quests/, 'a visitor gets the website')
    assert.doesNotMatch(page, /id="root"/, 'which is a page, not the app')
    assert.equal(visitor.headers.get('x-questly-shell'), null)

    for (const [path, headers] of [
      ['/?app=1', {}],
      ['/', { Cookie: `questly_session=${ada.token}` }],
      ['/signin', {}],
      ['/join', {}],
    ]) {
      const res = await fetch(url(path), { headers })
      assert.match(await res.text(), /id="root"/, `${path} serves the app`)
      assert.equal(res.headers.get('x-questly-shell'), 'app', `${path} is marked as the app, for the service worker`)
    }

    // The update check names the build by the same script the app page loads.
    const app = await (await fetch(url('/?app=1'))).text()
    const { build } = await (await fetch(url('/api/version'))).json()
    assert.ok(build, 'the served build has a name')
    assert.ok(app.includes(`src="${build}"`), 'and it is the script the app page loads')
  })
})
