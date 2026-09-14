/**
 * Tables for everything a player earns.
 *
 * Until these existed, XP, coins, level, streak, achievements, unlocks, quests
 * and focus sessions lived in the JSON document the browser wrote back, so the
 * server could only put bounds on what a client claimed. Now the server keeps
 * them, decides every change, and the document holds only notebook data the
 * player writes for themselves (goals, habits, schedule, decks, card design).
 *
 * Called from db.js after the core tables exist, so every foreign key has
 * something to point at.
 */
export function createGameSchema(db) {
  /**
   * One row per player: the running totals. Always equal to what the ledger
   * adds up to — the ledger is the record, this is the fast read.
   */
  db.run(`
    CREATE TABLE IF NOT EXISTS player_progress (
      user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      xp               INTEGER NOT NULL DEFAULT 0,
      coins            INTEGER NOT NULL DEFAULT 0,
      level            INTEGER NOT NULL DEFAULT 1,
      streak_current   INTEGER NOT NULL DEFAULT 0,
      streak_longest   INTEGER NOT NULL DEFAULT 0,
      streak_last_day  TEXT,
      timezone         TEXT NOT NULL DEFAULT 'UTC',
      timezone_set_at  TEXT,
      appearance       TEXT,
      path             TEXT,
      flags            TEXT,
      migrated_at      TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    )
  `)

  /**
   * Every change to XP or coins, with what caused it.
   *
   * The unique key is the duplicate-reward guard: a quest, a focus session, a
   * challenge settlement or an achievement can each pay exactly once, however
   * many times a request is replayed or two requests race.
   */
  db.run(`
    CREATE TABLE IF NOT EXISTS xp_ledger (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source      TEXT NOT NULL,
      source_id   TEXT NOT NULL,
      xp          INTEGER NOT NULL DEFAULT 0,
      coins       INTEGER NOT NULL DEFAULT 0,
      verified    INTEGER NOT NULL DEFAULT 1,
      label       TEXT,
      day         TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      UNIQUE (user_id, source, source_id)
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_ledger_user_day ON xp_ledger(user_id, day)')
  db.run('CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON xp_ledger(user_id, id)')

  /**
   * Quests of every kind: ones players write, ones generated from their goals,
   * and ones a club or a duel hands them.
   */
  db.run(`
    CREATE TABLE IF NOT EXISTS quests (
      id                 TEXT PRIMARY KEY,
      user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type               TEXT NOT NULL,
      origin             TEXT NOT NULL,
      gen_key            TEXT,
      goal_id            TEXT,
      club_id            TEXT,
      challenge_id       TEXT,
      period             TEXT,
      period_key         TEXT,
      title              TEXT NOT NULL,
      description        TEXT,
      category           TEXT NOT NULL DEFAULT 'general',
      difficulty         TEXT NOT NULL DEFAULT 'normal',
      duration_min       INTEGER NOT NULL DEFAULT 15,
      xp_reward          INTEGER NOT NULL,
      rarity             TEXT NOT NULL,
      progress_kind      TEXT NOT NULL DEFAULT 'check',
      progress_target    INTEGER,
      progress_value     INTEGER NOT NULL DEFAULT 0,
      progress_unit      TEXT,
      milestones         TEXT,
      min_level          INTEGER,
      status             TEXT NOT NULL,
      starts_at          TEXT,
      deadline_at        TEXT,
      created_at         TEXT NOT NULL,
      started_at         TEXT,
      completed_at       TEXT,
      updated_at         TEXT NOT NULL,
      xp_paid            INTEGER NOT NULL DEFAULT 0,
      verified_by        TEXT,
      verified_at        TEXT,
      verification_note  TEXT,
      pinned             INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_quests_gen ON quests(user_id, gen_key) WHERE gen_key IS NOT NULL')
  db.run('CREATE INDEX IF NOT EXISTS idx_quests_user_status ON quests(user_id, status)')
  db.run('CREATE INDEX IF NOT EXISTS idx_quests_user_period ON quests(user_id, period_key)')

  /**
   * Focus sessions, timed by the server. The client shows a clock; these
   * timestamps are what the reward is worked out from.
   */
  db.run(`
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quest_id      TEXT,
      challenge_id  TEXT,
      club_id       TEXT,
      goal_id       TEXT,
      label         TEXT NOT NULL,
      kind          TEXT NOT NULL,
      target_ms     INTEGER,
      status        TEXT NOT NULL,
      started_at    TEXT NOT NULL,
      paused_at     TEXT,
      paused_ms     INTEGER NOT NULL DEFAULT 0,
      pauses        INTEGER NOT NULL DEFAULT 0,
      ended_at      TEXT,
      active_ms     INTEGER,
      xp            INTEGER NOT NULL DEFAULT 0,
      plan          TEXT,
      legacy        INTEGER NOT NULL DEFAULT 0,
      hidden        INTEGER NOT NULL DEFAULT 0,
      day           TEXT NOT NULL
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_focus_user_started ON focus_sessions(user_id, started_at)')
  db.run('CREATE INDEX IF NOT EXISTS idx_focus_user_status ON focus_sessions(user_id, status)')

  db.run(`
    CREATE TABLE IF NOT EXISTS user_achievements (
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id  TEXT NOT NULL,
      unlocked_at     TEXT NOT NULL,
      PRIMARY KEY (user_id, achievement_id)
    )
  `)

  /** Items a player owns. Only the server inserts here — by level, achievement,
   * purchase or event — so no request can hand itself an item. */
  db.run(`
    CREATE TABLE IF NOT EXISTS user_items (
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id      TEXT NOT NULL,
      source       TEXT NOT NULL,
      acquired_at  TEXT NOT NULL,
      PRIMARY KEY (user_id, item_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS user_equipment (
      user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot     TEXT NOT NULL,
      item_id  TEXT NOT NULL,
      PRIMARY KEY (user_id, slot)
    )
  `)

  /**
   * The notebook document as it was the moment its progress moved into these
   * tables. Kept so that migration can be checked, and undone by hand if it
   * ever had to be. Goes with the account.
   */
  db.run(`
    CREATE TABLE IF NOT EXISTS state_backups (
      user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data        TEXT NOT NULL,
      created_at  TEXT NOT NULL
    )
  `)

  /** The Chronicle Log. */
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT,
      link        TEXT,
      data        TEXT,
      dedupe_key  TEXT,
      created_at  TEXT NOT NULL,
      read_at     TEXT
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(user_id, dedupe_key)')

  /**
   * Product events. Names and small counts only — no free text, no contact
   * details — and they go when the account goes.
   */
  db.run(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      at       TEXT NOT NULL,
      day      TEXT NOT NULL,
      user_id  TEXT REFERENCES users(id) ON DELETE CASCADE,
      event    TEXT NOT NULL,
      props    TEXT
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_analytics_day ON analytics_events(day, event)')
  db.run('CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id, event)')

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_active (
      user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day      TEXT NOT NULL,
      PRIMARY KEY (user_id, day)
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_daily_active_day ON daily_active(day)')
}
