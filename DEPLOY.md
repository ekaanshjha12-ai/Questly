# Deploying Questly

Questly is a **stateful Node server**, not a static site. Accounts and progress live
in a SQLite file on disk, so it needs a host that gives you a **persistent volume**.

Avoid Vercel, Netlify, Cloudflare Pages and Render's free tier — they all use
ephemeral filesystems, and every account would be wiped on each deploy or restart.

---

## 1. Push to GitHub

```bash
git init && git add -A && git commit -m "Questly v1"
```

Create an empty repo at <https://github.com/new> (no README), then:

```bash
git remote add origin https://github.com/YOUR-NAME/questly.git && git branch -M main && git push -u origin main
```

`.env`, `dist/` and `server/data/` are gitignored, so no keys or local accounts
get pushed.

## 2. Create the Railway service

1. <https://railway.app> → sign in with GitHub
2. **New Project → Deploy from GitHub repo** → pick your repo
3. Railway detects Node, runs `npm run build`, then `npm start`

## 3. Attach the volume — before anyone signs up

**Settings → Volumes → mount at `/app/server/data`.**

Do this before sharing the link. Without a volume, SQLite writes to the
container's temp disk and every account vanishes on the next deploy.

If you mount somewhere else, set `DATA_DIR` to that path instead.

## 4. Set environment variables

| Variable | Required | What it does |
|---|---|---|
| `NODE_ENV` | Yes | Set to `production`. Enables secure cookies and proxy-aware rate limiting. |
| `INVITE_CODE` | Recommended | Signup requires this code. Leave unset to let anyone with the link register. |
| `ANTHROPIC_API_KEY` | Optional | Turns on photo/voice quest verification. Without it the feature shows a clear "not switched on" message and everything else works. |
| `VERIFY_DAILY_LIMIT` | Optional | Verification checks per person per day. Defaults to `10`. Set `0` to disable. |
| `DATA_DIR` | Optional | Where the SQLite file lives. Defaults to `server/data`. |
| `PORT` | No | Railway sets this automatically. |
| `QUESTLY_OPERATOR_NAME` | Recommended | Who runs Questly — a person or a company. Shown in the Terms and Privacy Policy. Defaults to "the Questly team". |
| `QUESTLY_CONTACT_EMAIL` | Recommended | Where people can write. Shown in the policies and on Contact & support. Without it, contact goes through the in-app form only. |
| `QUESTLY_GOVERNING_LAW` | Optional | For example `England and Wales`. Adds a governing-law section to the Terms; left out when unset. |
| `QUESTLY_HOSTING_PROVIDER` | Optional | For example `Railway`. Named in the Privacy Policy as where data is stored. |
| `DELETED_CONTENT_RETENTION_DAYS` | Optional | Days a deleted post or comment is kept before it is erased. Defaults to `30`. |
| `AUDIT_LOG_RETENTION_DAYS` | Optional | Days the security log (with IP addresses) is kept. Defaults to `180`. |
| `CLOSED_REPORT_RETENTION_DAYS` | Optional | Days a closed moderation report is kept. Defaults to `365`. |
| `SUPPORT_RETENTION_DAYS` | Optional | Days a closed support request is kept. Defaults to `365`. |

### The policy documents

Terms of Service, Privacy Policy, Community Guidelines and the Safety Centre
start from `server/policies/*.md`. They are written to describe how this code
actually behaves, but **they are a starting point, not legal advice** — have
them reviewed for the places you operate before launch. Edit them in the
admin console under **Policies** (superadmin only); every version is kept, and
ticking "significant change" asks every player to accept the new Terms or
Privacy Policy.

## 5. Get the URL

**Settings → Networking → Generate Domain.**

Keep the service at **1 instance**. Two containers writing the same SQLite file
will corrupt it.

---

## Costs

Roughly **$5/month** for the Railway service and volume.

If `ANTHROPIC_API_KEY` is set, each photo check is a vision call billed to your
Anthropic account — around a cent or two. `VERIFY_DAILY_LIMIT` caps how much any
one tester can spend per day; with 5 friends at the default 10/day the worst case
is a couple of dollars a day, so lower it if that matters.

## Photo proof rules

Levelling up requires two verified **photos** (voice pays XP but never unlocks a
level). A photo is rejected when it:

- has already been used as proof by that account — matched perceptually, so
  resizing, cropping or re-saving it does not get around the check
- was taken more than a day ago, when the file carries a capture time
- reads as stock imagery, a screenshot of someone else's content, or a photo of
  a screen
- gets only a hedged approval from the model (below 0.7 confidence)

Rejected photos are not banked, so a tester can retake and resubmit the same
scene. Each attempt still costs one of their daily checks.

This raises the effort of faking a quest well above just doing it, but it is not
airtight — a determined person can photograph someone else's gym. Treat it as an
honesty mechanism, not security.

## What to tell testers

- **Give it a week.** Daily quests refresh once a day and streaks need
  consecutive days, so one sitting won't show much.
- **There is no password reset.** Tell them to save their password — recovery
  means deleting their row from the database by hand.
- Share the invite code privately along with the link.

## Redeploying

Push to `main` and Railway rebuilds. The volume is untouched, so accounts and
progress survive. This was tested locally: sessions, saved state and verification
quotas all persisted across a full server restart.

## Looking at the data

The SQLite file is at `server/data/questly.db` (or `$DATA_DIR`). Tables:
`users`, `sessions`, `states` (one JSON blob per user), `verify_usage`.

To remove a tester's account and everything attached to it:

```sql
DELETE FROM users WHERE email = 'them@example.com';
```

Sessions, state and usage rows cascade automatically.
