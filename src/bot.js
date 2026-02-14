const { Telegraf } = require('telegraf')
const https = require('https')
const { delay, makeUrl, chunkAndReply, formatReport, parseDateTime } = require('./utils')
function createBot(storage, config) {
  const agent = new https.Agent({ family: 4 })
  const bot = new Telegraf(process.env.BOT_TOKEN, { telegram: { agent } })
  const sessions = new Map()
  async function isSuper(ctx) {
    if (config.superAdminId && ctx.from && ctx.from.id === config.superAdminId) return true
    const role = await storage.getAdminRole(ctx.from.id)
    return role === 'superadmin'
  }
  async function isAdmin(ctx) {
    if (await isSuper(ctx)) return true
    const role = await storage.getAdminRole(ctx.from.id)
    return !!role
  }
  async function sendStart(ctx) {
    await storage.upsertUser(ctx.from)
    await storage.logEvent(ctx.from.id, 'start', 'start')
    if (config.imageUrl) {
      await ctx.replyWithPhoto(config.imageUrl)
      await delay(500)
    }
    await ctx.reply(
      `👋 به ربات فارسی CapitalChin خوش آمدید
خوشحالیم که به جامعه تریدرهای فارسی‌زبان CapitalChin  پیوستید.
این ربات برای دسترسی سریع، پشتیبانی و اطلاع‌رسانی طراحی شده تا تجربه معاملاتی ساده‌تر و حرفه‌ای‌تری داشته باشید.

🔹 در این ربات چه امکاناتی دارید؟
📌 ثبت‌نام و شروع همکاری
ایجاد حساب کاربری و شروع مسیر ترید

📌 کانال اطلاع‌رسانی رسمی
اخبار، آپدیت‌ها، تورنمنت‌ها و اطلاعیه‌های مهم
🔗 کانال رسمی:
👉 https://t.me/capitalchainfa`,
      { reply_markup: { inline_keyboard: [[{ text: 'کانال رسمی', url: makeUrl(config.redirectBase, 'channel', ctx.from.id) }]] } }
    )
    await delay(700)
    await ctx.reply(`🔗 لینک ثبت‌نام:\n👉 https://checkout.capitalchain.co`, {
      reply_markup: { inline_keyboard: [[{ text: 'ثبت‌نام', url: makeUrl(config.redirectBase, 'signup', ctx.from.id) }]] }
    })
    await delay(700)
    await ctx.reply(`📌 ورود به سایت فارسی کپیتال چین\n🔗 http://CapitalChain.co/farsi`, {
      reply_markup: { inline_keyboard: [[{ text: 'سایت فارسی', url: makeUrl(config.redirectBase, 'site-fa', ctx.from.id) }]] }
    })
    await delay(700)
    await ctx.reply(
      `📌 قوانین و شرایط
مطالعه قوانین، پلن‌ها و شرایط برداشت
🔗 قوانین و مقررات:
👉 https://capitalchain.co/terms-of-use`,
      { reply_markup: { inline_keyboard: [[{ text: 'قوانین و شرایط', url: makeUrl(config.redirectBase, 'rules', ctx.from.id) }]] } }
    )
    await delay(700)
    await ctx.reply(
      `📌 پشتیبانی فارسی
در صورت داشتن هرگونه سوال یا مشکل، با پشتیبانی در ارتباط باشید
🔗 پشتیبانی تلگرام:
👉 https://t.me/CapitalChainfarsi_support`,
      { reply_markup: { inline_keyboard: [[{ text: 'پشتیبانی تلگرام', url: makeUrl(config.redirectBase, 'support', ctx.from.id) }]] } }
    )
    await delay(700)
    await ctx.reply(`🧾 گزارش ساده`, { reply_markup: { inline_keyboard: [[{ text: 'مشاهده گزارش', callback_data: 'stats' }]] } })
    await delay(500)
    const isAdm = await isAdmin(ctx)
    const kb = isAdm
      ? [[{ text: 'شروع' }, { text: 'گزارش' }], [{ text: 'راهنما' }, { text: 'مدیریت' }]]
      : [[{ text: 'شروع' }, { text: 'گزارش' }], [{ text: 'راهنما' }]]
    await ctx.reply(`منوی اصلی`, { reply_markup: { keyboard: kb, resize_keyboard: true, one_time_keyboard: false } })
    if (await isAdmin(ctx)) {
      const isSup = await isSuper(ctx)
      await ctx.reply('پنل مدیریت', {
        reply_markup: { inline_keyboard: [[
          { text: 'ارسال اعلان', callback_data: 'admin:broadcast' },
          { text: 'فهرست ادمین‌ها', callback_data: 'admin:list' }
        ], [{ text: 'افزودن ادمین', callback_data: 'admin:add' }].concat(isSup ? [[{ text: 'افزودن سوپرادمین', callback_data: 'admin:addsuper' }]] : [])] }
      })
    }
  }
  async function replyFull(ctx) {
    const s = await storage.getStats()
    const all = await storage.getAllData()
    const messages = formatReport(s, all)
    for (const m of messages) {
      await ctx.reply(m, { parse_mode: 'HTML' })
    }
  }
  async function previewRecipients(filters) {
    const ids = await storage.getRecipients(filters)
    return { count: ids.length, ids }
  }
  async function sendBroadcastNow(text, filters, creatorId) {
    const ids = await storage.getRecipients(filters)
    const { id } = await storage.createBroadcast({ creator_id: creatorId, text, filters, status: 'pending' })
    for (const uid of ids) {
      try { await bot.telegram.sendMessage(uid, text) } catch {}
      await delay(30)
    }
    await storage.markBroadcastSent(id)
    return ids.length
  }
  bot.start(async (ctx) => { try { await sendStart(ctx) } catch {} })
  bot.action('stats', async (ctx) => { try { await replyFull(ctx); await ctx.answerCbQuery() } catch { await ctx.answerCbQuery('خطای گزارش') } })
  bot.command('stats', async (ctx) => { try { await replyFull(ctx) } catch { await ctx.reply('خطا در گزارش') } })
  bot.command('help', async (ctx) => {
    const t = `دستورات:\n/start شروع\n/stats گزارش کامل\n/help راهنما`
    await ctx.reply(t)
  })
  bot.hears('گزارش', async (ctx) => { try { await replyFull(ctx) } catch {} })
  bot.hears('شروع', async (ctx) => { try { await sendStart(ctx) } catch {} })
  bot.hears('راهنما', async (ctx) => { const t = `دستورات:\n/start شروع\n/stats گزارش کامل\n/help راهنما`; await ctx.reply(t) })
  bot.hears('مدیریت', async (ctx) => {
    if (!(await isAdmin(ctx))) return
    const isSup = await isSuper(ctx)
    const rows = [[
      { text: 'ارسال اعلان', callback_data: 'admin:broadcast' },
      { text: 'فهرست ادمین‌ها', callback_data: 'admin:list' }
    ], [{ text: 'افزودن ادمین', callback_data: 'admin:add' }]]
    if (isSup) rows.push([{ text: 'افزودن سوپرادمین', callback_data: 'admin:addsuper' }])
    await ctx.reply('پنل مدیریت', { reply_markup: { inline_keyboard: rows } })
  })
  bot.command('admin', async (ctx) => {
    if (!(await isSuper(ctx))) return
    const parts = (ctx.message.text || '').trim().split(/\s+/)
    const cmd = parts[1]
    if (cmd === 'add' && parts[2]) {
      const uid = Number(parts[2]); const role = parts[3] || 'admin'
      await storage.addAdmin(uid, role)
      await ctx.reply(`ادمین اضافه شد: ${uid} نقش: ${role}`)
      return
    }
    if (cmd === 'remove' && parts[2]) {
      const uid = Number(parts[2])
      await storage.removeAdmin(uid)
      await ctx.reply(`ادمین حذف شد: ${uid}`)
      return
    }
    if (cmd === 'setrole' && parts[2] && parts[3]) {
      const uid = Number(parts[2]); const role = parts[3]
      await storage.addAdmin(uid, role)
      await ctx.reply(`نقش بروزرسانی شد: ${uid} => ${role}`)
      return
    }
    if (cmd === 'list') {
      const list = await storage.listAdmins()
      const lines = list.map(a => `${a.user_id} ${a.role}`)
      await ctx.reply(lines.length ? lines.join('\n') : 'فهرست خالی است')
      return
    }
    await ctx.reply(`دستورات مدیریت:\n/admin add <user_id> [role]\n/admin remove <user_id>\n/admin setrole <user_id> <role>\n/admin list`)
  })
  bot.action('admin:broadcast', async (ctx) => {
    if (!(await isAdmin(ctx))) { await ctx.answerCbQuery(); return }
    sessions.set(ctx.from.id, { step: 'text' })
    await ctx.reply('متن پیام را ارسال کنید')
    await ctx.answerCbQuery('شروع ارسال انبوه')
  })
  bot.action('admin:list', async (ctx) => {
    if (!(await isSuper(ctx))) { await ctx.answerCbQuery(); return }
    const list = await storage.listAdmins()
    const lines = list.map(a => `${a.user_id} ${a.role}`)
    await ctx.reply(lines.length ? lines.join('\n') : 'فهرست خالی است')
    await ctx.answerCbQuery('فهرست ادمین‌ها')
  })
  bot.action('admin:add', async (ctx) => {
    if (!(await isSuper(ctx))) { await ctx.answerCbQuery(); return }
    sessions.set(ctx.from.id, { step: 'add_admin_id', role: 'admin' })
    await ctx.reply('شناسه کاربر ادمین را وارد کنید')
    await ctx.answerCbQuery('افزودن ادمین')
  })
  bot.action('admin:addsuper', async (ctx) => {
    if (!(await isSuper(ctx))) { await ctx.answerCbQuery(); return }
    sessions.set(ctx.from.id, { step: 'add_admin_id', role: 'superadmin' })
    await ctx.reply('شناسه کاربر سوپرادمین را وارد کنید')
    await ctx.answerCbQuery('افزودن سوپرادمین')
  })
  bot.command('broadcast', async (ctx) => {
    if (!(await isAdmin(ctx))) return
    sessions.set(ctx.from.id, { step: 'text' })
    await ctx.reply('متن پیام را ارسال کنید')
  })
  bot.on('text', async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    if (s.step === 'add_admin_id') {
      const uid = Number((ctx.message.text || '').trim())
      if (!uid || isNaN(uid)) { await ctx.reply('شناسه نامعتبر است'); return }
      await storage.addAdmin(uid, s.role || 'admin')
      sessions.delete(ctx.from.id)
      await ctx.reply(s.role === 'superadmin' ? 'سوپرادمین اضافه شد' : 'ادمین اضافه شد')
      return
    }
    if (s.step === 'text') {
      s.text = ctx.message.text
      s.step = 'filter'
      await ctx.reply('فیلتر مخاطبان را انتخاب کنید', {
        reply_markup: { inline_keyboard: [[
          { text: 'همه', callback_data: 'filter:all' },
          { text: 'فارسی', callback_data: 'filter:fa' },
          { text: 'انگلیسی', callback_data: 'filter:en' },
          { text: 'ثبت‌نام', callback_data: 'filter:signup' }
        ]] }
      })
      return
    }
    if (s.step === 'schedule') {
      const dt = parseDateTime(ctx.message.text)
      if (!dt) { await ctx.reply('فرمت زمان نامعتبر است. نمونه: 2026-02-15 21:30'); return }
      const filters = s.filters || {}
      const { id } = await storage.createBroadcast({ creator_id: ctx.from.id, text: s.text, filters, status: 'scheduled', scheduled_at: dt.toISOString() })
      sessions.delete(ctx.from.id)
      await ctx.reply(`زمان‌بندی شد: #${id} در ${dt.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', hour12: false })}`)
      return
    }
  })
  bot.action(/filter:(.+)/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    const key = ctx.match[1]
    const filters = {}
    if (key === 'fa') filters.lang = 'fa'
    else if (key === 'en') filters.lang = 'en'
    else if (key === 'signup') filters.event = 'signup'
    s.filters = filters
    const pr = await previewRecipients(filters)
    await ctx.reply(`پیش‌نمایش:\nگیرندگان: ${pr.count}\n\n${s.text}`, {
      reply_markup: { inline_keyboard: [[
        { text: 'ارسال اکنون', callback_data: 'send:now' },
        { text: 'زمان‌بندی', callback_data: 'send:schedule' },
        { text: 'انصراف', callback_data: 'send:cancel' }
      ]] }
    })
    await ctx.answerCbQuery()
  })
  bot.action(/send:(.+)/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    const act = ctx.match[1]
    if (act === 'cancel') { sessions.delete(ctx.from.id); await ctx.reply('لغو شد'); await ctx.answerCbQuery(); return }
    if (act === 'now') {
      const sent = await sendBroadcastNow(s.text, s.filters || {}, ctx.from.id)
      sessions.delete(ctx.from.id)
      await ctx.reply(`ارسال شد به ${sent} مخاطب`)
      await ctx.answerCbQuery()
      return
    }
    if (act === 'schedule') {
      s.step = 'schedule'
      await ctx.reply('زمان ارسال را وارد کنید. نمونه: 2026-02-15 21:30')
      await ctx.answerCbQuery()
      return
    }
  })
  return bot
}
module.exports = { createBot }
