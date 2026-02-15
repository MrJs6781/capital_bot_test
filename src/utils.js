function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
function makeUrl(redirectBase, name, uid) {
  return `${redirectBase}/r/${name}?uid=${uid}`
}
async function chunkAndReply(ctx, text, opts = {}) {
  const limit = 3500
  for (let i = 0; i < text.length; i += limit) {
    await ctx.reply(text.slice(i, i + limit), opts)
  }
}
function pad(s, n) {
  const str = String(s ?? '')
  return str.length > n ? str.slice(0, n) : str.padEnd(n, ' ')
}
function fmtDate(d) {
  const date = typeof d === 'string' ? new Date(d) : d
  if (!date || isNaN(date.getTime())) return '-'
  return date.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', hour12: false })
}
function parseDateTime(s) {
  if (!s) return null
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]), h = Number(m[4]), mi = Number(m[5])
  const dt = new Date(y, mo, d, h, mi, 0)
  return isNaN(dt.getTime()) ? null : dt
}
function zonedDate(y, mo, d, h, mi, tz) {
  if (tz === 'Asia/Tehran') {
    const offsetMinutes = 210
    const total = h * 60 + mi - offsetMinutes
    const base = Date.UTC(y, mo - 1, d, 0, 0, 0)
    return new Date(base + total * 60000)
  }
  return new Date(y, mo - 1, d, h, mi, 0)
}
function parseDateTimeTz(s, tz) {
  if (!s) return null
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]), h = Number(m[4]), mi = Number(m[5])
  const dt = zonedDate(y, mo, d, h, mi, tz)
  return isNaN(dt.getTime()) ? null : dt
}
function formatReport(stats, all) {
  const clicksLines = (stats.clicksByName || []).map(r => `• ${r.name}: ${r.c}`)
  const summary =
    `<b>گزارش کلی</b>\n` +
    `• کاربران: ${stats.usersTotal}\n` +
    `• ورودی‌ها (/start): ${stats.startsTotal}\n` +
    `• کلیک‌ها:\n` +
    `${clicksLines.length ? clicksLines.join('\n') : '—'}`
  const usersHeader = `${pad('ID', 14)} ${pad('Username', 20)} ${pad('Name', 20)} ${pad('Lang', 5)} ${pad('Bot', 3)} ${pad('Created', 22)} ${pad('Updated', 22)}`
  const usersRows = (all.users || []).map(u => {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim()
    return `${pad(u.id, 14)} ${pad(u.username || '-', 20)} ${pad(name || '-', 20)} ${pad(u.language_code || '-', 5)} ${pad(u.is_bot ? 1 : 0, 3)} ${pad(fmtDate(u.created_at), 22)} ${pad(fmtDate(u.updated_at), 22)}`
  })
  const usersBlock =
    `<b>کاربران</b>\n` +
    `<pre>${usersHeader}\n${usersRows.length ? usersRows.join('\n') : '—'}</pre>`
  const eventsHeader = `${pad('ID', 6)} ${pad('UserID', 14)} ${pad('Type', 8)} ${pad('Name', 10)} ${pad('Time', 22)}`
  const eventsRows = (all.events || []).map(e => {
    return `${pad(e.id, 6)} ${pad(e.user_id || '-', 14)} ${pad(e.type, 8)} ${pad(e.name, 10)} ${pad(fmtDate(e.ts), 22)}`
  })
  const eventsBlock =
    `<b>رویدادها</b>\n` +
    `<pre>${eventsHeader}\n${eventsRows.length ? eventsRows.join('\n') : '—'}</pre>`
  return [summary, usersBlock, eventsBlock]
}
function formatUsersPage(users, page, pageSize) {
  const total = users.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const p = Math.min(Math.max(1, page), pages)
  const start = (p - 1) * pageSize
  const slice = users.slice(start, start + pageSize)
  const rows = slice.map(u => {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim()
    const user = u.username ? `@${u.username}` : '—'
    const lang = u.language_code || '—'
    const bot = u.is_bot ? 1 : 0
    const created = fmtDate(u.created_at)
    return `#${u.id} • ${user} • ${name || '—'} • زبان: ${lang} • ربات: ${bot} • ثبت: ${created}`
  })
  const footer = `— صفحه ${p} از ${pages}`
  return [`<b>کاربران</b>\n${rows.length ? rows.join('\n') : '—'}\n${footer}`, { page: p, pages }]
}
function formatEventsPage(events, page, pageSize) {
  const total = events.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const p = Math.min(Math.max(1, page), pages)
  const start = (p - 1) * pageSize
  const slice = events.slice(start, start + pageSize)
  const rows = slice.map(e => {
    const uid = e.user_id || '—'
    const time = fmtDate(e.ts)
    return `#${e.id} • کاربر: ${uid} • نوع: ${e.type} • نام: ${e.name} • زمان: ${time}`
  })
  const footer = `— صفحه ${p} از ${pages}`
  return [`<b>رویدادها</b>\n${rows.length ? rows.join('\n') : '—'}\n${footer}`, { page: p, pages }]
}
module.exports = { delay, makeUrl, chunkAndReply, formatReport, parseDateTime, zonedDate, parseDateTimeTz, formatUsersPage, formatEventsPage }
