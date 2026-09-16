# Questly launch plan

Audit of the existing app, the gaps against the launch direction, and the order
the work is being done in. The "Status" column is kept current as phases ship;
anything not yet built is listed under **Remaining** at the bottom rather than
faked in the UI.

## 1. What exists

### Architecture

| Layer | What it is |
|---|---|
| Client | Vite 5 + React 18 + TypeScript, Tailwind 3 with CSS-variable themes, framer-motion, lucide icons, three.js (3D avatars). Single-page app with view state, no router. PWA (manifest + service worker). |
| Server | Express 5, one process (`server/index.js`, ~2.8k lines) plus focused modules (auth, security, moderation, challenges, media, image safety, AI features). |
| Database | SQLite through `node-sqlite3-wasm`, WAL, file on a mounted volume (`DATA_DIR`). Schema created and migrated in `server/db.js` on boot. |
| Auth | Email + password (scrypt, per-user salt), server-side sessions in `sessions`, httpOnly SameSite=Lax cookie, recovery code instead of email reset, optional TOTP, one-time admin setup links, roles `user/admin/superadmin` stored server-side. |
| AI | Anthropic SDK: quest pool writer, flashcards, explain coach, AI planner, progress outlook, guide tour, photo/voice proof, image and video safety screening. Metered per call. |
| Deploy | Railway, single instance, volume at `/data`, `npm run build` then `npm start`. Env: `NODE_ENV`, `ANTHROPIC_API_KEY`, `VERIFY_DAILY_LIMIT`, `INVITE_CODE`, `DATA_DIR`, `PUBLIC_URL`. No secrets in the client bundle. |

### Features already working

- Accounts: signup with profile (username, display name, birthdate ≥ 15), login, recovery-code reset, logout, data export, account deletion with password, optional MFA.
- Goals → generated quest slates (4 daily, 1 weekly, 3 monthly), AI-written quest pools per goal, photo/voice proof with perceptual-hash duplicate detection.
- To-dos, planner (day/week/month with drag placement), AI planner, habits grid + moods, study decks + explain coach, progress stats + AI outlook, achievements (18), ranks + 8 purchasable 3D characters.
- Focus timer/stopwatch with plans, ambient sounds + procedural music.
- Profile card with a designer (fields, text, stickers, freehand drawing).
- Social: feed with photos/videos (safety-screened), player search, player cards, block/report, direct messages with requests and cross-age safety rules, challenges (offer → accept → daily check-ins → settlement) with their own chat, leaderboard with opt-out.
- Admin console: users, suspend/disable/role/XP grant/reset link/delete, stats dashboard, audit log.

## 2. Gaps against the launch direction

| Area | Today | Needed |
|---|---|---|
| Progression authority | XP, coins, level, streak, achievements, unlocks, quest completion and focus XP are computed **in the browser** and saved as one JSON document. The server only bounds claims (≤400 XP/min, ≤20k per save). | Server-authoritative ledger: the server decides every reward from actions it can check, with one reward per source. |
| Quests | Generated periodic quests + separate to-dos. No types, states, rarity, difficulty, deadlines or progress. | Quest system with Main/Side/Daily/Club/Challenge/Optional types, LOCKED→EXPIRED states, rarity, progress, deadlines, server-validated completion. |
| Focus | Client timer; XP from client-reported duration. | Server-timed sessions (start/pause/resume/finish), single use, XP computed from server timestamps, victory screen. |
| Character & inventory | Two 3D bodies + 8 buyable 3D models. | Persistent 2D character shown everywhere, equipment slots, rarity, owned/equipped/locked states, server-validated unlocks. The 3D models become legendary specials. |
| Navigation & design | Hub of cards + Focus/Social mode switch; light clay / dark themes. | Six-tab navigation (Home, Quests, Social, Challenges, Clubs, Profile), premium dark RPG design system, parchment quest contracts. |
| Clubs | Not built (`posts.club_id` column reserved). | Clubs with entry trials, mandatory/optional/public challenges, Club XP, ranks, leaderboard, chat, owner controls, buildings that evolve. |
| World | Not built. | World map with regions, locked areas, time of day, club buildings and events. |
| Notifications | Toasts only. | Persistent Chronicle Log. |
| Social | Posts, delete, report-to-audit-log. | Appreciate, comments, share, challenge-from-post, a real report queue. |
| Moderation | Reports are audit-log lines. | Reports table with status, content snapshot and admin actions. |
| Legal | None in-app. | Terms, Privacy, Guidelines, Safety, Contact, Report a problem — configurable. |
| Analytics | AI cost metering only. | Privacy-light product events and retention. |
| Performance | One 1.66 MB JS bundle (three.js included). | Code-split heavy features; world assets lazy. |
| Tests | None committed; build is the only check. | API test suite covering auth, rewards, IDOR and permissions. |

