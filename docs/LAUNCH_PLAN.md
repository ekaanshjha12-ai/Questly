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
5. **World map is a tile-based canvas** generated from code, rendered once
   per time of day and cached; markers are DOM elements for accessibility.
   Loaded as its own chunk.
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
| 8 | World map: regions, locks, time of day, club buildings, events | Done: pixel overworld, 9 regions with server-judged locks, 2 weekly quests per region, monthly world events paid through the ledger, morning/day/evening/night |
| 9 | Adventure Log upgrades, comments, appreciation, report queue, message filters | Done: appreciate, comments (filtered for abuse, contact details and cross-age risks; rate-limited; hidden across blocks; removable by author, post owner or club leader), challenge from a post, share link and post pages, quests / duels / achievements / focus sessions attached from the server's records, comment and conversation reports with saved content, new Chronicle Log alerts |
| 10 | Onboarding paths and first quests | Done: path (Scholar, Builder, Creator, Discipline, Explorer), pixel hero, goals, first-quest contract |
| 11 | Admin: reports, moderation, clubs, metrics | Planned |
| 12 | Legal and policy pages, privacy controls | Planned |
| 13 | Analytics events and retention | Planned |
| 14 | Security hardening (S3–S10) | Done |
| 15 | Performance: code splitting, lazy world/3D | Started: every screen away from the hub and the 3D viewer load on demand |
| 16 | Full QA pass and final security review | Planned |

## Remaining

Kept up to date as phases land.

- **Main bundle** is about 532 kB (168 kB gzipped). The sound engine and
  motion library are the bulk; splitting them is part of phase 15.
- **Admin phase 11** still has to add metrics; the report queue already takes
  posts, comments, conversations, players, duels and clubs.
- Fixed along the way: the inline theme script in `index.html` was blocked by
  the Content Security Policy in production, so the saved theme never applied
  before first paint. It now loads from `/theme-init.js`.
