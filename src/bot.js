const { Telegraf } = require('telegraf')
const https = require('https')
const { delay, makeUrl, chunkAndReply } = require('./utils')
function createBot(storage, config) {
  const agent = new https.Agent({ family: 4 })
  const bot = new Telegraf(process.env.BOT_TOKEN, { telegram: { agent } })
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
    await ctx.reply(`منوی اصلی`, {
      reply_markup: {
        keyboard: [[{ text: 'شروع' }, { text: 'گزارش' }], [{ text: 'راهنما' }]],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    })
  }
  async function replyStats(ctx) {
    const s = await storage.getStats()
    const lines = s.clicksByName && s.clicksByName.length ? s.clicksByName.map(r => `- ${r.name}: ${r.c}`) : ['- ندارد']
    const text = `کاربران: ${s.usersTotal}\nورودی‌ها (/start): ${s.startsTotal}\nکلیک‌ها به تفکیک:\n${lines.join('\n')}`
    await ctx.reply(text)
  }
  async function replyFull(ctx) {
    const s = await storage.getStats()
    const all = await storage.getAllData()
    const uLines = all.users.map(u => `#${u.id} ${u.username || '-'} ${u.first_name || ''} ${u.last_name || ''} ${u.language_code || ''} bot=${u.is_bot ? 1 : 0} created=${u.created_at} updated=${u.updated_at}`)
    const eLines = all.events.map(e => `#${e.id} uid=${e.user_id || '-'} type=${e.type} name=${e.name} ts=${e.ts} meta=${e.metadata || '-'}`)
    const summary =
      `کاربران: ${s.usersTotal}\nورودی‌ها (/start): ${s.startsTotal}\nکلیک‌ها به تفکیک:\n${(s.clicksByName || []).map(r => `- ${r.name}: ${r.c}`).join('\n') || '- ندارد'}\n\n` +
      `فهرست کاربران:\n${uLines.join('\n')}\n\n` +
      `فهرست رویدادها:\n${eLines.join('\n')}`
    await chunkAndReply(ctx, summary)
  }
  bot.start(async (ctx) => { try { await sendStart(ctx) } catch {} })
  bot.action('stats', async (ctx) => { try { await replyStats(ctx); await ctx.answerCbQuery() } catch { await ctx.answerCbQuery('خطای گزارش') } })
  bot.command('stats', async (ctx) => { try { await replyFull(ctx) } catch { await ctx.reply('خطا در گزارش') } })
  bot.command('help', async (ctx) => {
    const t = `دستورات:\n/start شروع\n/stats گزارش کامل\n/help راهنما`
    await ctx.reply(t)
  })
  bot.hears('گزارش', async (ctx) => { try { await replyFull(ctx) } catch {} })
  bot.hears('شروع', async (ctx) => { try { await sendStart(ctx) } catch {} })
  bot.hears('راهنما', async (ctx) => { const t = `دستورات:\n/start شروع\n/stats گزارش کامل\n/help راهنما`; await ctx.reply(t) })
  return bot
}
module.exports = { createBot }