## 3. Security findings

| # | Severity | Finding | Fix | Status |
|---|---|---|---|---|
| S1 | High | Client-authoritative economy: a scripted client can mint XP/coins up to the rate ceiling, which also drives the leaderboard. | Ledger with unique `(user, source, source_id)`; rewards computed server-side; state saves can no longer carry progress. | Fixed |
| S2 | High | Challenge rewards are paid by the client adding an "XP allowance". | Settlement writes directly to the ledger. | Fixed |
| S3 | Medium | 12 MB JSON body limit on every route. | Small default limit; larger limits only on the upload routes. | Fixed |
| S4 | Medium | Session tokens stored in plaintext. | Store SHA-256 of the token; existing sessions migrated. | Fixed (`s256:` hashes, migrated on boot) |
| S5 | Medium | Login throttled per IP only. | Per-account failure backoff in addition. | Fixed (`server/loginguard.js`: login, 2FA, recovery code, account deletion) |
| S6 | Medium | Reports only land in the audit log; no workflow. | `reports` table + admin queue + actions. | Fixed (snapshots, dedupe, dismiss / take down / suspend, reporter notified) |
| S7 | Medium | AI routes return upstream error text (`detail`) to clients. | Generic messages; details only in server logs. | Fixed |
| S8 | Low | Uploaded images keep metadata (EXIF/GPS) if sent directly to the API. | Server strips JPEG APP1/PNG text/WebP EXIF chunks. | Fixed (`server/imagemeta.js`; JPEG orientation kept) |
| S9 | Low | Names shown to other players come from the client document. | Use the server-held display name. | Fixed |
| S10 | Low | Card designs from the client document are passed to other players with light validation. | Validate/normalise card payloads server-side. | Fixed (`server/card.js`, on save and on view) |
| S11 | Medium | A recovery code kept working after it was used, so anyone who had once seen it could take the account again after the owner recovered it. | Using a code issues a new one (shown once) and spends the old; one code cannot be used twice. | Fixed (phase 16) |
| S12 | Low | A malformed URL reached Express's own error page: HTML, with the stack and server paths whenever `NODE_ENV` is not exactly `production`. | A final handler logs the error and answers with a plain message, JSON on the API. | Fixed (phase 16) |
| S13 | Moderate | `qs` 6.15 (query parsing, through Express): two denial-of-service advisories. | Updated to 6.16. | Fixed (phase 16); production dependencies audit clean |
| S14 | Low | The data export left out direct messages, duel chat and check-ins, support requests, accepted policies, blocks, reports filed, product events, sessions and the profile picture. | Export everything held about the account; other people's messages and moderation records about the player stay out. | Fixed (phase 16) |

Already sound: parameterised SQL with column allow-lists, CSP without inline
script, `nosniff`, frame denial, SameSite cookies + Origin check, roles read
fresh per request, admin routes 404 to non-admins, hashed recovery/setup codes,
content filter on stored text, image magic-byte checks, video transcode that
drops metadata, cross-age messaging protections, account export and deletion.

## 4. Key decisions

1. **Keep the state document for notebook data** (goals, habits, moods,
   schedule, decks, reports, card design). Move everything that is *earned* —
   XP, coins, level, streak, achievements, inventory, quests, focus sessions,
   challenge and club rewards — into server tables. Existing progress is
   migrated once per account as an opening balance, so nobody loses anything.
2. **Photo-proof level gate is retired.** It existed because the client
   claimed its own XP. With server-computed XP it only blocks honest players;
   proof now earns bonus XP and lifts the daily self-reported cap instead.
3. **Reward rules** (server): focus-timed progress pays in full; proof-verified
   completions pay in full plus a bonus; self-reported completions pay up to a
   daily ceiling. Every reward is keyed to its source, so it is paid once.
