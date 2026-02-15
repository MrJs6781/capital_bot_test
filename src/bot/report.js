const { formatReport, formatUsersPage, formatEventsPage } = require("../utils")
function registerReport(bot, storage, config, reportPrefs, helpers) {
  async function openReportMenu(ctx) {
    const s = await storage.getStats()
    const all = await storage.getAllData()
    const summary = formatReport(s, all)[0]
    const ps = reportPrefs.get(ctx.from.id)?.pageSize || config.reportDefaultPageSize || 30
    const rows = [
      [
        { text: "کاربران", callback_data: "report:users:1" },
        { text: "رویدادها", callback_data: "report:events:1" },
      ],
      [
        { text: `تعداد/صفحه: ${ps}`, callback_data: "report:size" },
        { text: "بستن", callback_data: "report:close" },
      ],
    ]
    await ctx.reply(summary, { parse_mode: "HTML", reply_markup: { inline_keyboard: rows } })
  }
  bot.action("stats", async (ctx) => {
    try {
      if (!(await helpers.isAdmin(ctx))) {
        await ctx.answerCbQuery("دسترسی ندارید")
        return
      }
      await openReportMenu(ctx)
      await ctx.answerCbQuery()
    } catch {
      await ctx.answerCbQuery("خطای گزارش")
    }
  })
  bot.command("stats", async (ctx) => {
    try {
      if (!(await helpers.isAdmin(ctx))) {
        await ctx.reply("دسترسی ندارید")
        return
      }
      await openReportMenu(ctx)
    } catch {
      await ctx.reply("خطا در گزارش")
    }
  })
  bot.hears("گزارش", async (ctx) => {
    try {
      if (!(await helpers.isAdmin(ctx))) return
      await openReportMenu(ctx)
    } catch {}
  })
  bot.action(/report:users:(\d+)/, async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    const page = Number(ctx.match[1])
    const ps = reportPrefs.get(ctx.from.id)?.pageSize || config.reportDefaultPageSize || 30
    const all = await storage.getAllData()
    const [text, meta] = formatUsersPage(all.users || [], page, ps)
    const rows = [
      [
        { text: meta.page > 1 ? "قبلی" : "—", callback_data: `report:users:${Math.max(1, meta.page - 1)}` },
        { text: meta.page < meta.pages ? "بعدی" : "—", callback_data: `report:users:${Math.min(meta.pages, meta.page + 1)}` },
      ],
      [{ text: "بازگشت به منو", callback_data: "stats" }],
    ]
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: rows } })
    await ctx.answerCbQuery()
  })
  bot.action(/report:events:(\d+)/, async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    const page = Number(ctx.match[1])
    const ps = reportPrefs.get(ctx.from.id)?.pageSize || config.reportDefaultPageSize || 30
    const all = await storage.getAllData()
    const usersById = {}
    for (const u of all.users || []) usersById[u.id] = u
    const [text, meta] = formatEventsPage(all.events || [], usersById, page, ps)
    const rows = [
      [
        { text: meta.page > 1 ? "قبلی" : "—", callback_data: `report:events:${Math.max(1, meta.page - 1)}` },
        { text: meta.page < meta.pages ? "بعدی" : "—", callback_data: `report:events:${Math.min(meta.pages, meta.page + 1)}` },
      ],
      [{ text: "بازگشت به منو", callback_data: "stats" }],
    ]
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: rows } })
    await ctx.answerCbQuery()
  })
  bot.action("report:size", async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    const current = reportPrefs.get(ctx.from.id)?.pageSize || config.reportDefaultPageSize || 30
    const opts = [10, 20, 30, 50, 100]
    const rows = []
    for (let i = 0; i < opts.length; i += 3) {
      const r = []
      for (let k = i; k < i + 3 && k < opts.length; k++) {
        const v = opts[k]
        r.push({ text: `${v}${v === current ? " ✓" : ""}`, callback_data: `report:setsize:${v}` })
      }
      rows.push(r)
    }
    rows.push([{ text: "بازگشت", callback_data: "stats" }])
    await ctx.reply("تعداد آیتم‌ها در هر صفحه را انتخاب کنید", { reply_markup: { inline_keyboard: rows } })
    await ctx.answerCbQuery()
  })
  bot.action(/report:setsize:(\d+)/, async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    const v = Number(ctx.match[1])
    if (!Number.isInteger(v) || v <= 0) {
      await ctx.answerCbQuery("نامعتبر")
      return
    }
    const pref = reportPrefs.get(ctx.from.id) || {}
    pref.pageSize = v
    reportPrefs.set(ctx.from.id, pref)
    await ctx.answerCbQuery("ذخیره شد")
    await openReportMenu(ctx)
  })
  bot.action("report:close", async (ctx) => {
    await ctx.answerCbQuery("بسته شد")
  })
}
module.exports = { registerReport }
