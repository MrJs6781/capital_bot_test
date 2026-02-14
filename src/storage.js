const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
const usePg = !!process.env.DATABASE_URL
let initDb = async () => {}
let upsertUser = async () => {}
let logEvent = async () => {}
let getStats = async () => ({ usersTotal: 0, startsTotal: 0, clicksByName: [] })
let getAllData = async () => ({ users: [], events: [] })
let getAdmins = async () => []
let addAdmin = async () => {}
let removeAdmin = async () => {}
let isAdmin = async () => false
let isSuperAdmin = (uid) => Number(process.env.SUPER_ADMIN_ID || 0) === Number(uid)
let getTargetUsers = async () => []
let addJob = async () => {}
let getDueJobs = async () => []
let markJobDone = async () => {}
let markJobCanceled = async () => {}
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
        created_at TIMESTAMPTZ
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id BIGSERIAL PRIMARY KEY,
        creator_id BIGINT,
        text TEXT,
        filter_json TEXT,
        run_at TIMESTAMPTZ,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ
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
  getAdmins = async function() {
    const r = await pool.query(`SELECT user_id FROM admins ORDER BY user_id ASC`)
    return (r.rows || []).map(x => Number(x.user_id))
  }
  addAdmin = async function(uid) {
    const now = new Date().toISOString()
    await pool.query(`INSERT INTO admins (user_id, created_at) VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING`, [Number(uid), now])
  }
  removeAdmin = async function(uid) {
    await pool.query(`DELETE FROM admins WHERE user_id=$1`, [Number(uid)])
  }
  isAdmin = async function(uid) {
    if (isSuperAdmin(uid)) return true
    const r = await pool.query(`SELECT 1 FROM admins WHERE user_id=$1`, [Number(uid)])
    return r.rowCount > 0
  }
  getTargetUsers = async function(filter = {}) {
    const languages = Array.isArray(filter.languages) ? filter.languages.filter(Boolean) : []
    const clickedNames = Array.isArray(filter.clickedNames) ? filter.clickedNames.filter(Boolean) : []
    const startedOnly = !!filter.startedOnly
    let baseUsers = []
    if (languages.length) {
      const r = await pool.query(`SELECT id FROM users WHERE language_code = ANY($1)`, [languages])
      baseUsers = (r.rows || []).map(x => Number(x.id))
    } else {
      const r = await pool.query(`SELECT id FROM users`)
      baseUsers = (r.rows || []).map(x => Number(x.id))
    }
    let byClicks = null
    if (clickedNames.length) {
      const r = await pool.query(`SELECT DISTINCT user_id FROM events WHERE type='click' AND name = ANY($1) AND user_id IS NOT NULL`, [clickedNames])
      byClicks = (r.rows || []).map(x => Number(x.user_id))
    }
    let result = baseUsers
    if (byClicks) {
      const set = new Set(byClicks)
      result = result.filter(id => set.has(id))
    }
    if (startedOnly) {
      const r = await pool.query(`SELECT DISTINCT user_id FROM events WHERE type='start' AND user_id IS NOT NULL`)
      const setStart = new Set((r.rows || []).map(x => Number(x.user_id)))
      result = result.filter(id => setStart.has(id))
    }
    return Array.from(new Set(result))
  }
  addJob = async function(creatorId, text, filter, runAt) {
    const now = new Date().toISOString()
    const r = await pool.query(
      `INSERT INTO jobs (creator_id, text, filter_json, run_at, status, created_at) VALUES ($1,$2,$3,$4,'pending',$5) RETURNING id`,
      [Number(creatorId), text, JSON.stringify(filter || {}), runAt, now]
    )
    return r.rows[0]?.id
  }
  getDueJobs = async function() {
    const r = await pool.query(`SELECT id, creator_id, text, filter_json, run_at FROM jobs WHERE status='pending' AND run_at <= NOW() ORDER BY run_at ASC`)
    return (r.rows || []).map(j => ({ id: j.id, creator_id: Number(j.creator_id), text: j.text, filter: safeParseJson(j.filter_json), run_at: j.run_at }))
  }
  markJobDone = async function(id) {
    await pool.query(`UPDATE jobs SET status='done' WHERE id=$1`, [Number(id)])
  }
  markJobCanceled = async function(id) {
    await pool.query(`UPDATE jobs SET status='canceled' WHERE id=$1`, [Number(id)])
  }
} else {
  const DB_FILE = path.join(process.cwd(), 'analytics.json')
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, events: [], admins: [] }))
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
  getAdmins = async function() {
    const s = readStore()
    return (s.admins || []).map(Number)
  }
  addAdmin = async function(uid) {
    const s = readStore()
    s.admins = Array.isArray(s.admins) ? s.admins : []
    const id = Number(uid)
    if (!s.admins.includes(id)) s.admins.push(id)
    writeStore(s)
  }
  removeAdmin = async function(uid) {
    const s = readStore()
    s.admins = (s.admins || []).map(Number).filter(x => x !== Number(uid))
    writeStore(s)
  }
  isAdmin = async function(uid) {
    if (isSuperAdmin(uid)) return true
    const s = readStore()
    return (s.admins || []).map(Number).includes(Number(uid))
  }
  getTargetUsers = async function(filter = {}) {
    const s = readStore()
    let ids = Object.keys(s.users).map(Number)
    if (filter.languages && filter.languages.length) {
      const langSet = new Set(filter.languages)
      ids = ids.filter(id => langSet.has(s.users[id]?.language_code))
    }
    if (filter.clickedNames && filter.clickedNames.length) {
      const nameSet = new Set(filter.clickedNames)
      const clickedIds = new Set(s.events.filter(e => e.type === 'click' && nameSet.has(e.name) && e.user_id).map(e => Number(e.user_id)))
      ids = ids.filter(id => clickedIds.has(id))
    }
    if (filter.startedOnly) {
      const startedIds = new Set(s.events.filter(e => e.type === 'start' && e.user_id).map(e => Number(e.user_id)))
      ids = ids.filter(id => startedIds.has(id))
    }
    return Array.from(new Set(ids))
  }
  addJob = async function(creatorId, text, filter, runAt) {
    const s = readStore()
    s.jobs = Array.isArray(s.jobs) ? s.jobs : []
    const id = (s.jobs[s.jobs.length - 1]?.id || 0) + 1
    s.jobs.push({ id, creator_id: Number(creatorId), text, filter_json: JSON.stringify(filter || {}), run_at: runAt, status: 'pending', created_at: new Date().toISOString() })
    writeStore(s)
    return id
  }
  getDueJobs = async function() {
    const s = readStore()
    const now = Date.now()
    const due = (s.jobs || []).filter(j => j.status === 'pending' && new Date(j.run_at).getTime() <= now)
    return due.map(j => ({ id: j.id, creator_id: Number(j.creator_id), text: j.text, filter: safeParseJson(j.filter_json), run_at: j.run_at }))
  }
  markJobDone = async function(id) {
    const s = readStore()
    s.jobs = (s.jobs || []).map(j => j.id === Number(id) ? { ...j, status: 'done' } : j)
    writeStore(s)
  }
  markJobCanceled = async function(id) {
    const s = readStore()
    s.jobs = (s.jobs || []).map(j => j.id === Number(id) ? { ...j, status: 'canceled' } : j)
    writeStore(s)
  }
}
function safeParseJson(s) { try { return JSON.parse(s || '{}') } catch { return {} } }
module.exports = { initDb, upsertUser, logEvent, getStats, getAllData, getAdmins, addAdmin, removeAdmin, isAdmin, isSuperAdmin, getTargetUsers, addJob, getDueJobs, markJobDone, markJobCanceled, usePg }
