> The short version: Questly keeps what it needs to run your account and the game, shows other players only what is meant to be seen, does not show ads or sell your information, and lets you download or delete your data at any time.

## 1. Who is responsible

Questly is run by {{operator}}, who are responsible for how your information is handled here. {{#contactEmail}}You can reach us at {{contactEmail}}.{{/contactEmail}}{{^contactEmail}}You can reach us through [Contact & support](/support).{{/contactEmail}}

You choose what you share on Questly and are responsible for the personal information you put in posts, messages and your profile. Questly is responsible for looking after the information it holds.

## 2. What Questly collects

**Your account**

- Email address, used to sign in.
- Password and recovery code — stored only as one-way hashes, never in readable form.
- Username, display name and date of birth.
- Optional: bio, profile picture and your Questly Card design.

**What you create**

- Goals, quests, plans, habits, flashcards and notes.
- Posts (text, photos and videos), comments and appreciations.
- Direct messages, duel messages and check-ins, club messages.
- Reports you file and messages you send to support.

**What the game needs to work**

- Quest progress and completions, focus sessions (when they started and stopped, and for how long), XP and coin history, levels, streaks, achievements and items.
- Duels, club memberships, Club XP and notifications.

**Security and running the service**

- Sign-in sessions. The session token is random and stored hashed; sessions last up to {{sessionDays}} days.
- Failed sign-in attempts, recorded against a hash of the email address to slow down password guessing.
- A security log of sign-ins, sign-ups, account changes, blocked content and moderation actions. Entries include the IP address the request came from.

**Product analytics**

- Simple events such as "completed a quest" or "joined a club", with the date and a few small details, and which days an account was active. These never include text you typed or your IP address. They are used to count how Questly is used, and are deleted with your account.

**What Questly does not collect**

- No precise location. Location and camera details are removed from photos before they are stored.
- No advertising identifiers and no third-party tracking or advertising cookies.

## 3. How your information is used

- To run your account and the game: saving progress, working out XP, levels and rewards, running duels, clubs and events.
- To show your profile, card and posts to other players as described below.
- To keep people safe: word filters, blocking contact details in messages and comments, extra protections between adults and under-18s, screening photos and videos before they are posted, and handling reports.
- To protect Questly: rate limits, preventing abuse and investigating security problems.
- To answer support requests.
- To improve Questly, using totals and trends rather than individual activity.

Questly does not show advertising and does not sell your personal information.

## 4. What other players can see

- **Your Questly Card and profile:** display name, username, age, level, rank, bio, picture and card design.
- **The Adventure Log:** posts and comments are visible to signed-in players. Club posts are shown in that club's feed.
- **Leaderboard:** your name, level and XP, unless you choose "hide me" on the leaderboard.
- **Private spaces:** direct messages are visible only to the two people in the conversation; duel chat to the two players; club chat to club members.
- **Blocking** hides you and the other person from each other.

The Questly team can see account and content information when it is needed to run Questly, review reports or keep people safe.

## 5. Services that process information for Questly

- **Hosting.** Questly's database and uploaded media are stored on servers run by {{#hostingProvider}}{{hostingProvider}}{{/hostingProvider}}{{^hostingProvider}}our hosting provider{{/hostingProvider}}.
{{#aiEnabled}}
- **Anthropic (AI model provider).** When you use AI features, the information needed for that feature is sent to Anthropic's API to produce a result: for example your goal and answers for a study plan, the topic for flashcards, a photo or voice transcript for a proof check, and photos or frames from videos to check they are safe before they are posted.
{{/aiEnabled}}
- **Your browser's speech recognition.** Voice check-ins use the speech recognition built into your browser, which some browsers send to their maker's servers (for example Google, in Chrome). Questly receives only the text.
- Videos are converted on Questly's own servers.

## 6. How long information is kept

- **While your account exists**, Questly keeps your account, content and progress so the game works.
- **Deleted posts and comments** disappear straight away and are permanently erased after {{deletedContentDays}} days, or once any open report about them has been reviewed.
- **The security log** is kept for {{auditLogDays}} days.
- **Moderation records**, including a copy of reported content, are kept for up to {{reportDays}} days after the report is closed.
- **Support requests** are kept for up to {{supportDays}} days after they are closed.

**When you delete your account**, it is deleted immediately along with your profile, progress, notebook, posts, comments, appreciations, messages, duels and club memberships. Conversations you were in are deleted for both people, and clubs you own are closed. Security log entries and moderation records are kept only for the periods above.

## 7. Your choices and rights

- **Change your details** in Profile and Settings.
- **Control contact:** turn duel offers off, hide from the leaderboard, block and report. Players under 18 can also turn off messages and duels from adults.
- **Download your data** in Settings → Account and data → Download my data.
- **Delete your account** in Settings → Account and data → Delete account.
- **Ask us** to access, correct or delete information, or with any privacy question, {{#contactEmail}}at {{contactEmail}}{{/contactEmail}}{{^contactEmail}}through [Contact & support](/support){{/contactEmail}}.

Depending on where you live, you may have further rights, such as objecting to some uses of your information or complaining to a data protection authority.

## 8. Young people

Questly is for people aged {{minimumAge}} and over. Because some players are under 18, Questly adds protections:

- Contact details cannot be sent in messages or comments.
- Messages between adults and under-18s are checked for requests to meet, share photos, reveal where someone lives or keep secrets.
- Players under 18 can choose whether adults can message them or send them duel offers.
{{#aiEnabled}}
- Photos and videos are screened before other people can see them.
{{/aiEnabled}}
{{^aiEnabled}}
- Photo and video posts stay switched off unless a safety check is available to screen them.
{{/aiEnabled}}

If you believe an account belongs to someone under {{minimumAge}}, please tell us and we will act on it.

## 9. Security

Passwords are hashed with scrypt, session tokens are hashed, photos have their metadata removed, and access to other people's data is checked on the server for every request. Sensitive actions are logged. No system is perfectly secure; if a security incident affects your information, we will let you know as the law requires.

## 10. Cookies and storage on your device

- **One sign-in cookie** (`questly_session`), needed to keep you signed in. It cannot be read by scripts on the page.
- **Local storage** for preferences (like theme and sounds), a copy of your notebook so Questly opens offline, and unsent drafts.
- **An app cache** so Questly loads quickly and works as an installed app.

## 11. Changes to this policy

We will update this policy when Questly's handling of information changes. The date at the top shows the last update. If a change is significant, we will tell you in the app.