4. **Character art is 2D pixel sprites drawn from code** (layered body,
   clothing, head, back, tool, pet), so it renders anywhere cheaply and every
   item is visible on the character. The 3D models stay as legendary specials,
   loaded only when viewed.
5. **World map is a painted illustration** lit per time of day with CSS
   filters; region labels, club halls and markers are DOM elements laid over
   it, so they stay buttons and links for accessibility. Loaded as its own
   chunk. (The first plan was a tile canvas drawn from code; the painted map
   replaced it.)
6. **No new runtime dependencies** unless unavoidable; a tiny history router
   replaces view state so screens have URLs.
7. **No gambling or stakes of any kind.** Challenge and club rewards are XP,
   Club XP, cosmetics and recognition only. Club consequences are limited to
   warnings, loss of Club XP standing and removal (with rejoin via trials).

## 5. Phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Server progression core: ledger, levels, quests, focus sessions, achievements, inventory, notifications, migration, tests | Done |
| 2 | Client switches to server progression; existing screens keep working | Done |
| 3 | Design system, navigation, router, Home hub, Quest Board, Focus Mode + victory, Level Up | Done |
| 4 | Character, wardrobe/inventory, Questly Card upgrade | Done |
| 5 | Chronicle Log notifications | Done |
| 6 | Duels: states, VS screen, focus-validated progress, rewards via ledger | Done: focus duels count server-timed minutes; check-in duels kept; Sent/Completed/Failed states; VS screen with countdown; drafts kept on device |
| 7 | Clubs: entry trials, mandatory/optional/public challenges, Club XP, ranks, leaderboard, chat, owner controls | Done: server-judged trials (focus, quests, streak, proof, duels), level gate, owner/officer/member roles, challenges with warning / Club XP loss / removal, Club XP ledger, leaderboard, chat, club feed and announcements, invitations, reports and admin takedown |
| 8 | World map: regions, locks, time of day, club buildings, events | Done: painted archipelago (Verdant Woods, Mistveil Swamp, Frostpeak, Golden Plains, Coastal Crown, The Lost Ruins, Emberlands, Sunscorch, The Summit around The Grand Guild), 9 regions with server-judged locks shown as mist, 2 weekly quests per region, monthly world events paid through the ledger, club halls on the map, morning/day/evening/night lighting; the art ships as WebP (508 kB full, 152 kB half size, a 446-byte blur placeholder) and loads only with the map |
| 9 | Adventure Log upgrades, comments, appreciation, report queue, message filters | Done: appreciate, comments (filtered for abuse, contact details and cross-age risks; rate-limited; hidden across blocks; removable by author, post owner or club leader), challenge from a post, share link and post pages, quests / duels / achievements / focus sessions attached from the server's records, comment and conversation reports with saved content, new Chronicle Log alerts |
| 10 | Onboarding paths and first quests | Done: path (Scholar, Builder, Creator, Discipline, Explorer), pixel hero, goals, first-quest contract |
| 11 | Admin: reports, moderation, clubs, metrics | Done: console grouped into Insights / Moderation / People / Settings; posts and comments with takedowns that tell the author; duels with a cancel for open ones; searchable security log (sign-ins, admin actions, blocked content, reports, account changes, denied access); system health (uptime, memory, database and media size, requests, 4xx/5xx, response times, recent server errors, records, features, retention sweep); a needs-attention row |
| 12 | Legal and policy pages, privacy controls | Done: Terms, Privacy Policy, Community Guidelines and Safety Centre readable signed in or out, filled in from the environment and edited with version history by the superadmin; terms agreed to at sign-up and again after a significant change; Contact & support (also for people who cannot sign in) with an admin queue and in-app replies; retention sweep erasing deleted posts and comments, old security log entries, closed reports and support requests, and video files left behind by deleted accounts |
| 13 | Analytics events and retention | Done: events for sign-up, onboarding, first quest and focus session, quests, focus, level-ups, duels, clubs and posts; active players and stickiness; how far new accounts get; weekly-cohort retention (next day, week 1, 2, 4); 30-day trends with a table view — aggregates only, no personal data |
| 14 | Security hardening (S3–S10) | Done |
| 15 | Performance: code splitting, lazy world/3D | Done: every screen away from the hub, the 3D viewer, the music composer, the animation features and the sign-in screens load on demand (main script 538 kB to 370 kB, 99 kB over the wire); built text files ship as Brotli and gzip copies; larger API answers are gzipped; images stay separate cacheable files; indexes for club feeds, shared records, reports, deleted posts and open duels |
| 16 | Full QA pass and final security review | Done: 62 API tests in 10 suites, run against a real server on a throwaway database (see below); S11–S14 found and fixed; every route's guard, every dynamic SQL fragment, the client bundle and the dependencies reviewed |

