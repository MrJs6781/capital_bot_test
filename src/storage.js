const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
const usePg = !!process.env.DATABASE_URL
let initDb = async () => {}
let upsertUser = async () => {}
let logEvent = async () => {}
let getStats = async () => ({ usersTotal: 0, startsTotal: 0, clicksByName: [] })
let getAllData = async () => ({ users: [], events: [] })
if (usePg) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  })
  initDb = async function() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        language_code TEXT,
        is_bot BOOLEAN,
        created_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT,
        type TEXT,
        name TEXT,
        ts TIMESTAMPTZ,
        metadata TEXT
      )
    `)
  }
  upsertUser = async function(from) {
    const now = new Date().toISOString()
    await pool.query(`
      INSERT INTO users (id, username, first_name, last_name, language_code, is_bot, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO UPDATE SET
        username=EXCLUDED.username,
        first_name=EXCLUDED.first_name,
        last_name=EXCLUDED.last_name,
        language_code=EXCLUDED.language_code,
        is_bot=EXCLUDED.is_bot,
        updated_at=EXCLUDED.updated_at
    `, [
      from.id,
      from.username || null,
      from.first_name || null,
      from.last_name || null,
      from.language_code || null,
      !!from.is_bot,
      now,
      now
    ])
  }
  logEvent = async function(userId, type, name, metadata) {
    await pool.query(`
      INSERT INTO events (user_id, type, name, ts, metadata)
      VALUES ($1,$2,$3,$4,$5)
    `, [
      userId || null,
      type,
      name,
      new Date().toISOString(),
      metadata ? JSON.stringify(metadata) : null
    ])
  }
  getStats = async function() {
    const u = await pool.query(`SELECT COUNT(*)::int AS c FROM users`)
    const s = await pool.query(`SELECT COUNT(*)::int AS c FROM events WHERE type='start'`)
    const c = await pool.query(`SELECT name, COUNT(*)::int AS c FROM events WHERE type='click' GROUP BY name ORDER BY c DESC`)
    return { usersTotal: u.rows[0]?.c || 0, startsTotal: s.rows[0]?.c || 0, clicksByName: c.rows || [] }
  }
  getAllData = async function() {
    const users = await pool.query(`SELECT id, username, first_name, last_name, language_code, is_bot, created_at, updated_at FROM users ORDER BY id ASC`)
    const events = await pool.query(`SELECT id, user_id, type, name, ts, metadata FROM events ORDER BY id ASC`)
    return { users: users.rows || [], events: events.rows || [] }
  }
} else {
  const DB_FILE = path.join(process.cwd(), 'analytics.json')
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, events: [] }))
  }
  const readStore = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
  const writeStore = (s) => fs.writeFileSync(DB_FILE, JSON.stringify(s))
  initDb = async function(){}
  upsertUser = async function(from) {
    const s = readStore()
    const now = new Date().toISOString()
    const prev = s.users[from.id]
    s.users[from.id] = {
      id: from.id,
      username: from.username || null,
      first_name: from.first_name || null,
      last_name: from.last_name || null,
      language_code: from.language_code || null,
      is_bot: from.is_bot ? 1 : 0,
      created_at: prev && prev.created_at ? prev.created_at : now,
      updated_at: now
    }
    writeStore(s)
  }
  logEvent = async function(userId, type, name, metadata) {
    const s = readStore()
    s.events.push({
      id: s.events.length + 1,
      user_id: userId || null,
      type,
      name,
      ts: new Date().toISOString(),
      metadata: metadata ? JSON.stringify(metadata) : null
    })
    writeStore(s)
  }
  getStats = async function() {
    const s = readStore()
    const usersTotal = Object.keys(s.users).length
    const startsTotal = s.events.filter(e => e.type === 'start').length
    const clicks = {}
    for (const e of s.events) {
      if (e.type === 'click') {
        clicks[e.name] = (clicks[e.name] || 0) + 1
      }
    }
    const clicksByName = Object.entries(clicks).map(([name, c]) => ({ name, c })).sort((a,b)=>b.c-a.c)
    return { usersTotal, startsTotal, clicksByName }
  }
  getAllData = async function() {
    const s = readStore()
    const users = Object.values(s.users)
    const events = s.events
    return { users, events }
  }
}
module.exports = { initDb, upsertUser, logEvent, getStats, getAllData, usePg }
