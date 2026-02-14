const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
const usePg = !!process.env.DATABASE_URL
let initDb = async () => {}
let upsertUser = async () => {}
let logEvent = async () => {}
let getStats = async () => ({ usersTotal: 0, startsTotal: 0, clicksByName: [] })
let getAllData = async () => ({ users: [], events: [] })
let addAdmin = async () => {}
let removeAdmin = async () => {}
let listAdmins = async () => []
let getAdminRole = async () => null
let getRecipients = async () => []
let createBroadcast = async () => ({ id: null })
let listDueBroadcasts = async () => []
let markBroadcastSent = async () => {}
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        user_id BIGINT PRIMARY KEY,
        role TEXT,
        created_at TIMESTAMPTZ
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS broadcasts (
        id BIGSERIAL PRIMARY KEY,
        creator_id BIGINT,
        text TEXT,
        filters TEXT,
        status TEXT,
        scheduled_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ
      )
    `)
    const rc = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='admins' AND column_name='role'`)
    if (rc.rowCount === 0) { await pool.query(`ALTER TABLE admins ADD COLUMN role TEXT`) }
    const cc = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='admins' AND column_name='created_at'`)
    if (cc.rowCount === 0) { await pool.query(`ALTER TABLE admins ADD COLUMN created_at TIMESTAMPTZ`) }
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
  addAdmin = async function(userId, role='admin') {
    await pool.query(`INSERT INTO admins (user_id, role, created_at) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role`, [userId, role, new Date().toISOString()])
  }
  removeAdmin = async function(userId) {
    await pool.query(`DELETE FROM admins WHERE user_id=$1`, [userId])
  }
  listAdmins = async function() {
    const r = await pool.query(`SELECT user_id, role, created_at FROM admins ORDER BY user_id ASC`)
    return r.rows || []
  }
  getAdminRole = async function(userId) {
    const r = await pool.query(`SELECT role FROM admins WHERE user_id=$1`, [userId])
    return r.rows[0]?.role || null
  }
  getRecipients = async function(filters) {
    const f = filters || {}
    if (f.event === 'signup') {
      const ids = await pool.query(`SELECT DISTINCT user_id FROM events WHERE type='click' AND name='signup'`)
      const idList = (ids.rows || []).map(r => r.user_id).filter(Boolean)
      if (f.lang) {
        const u = await pool.query(`SELECT id FROM users WHERE id = ANY($1) AND language_code = $2`, [idList, f.lang])
        return (u.rows || []).map(r => r.id)
      }
      return idList
    }
    if (f.lang) {
      const u = await pool.query(`SELECT id FROM users WHERE language_code = $1`, [f.lang])
      return (u.rows || []).map(r => r.id)
    }
    const u = await pool.query(`SELECT id FROM users`)
    return (u.rows || []).map(r => r.id)
  }
  createBroadcast = async function(b) {
    const r = await pool.query(
      `INSERT INTO broadcasts (creator_id, text, filters, status, scheduled_at, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [b.creator_id, b.text, JSON.stringify(b.filters || {}), b.status, b.scheduled_at || null, new Date().toISOString()]
    )
    return { id: r.rows[0]?.id || null }
  }
  listDueBroadcasts = async function(nowIso) {
    const r = await pool.query(`SELECT id, creator_id, text, filters, status, scheduled_at FROM broadcasts WHERE status='scheduled' AND scheduled_at <= $1 ORDER BY scheduled_at ASC`, [nowIso])
    return r.rows || []
  }
  markBroadcastSent = async function(id) {
    await pool.query(`UPDATE broadcasts SET status='sent', sent_at=$2 WHERE id=$1`, [id, new Date().toISOString()])
  }
} else {
  const DB_FILE = path.join(process.cwd(), 'analytics.json')
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, events: [], admins: [], broadcasts: [] }))
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
  addAdmin = async function(userId, role='admin') {
    const s = readStore()
    const i = s.admins.findIndex(a => a.user_id === userId)
    const rec = { user_id: userId, role, created_at: new Date().toISOString() }
    if (i >= 0) s.admins[i] = rec
    else s.admins.push(rec)
    writeStore(s)
  }
  removeAdmin = async function(userId) {
    const s = readStore()
    s.admins = s.admins.filter(a => a.user_id !== userId)
    writeStore(s)
  }
  listAdmins = async function() {
    const s = readStore()
    return s.admins || []
  }
  getAdminRole = async function(userId) {
    const s = readStore()
    const a = (s.admins || []).find(a => a.user_id === userId)
    return a ? a.role : null
  }
  getRecipients = async function(filters) {
    const s = readStore()
    let ids = Object.keys(s.users).map(x => Number(x))
    if (filters && filters.lang) {
      ids = ids.filter(id => (s.users[id]?.language_code || '').toLowerCase() === filters.lang.toLowerCase())
    }
    if (filters && filters.event === 'signup') {
      const clicked = new Set(s.events.filter(e => e.type === 'click' && e.name === 'signup').map(e => e.user_id).filter(Boolean))
      ids = ids.filter(id => clicked.has(id))
    }
    return ids
  }
  createBroadcast = async function(b) {
    const s = readStore()
    const id = (s.broadcasts?.length || 0) + 1
    s.broadcasts.push({
      id,
      creator_id: b.creator_id,
      text: b.text,
      filters: b.filters || {},
      status: b.status,
      scheduled_at: b.scheduled_at || null,
      sent_at: null,
      created_at: new Date().toISOString()
    })
    writeStore(s)
    return { id }
  }
  listDueBroadcasts = async function(nowIso) {
    const s = readStore()
    const now = new Date(nowIso).getTime()
    return (s.broadcasts || []).filter(b => b.status === 'scheduled' && b.scheduled_at && new Date(b.scheduled_at).getTime() <= now)
  }
  markBroadcastSent = async function(id) {
    const s = readStore()
    const i = (s.broadcasts || []).findIndex(b => b.id === id)
    if (i >= 0) {
      s.broadcasts[i].status = 'sent'
      s.broadcasts[i].sent_at = new Date().toISOString()
    }
    writeStore(s)
  }
}
module.exports = { initDb, upsertUser, logEvent, getStats, getAllData, usePg, addAdmin, removeAdmin, listAdmins, getAdminRole, getRecipients, createBroadcast, listDueBroadcasts, markBroadcastSent }