### What the tests walk through (phase 16)

- **Accounts:** sign-up (terms required, under-15s refused, a `role` in the body ignored), sign-out ending the session on the server, sign-in, the per-account lockout, recovery codes spent once and replaced, profile edits with the birthdate locked, the export, deletion needing the password and taking posts and conversations with it, the email free again afterwards.
- **Progression:** quests paid once at the server's rate, progress smuggled into a save or a request body ignored, the daily self-reported cap, server-timed focus, the admin XP adjustment through the ledger.
- **Duels:** offer, accept, decline, withdraw, one open offer per pair, reward caps, closed challenges, focus duels counting timed minutes only, settlement paid once; outsiders get 404 on every duel route.
- **Clubs:** founding standing, trials judged from what happened, the level gate, leaders' powers, chat and posts kept to members, Club XP, consequences, platform takedown.
- **Social and messaging:** appreciation, comments with filters, rate limits and blocks, club-only posts, records attached only from the server's data, reports with snapshots; message requests only the recipient can answer, contact details refused, adult-to-under-18 risks refused, and contact with adults switched off closing every way in.
- **Staff:** every console route 404s for players and is logged; admins cannot promote themselves, delete accounts or touch the superadmin; suspending or disabling ends open sessions at once.
- **Requests themselves:** cross-site changes refused, no CORS, malformed URLs and bodies answered in JSON without internals, oversized bodies refused, uploaded pictures stripped of metadata, sessions stored hashed.
- **World, legal, retention:** region locks and quests, events paid once, policy versions and re-acceptance, support for signed-out visitors, the retention sweep.

## After the plan

Work that came after the sixteen phases, in the order it shipped.

- **Home is a room.** The drawn 160 × 84 base scene gives way to three painted
  studies that follow the player's clock — sunrise, lamplight, rain at night —
  running edge to edge behind the top of Home. The fade behind the title is set
  from measured contrast: the greeting holds 4.5:1 over the brightest and
  darkest pixel of any room, in either theme, from 375 px to 1920 px.
- **Every region has its own buildings.** Sixty new pictures, a four-step ladder
  per region matched to how that land is painted on the map, and the editor grid
  removed from the screenshots by fitting and inverting each line's blend.
- **One quest scale, and quests written for the player's age.** A quest's level
  is its length; reward follows from that and its type, rarity from the reward,
  everywhere. Goal quests take their length from their own wording. Players
  under 18 get school, pocket money and eight to ten hours of sleep instead of
  resumes, debt and progress photos; over 65, gentler exercise. The AI writer
  and planner are told the age group and nothing more.
- **Phones keep up.** The server reports the build it serves; an app that has
  been open or installed for a while checks when it comes back into view and
  reloads onto a newer build, or switches at the next change of screen.
- **A website.** `/` serves a static page about Questly to anyone not signed in
  — the app to everyone else — built as a second entry point of the same build
  and served from the same deployment.

## Remaining

Kept up to date as phases land.

- Fixed along the way: the inline theme script in `index.html` was blocked by
  the Content Security Policy in production, so the saved theme never applied
  before first paint. It now loads from `/theme-init.js`.
- **Dev tooling advisory:** Vite 5's bundled esbuild has a moderate advisory
  for its development server. It never runs in production (the build is
  static files); clearing it needs the Vite 6+ major upgrade, worth doing
  after launch rather than the week of it.
- **Single instance:** rate limits and request metrics are held in memory, so
  they reset on a restart and would need shared storage before running more
  than one server process.
- **Admin second factor is optional** (`mfaRequiredFor` returns false): the
  operator has no authenticator device today. Admin passwords are held to 16
  characters meanwhile; turn the requirement on as soon as a device is set up.
- **Age is self-declared** at sign-up and locked afterwards. There is no
  document or payment-based age check.
- **No email delivery:** password recovery is by the code saved at sign-up,
  and support replies appear in the app rather than by email.
