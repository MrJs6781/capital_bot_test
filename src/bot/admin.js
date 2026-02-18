const { delay, parseDateTimeTz, zonedDate } = require("../utils")
function registerAdmin(bot, storage, config, sessions, helpers) {
  async function previewRecipients(filters) {
    const ids = await storage.getRecipients(filters)
    return { count: ids.length, ids }
  }
  async function sendBroadcastNow(text, filters, creatorId) {
    const ids = await storage.getRecipients(filters)
    const { id } = await storage.createBroadcast({
      creator_id: creatorId,
      text,
      filters,
      status: "pending",
    })
    for (const uid of ids) {
      try {
        await bot.telegram.sendMessage(uid, text)
      } catch {}
      await delay(30)
    }
    await storage.markBroadcastSent(id)
    return ids.length
  }
  bot.hears("مدیریت", async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) return
    const isSup = await helpers.isSuper(ctx)
    const rows = [
      [
        { text: "ارسال اعلان", callback_data: "admin:broadcast" },
        { text: "فهرست ادمین‌ها", callback_data: "admin:list" },
      ],
      [
        { text: "افزودن ادمین", callback_data: "admin:add" },
        { text: "حذف ادمین", callback_data: "admin:remove" },
      ],
    ]
    rows.push([{ text: "زمان‌بندی‌ها", callback_data: "sched:list:1" }])
    if (isSup) {
      rows.push([{ text: "افزودن سوپرادمین", callback_data: "admin:addsuper" }])
      rows.push([
        { text: "تغییر نقش", callback_data: "admin:setrole" },
        { text: "ریست دیتابیس", callback_data: "admin:reset" },
      ])
    }
    await ctx.reply("پنل مدیریت", { reply_markup: { inline_keyboard: rows } })
  })
  bot.command("admin", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) return
    const parts = (ctx.message.text || "").trim().split(/\s+/)
    const cmd = parts[1]
    if (cmd === "add" && parts[2]) {
      const role = parts[3] || "admin"
      const token = parts[2]
      const uid = /^\d+$/.test(token) ? Number(token) : await storage.resolveUserIdByUsername(token)
      if (!uid) {
        await ctx.reply("کاربر یافت نشد؛ از شناسه عددی یا یوزرنیم موجود در دیتابیس استفاده کنید")
        return
      }
      await storage.addAdmin(uid, role)
      await ctx.reply(`ادمین اضافه شد: ${uid} نقش: ${role}`)
      return
    }
    if (cmd === "remove" && parts[2]) {
      const token = parts[2]
      const uid = /^\d+$/.test(token) ? Number(token) : await storage.resolveUserIdByUsername(token)
      if (!uid) {
        await ctx.reply("کاربر یافت نشد؛ از شناسه عددی یا یوزرنیم موجود در دیتابیس استفاده کنید")
        return
      }
      await storage.removeAdmin(uid)
      await ctx.reply(`ادمین حذف شد: ${uid}`)
      return
    }
    if (cmd === "setrole" && parts[2] && parts[3]) {
      const token = parts[2]
      const uid = /^\d+$/.test(token) ? Number(token) : await storage.resolveUserIdByUsername(token)
      if (!uid) {
        await ctx.reply("کاربر یافت نشد؛ از شناسه عددی یا یوزرنیم موجود در دیتابیس استفاده کنید")
        return
      }
      const role = parts[3]
      await storage.addAdmin(uid, role)
      await ctx.reply(`نقش بروزرسانی شد: ${uid} => ${role}`)
      return
    }
    if (cmd === "list") {
      const list = await storage.listAdmins()
      const lines = list.map((a) => `${a.user_id} ${a.role}`)
      await ctx.reply(lines.length ? lines.join("\n") : "فهرست خالی است")
      return
    }
    if (cmd === "reset") {
      const confirm = parts[2]
      if (confirm !== "confirm") {
        await ctx.reply("برای ریست دیتابیس، دستور زیر را اجرا کنید:\n/admin reset confirm")
        return
      }
      await storage.resetDatabase()
      await ctx.reply("✅ دیتابیس ریست شد (کاربران، رویدادها و اعلان‌ها پاک‌سازی شدند)")
      return
    }
    await ctx.reply(
      `دستورات مدیریت:\n/admin add <user_id> [role]\n/admin remove <user_id>\n/admin setrole <user_id> <role>\n/admin list\n/admin reset confirm`,
    )
  })
  bot.action("admin:broadcast", async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    sessions.set(ctx.from.id, { step: "text" })
    await ctx.reply("متن پیام را ارسال کنید")
    await ctx.answerCbQuery("شروع ارسال انبوه")
  })
  bot.action("admin:list", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    const list = await storage.listAdmins()
    const lines = list.map((a) => `${a.user_id} ${a.role}`)
    await ctx.reply(lines.length ? lines.join("\n") : "فهرست خالی است")
    await ctx.answerCbQuery("فهرست ادمین‌ها")
  })
  bot.action("admin:add", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    sessions.set(ctx.from.id, { step: "add_admin_id", role: "admin" })
    await ctx.reply("شناسه عددی یا یوزرنیم کاربر را وارد کنید (مثال: 123456 یا @username)")
    await ctx.answerCbQuery("افزودن ادمین")
  })
  bot.action("admin:addsuper", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    sessions.set(ctx.from.id, { step: "add_admin_id", role: "superadmin" })
    await ctx.reply("شناسه عددی یا یوزرنیم سوپرادمین را وارد کنید (مثال: 123456 یا @username)")
    await ctx.answerCbQuery("افزودن سوپرادمین")
  })
  bot.action("admin:setrole", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    sessions.set(ctx.from.id, { step: "setrole_target" })
    await ctx.reply("شناسه عددی یا یوزرنیم کاربر را برای تغییر نقش وارد کنید")
    await ctx.answerCbQuery("تغییر نقش")
  })
  bot.action("admin:remove", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    sessions.set(ctx.from.id, { step: "remove_admin_id" })
    await ctx.reply("شناسه عددی یا یوزرنیم ادمین را برای حذف وارد کنید")
    await ctx.answerCbQuery("حذف ادمین")
  })
  bot.action("admin:reset", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    await ctx.reply("آیا از ریست دیتابیس مطمئن هستید؟ این عملیات کاربران، رویدادها و اعلان‌ها را پاک می‌کند.", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "بله، ریست کن", callback_data: "admin:reset:confirm" },
            { text: "انصراف", callback_data: "admin:reset:cancel" },
          ],
        ],
      },
    })
    await ctx.answerCbQuery()
  })
  bot.action("admin:reset:cancel", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    await ctx.answerCbQuery("لغو شد")
  })
  bot.action("admin:reset:confirm", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    await storage.resetDatabase()
    await ctx.reply("✅ دیتابیس ریست شد")
    await ctx.answerCbQuery("ریست شد")
  })
  bot.action(/sched:list:(\d+)/, async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    const page = Number(ctx.match[1]) || 1
    const pageSize = 10
    const offset = (page - 1) * pageSize
    const items = await storage.listScheduledBroadcasts(pageSize, offset)
    const rows = items.map((b) => {
      const when = b.scheduled_at ? new Date(b.scheduled_at).toLocaleString("fa-IR", { timeZone: config.timeZone, hour12: false }) : "—"
      const preview = (b.text || "").slice(0, 20).replace(/\n/g, " ")
      return [{ text: `#${b.id} • ${when} • ${preview}`, callback_data: `sched:open:${b.id}:${page}` }]
    })
    const nav = [
      { text: page > 1 ? "قبلی" : "—", callback_data: `sched:list:${Math.max(1, page - 1)}` },
      { text: items.length === pageSize ? "بعدی" : "—", callback_data: `sched:list:${page + 1}` },
    ]
    rows.push(nav)
    rows.push([{ text: "بازگشت", callback_data: "admin:broadcast" }])
    await ctx.reply("فهرست زمان‌بندی‌ها", { reply_markup: { inline_keyboard: rows } })
    await ctx.answerCbQuery()
  })
  bot.action(/sched:open:(\d+):(\d+)/, async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    const id = Number(ctx.match[1])
    const page = Number(ctx.match[2]) || 1
    const b = await storage.getBroadcast(id)
    if (!b || b.status !== "scheduled") {
      await ctx.reply("این مورد یافت نشد یا دیگر زمان‌بندی نیست")
      await ctx.answerCbQuery()
      return
    }
    const when = b.scheduled_at ? new Date(b.scheduled_at).toLocaleString("fa-IR", { timeZone: config.timeZone, hour12: false }) : "—"
    await ctx.reply(`جزئیات #${id}\nزمان: ${when}\n\n${b.text}`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "تغییر متن", callback_data: `sched:edittext:${id}:${page}` },
            { text: "تغییر زمان", callback_data: `sched:edittime:${id}:${page}` },
          ],
          [{ text: "بازگشت", callback_data: `sched:list:${page}` }],
        ],
      },
    })
    await ctx.answerCbQuery()
  })
  bot.action(/sched:edittext:(\d+):(\d+)/, async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    const id = Number(ctx.match[1])
    const page = Number(ctx.match[2]) || 1
    sessions.set(ctx.from.id, { step: "sched_edit_text", editId: id, backPage: page })
    await ctx.reply("متن جدید اعلان را ارسال کنید")
    await ctx.answerCbQuery()
  })
  bot.action(/sched:edittime:(\d+):(\d+)/, async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    const id = Number(ctx.match[1])
    const page = Number(ctx.match[2]) || 1
    const s = { step: "schedule_date", mode: "reschedule", rescheduleId: id, backPage: page }
    sessions.set(ctx.from.id, s)
    const today = new Date()
    const days = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
      const y = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, "0")
      const da = String(d.getDate()).padStart(2, "0")
      const key = `${y}-${mo}-${da}`
      const names = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"]
      const lab = `${i === 0 ? "امروز" : i === 1 ? "فردا" : names[d.getDay()]} ${da}/${mo}`
      days.push({ key, lab })
    }
    const rows = []
    for (let i = 0; i < days.length; i += 2) {
      const r = []
      r.push({ text: days[i].lab, callback_data: `pickdate:${days[i].key}` })
      if (days[i + 1]) r.push({ text: days[i + 1].lab, callback_data: `pickdate:${days[i + 1].key}` })
      rows.push(r)
    }
    await ctx.reply("تاریخ جدید را انتخاب کنید", { reply_markup: { inline_keyboard: rows } })
    await ctx.answerCbQuery()
  })
  bot.command("broadcast", async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) return
    sessions.set(ctx.from.id, { step: "text" })
    await ctx.reply("متن پیام را ارسال کنید")
  })
  bot.on("text", async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    if (s.step === "add_admin_id") {
      const token = (ctx.message.text || "").trim()
      const uid = /^\d+$/.test(token) ? Number(token) : await storage.resolveUserIdByUsername(token)
      if (!uid) {
        await ctx.reply("کاربر یافت نشد؛ از شناسه عددی یا یوزرنیم موجود در دیتابیس استفاده کنید")
        return
      }
      await storage.addAdmin(uid, s.role || "admin")
      sessions.delete(ctx.from.id)
      await ctx.reply(s.role === "superadmin" ? "سوپرادمین اضافه شد" : "ادمین اضافه شد")
      return
    }
    if (s.step === "sched_edit_text") {
      const text = ctx.message.text || ""
      const ok = await storage.updateBroadcastText(s.editId, text)
      sessions.delete(ctx.from.id)
      if (ok) {
        await ctx.reply("متن بروزرسانی شد")
      } else {
        await ctx.reply("امکان بروزرسانی وجود ندارد (شاید دیگر زمان‌بندی نباشد)")
      }
      return
    }
    if (s.step === "setrole_target") {
      const token = (ctx.message.text || "").trim()
      const uid = /^\d+$/.test(token) ? Number(token) : await storage.resolveUserIdByUsername(token)
      if (!uid) {
        await ctx.reply("کاربر یافت نشد؛ از شناسه عددی یا یوزرنیم موجود در دیتابیس استفاده کنید")
        return
      }
      sessions.delete(ctx.from.id)
      await ctx.reply(`نقش جدید را انتخاب کنید برای کاربر #${uid}`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "ادمین", callback_data: `role:set:admin:${uid}` },
              { text: "سوپرادمین", callback_data: `role:set:superadmin:${uid}` },
            ],
          ],
        },
      })
      return
    }
    if (s.step === "remove_admin_id") {
      const token = (ctx.message.text || "").trim()
      const uid = /^\d+$/.test(token) ? Number(token) : await storage.resolveUserIdByUsername(token)
      if (!uid) {
        await ctx.reply("کاربر یافت نشد؛ از شناسه عددی یا یوزرنیم موجود در دیتابیس استفاده کنید")
        return
      }
      await storage.removeAdmin(uid)
      sessions.delete(ctx.from.id)
      await ctx.reply("ادمین حذف شد")
      return
    }
    if (s.step === "text") {
      s.text = ctx.message.text
      s.step = "filter"
      await ctx.reply("فیلتر مخاطبان را انتخاب کنید", {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "همه", callback_data: "filter:all" },
              { text: "فارسی", callback_data: "filter:fa" },
              { text: "انگلیسی", callback_data: "filter:en" },
              { text: "ثبت‌نام", callback_data: "filter:signup" },
            ],
          ],
        },
      })
      return
    }
    if (s.step === "schedule") {
      const dt = parseDateTimeTz(ctx.message.text, config.timeZone)
      if (!dt) {
        await ctx.reply("فرمت زمان نامعتبر است. نمونه: 2026-02-15 21:30")
        return
      }
      const filters = s.filters || {}
      const { id } = await storage.createBroadcast({
        creator_id: ctx.from.id,
        text: s.text,
        filters,
        status: "scheduled",
        scheduled_at: dt.toISOString(),
      })
      sessions.delete(ctx.from.id)
      await ctx.reply(`زمان‌بندی شد: #${id} در ${dt.toLocaleString("fa-IR", { timeZone: config.timeZone, hour12: false })}`)
      return
    }
    if (s.step === "input_hour") {
      const token = (ctx.message.text || "").trim()
      const hNum = Number(token)
      if (!Number.isInteger(hNum) || hNum < 0 || hNum > 23) {
        await ctx.reply("ساعت نامعتبر است. عددی بین 0 تا 23 وارد کنید")
        return
      }
      s.sched = s.sched || {}
      s.sched.hour = String(hNum).padStart(2, "0")
      s.step = "schedule_minute"
      const rows = [
        [
          { text: "00–09", callback_data: "pickminute:range:0" },
          { text: "10–19", callback_data: "pickminute:range:1" },
        ],
        [
          { text: "20–29", callback_data: "pickminute:range:2" },
          { text: "30–39", callback_data: "pickminute:range:3" },
        ],
        [
          { text: "40–49", callback_data: "pickminute:range:4" },
          { text: "50–59", callback_data: "pickminute:range:5" },
        ],
        [{ text: "ورود دستی دقیقه", callback_data: "pickminute:input" }],
      ]
      await ctx.reply("دقیقه را انتخاب کنید", { reply_markup: { inline_keyboard: rows } })
      return
    }
    if (s.step === "input_minute") {
      const token = (ctx.message.text || "").trim()
      const mNum = Number(token)
      if (!Number.isInteger(mNum) || mNum < 0 || mNum > 59) {
        await ctx.reply("دقیقه نامعتبر است. عددی بین 0 تا 59 وارد کنید")
        return
      }
      s.sched = s.sched || {}
      s.sched.minute = String(mNum).padStart(2, "0")
      const [y, mo, da] = s.sched.date.split("-").map((x) => Number(x))
      const h = Number(s.sched.hour)
      const mi = Number(s.sched.minute)
      const dt = zonedDate(y, mo, da, h, mi, config.timeZone)
      if (s.mode === "reschedule" && s.rescheduleId) {
        const ok = await storage.updateBroadcastSchedule(s.rescheduleId, dt.toISOString())
        sessions.delete(ctx.from.id)
        if (ok) {
          await ctx.reply(`زمان جدید ثبت شد: ${dt.toLocaleString("fa-IR", { timeZone: config.timeZone, hour12: false })}`)
        } else {
          await ctx.reply("امکان تغییر زمان وجود ندارد (شاید دیگر زمان‌بندی نباشد)")
        }
      } else {
        const { id } = await storage.createBroadcast({
          creator_id: ctx.from.id,
          text: s.text,
          filters: s.filters || {},
          status: "scheduled",
          scheduled_at: dt.toISOString(),
        })
        sessions.delete(ctx.from.id)
        await ctx.reply(`زمان‌بندی شد: #${id} در ${dt.toLocaleString("fa-IR", { timeZone: config.timeZone, hour12: false })}`)
      }
      return
    }
  })
  bot.action(/filter:(.+)/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    const key = ctx.match[1]
    const filters = {}
    if (key === "fa") filters.lang = "fa"
    else if (key === "en") filters.lang = "en"
    else if (key === "signup") filters.event = "signup"
    s.filters = filters
    const pr = await previewRecipients(filters)
    await ctx.reply(`پیش‌نمایش:\nگیرندگان: ${pr.count}\n\n${s.text}`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "ارسال اکنون", callback_data: "send:now" },
            { text: "زمان‌بندی", callback_data: "send:schedule" },
            { text: "انصراف", callback_data: "send:cancel" },
          ],
        ],
      },
    })
    await ctx.answerCbQuery()
  })
  bot.action(/send:(.+)/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    const act = ctx.match[1]
    if (act === "cancel") {
      sessions.delete(ctx.from.id)
      await ctx.reply("لغو شد")
      await ctx.answerCbQuery()
      return
    }
    if (act === "now") {
      const sent = await sendBroadcastNow(s.text, s.filters || {}, ctx.from.id)
      sessions.delete(ctx.from.id)
      await ctx.reply(`ارسال شد به ${sent} مخاطب`)
      await ctx.answerCbQuery()
      return
    }
    if (act === "schedule") {
      s.step = "schedule_date"
      const today = new Date()
      const days = []
      for (let i = 0; i < 14; i++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
        const y = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, "0")
        const da = String(d.getDate()).padStart(2, "0")
        const key = `${y}-${mo}-${da}`
        const names = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"]
        const lab = `${i === 0 ? "امروز" : i === 1 ? "فردا" : names[d.getDay()]} ${da}/${mo}`
        days.push({ key, lab })
      }
      const rows = []
      for (let i = 0; i < days.length; i += 2) {
        const r = []
        r.push({ text: days[i].lab, callback_data: `pickdate:${days[i].key}` })
        if (days[i + 1]) r.push({ text: days[i + 1].lab, callback_data: `pickdate:${days[i + 1].key}` })
        rows.push(r)
      }
      await ctx.reply("تاریخ ارسال را انتخاب کنید", { reply_markup: { inline_keyboard: rows } })
      await ctx.answerCbQuery()
      return
    }
  })
  bot.action(/pickdate:(\d{4}-\d{2}-\d{2})/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    s.sched = s.sched || {}
    s.sched.date = ctx.match[1]
    s.step = "schedule_hour"
    const rows = []
    for (let h = 0; h < 24; h += 6) {
      const r = []
      for (let k = h; k < h + 6; k++) {
        r.push({ text: String(k).padStart(2, "0"), callback_data: `pickhour:${String(k).padStart(2, "0")}` })
      }
      rows.push(r)
    }
    rows.push([{ text: "ورود دستی ساعت", callback_data: "pickhour:input" }])
    await ctx.reply("ساعت را انتخاب کنید", { reply_markup: { inline_keyboard: rows } })
    await ctx.answerCbQuery()
  })
  bot.action(/pickhour:(\d{2})/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    s.sched = s.sched || {}
    s.sched.hour = ctx.match[1]
    s.step = "schedule_minute"
    const rows = [
      [
        { text: "00–09", callback_data: "pickminute:range:0" },
        { text: "10–19", callback_data: "pickminute:range:1" },
      ],
      [
        { text: "20–29", callback_data: "pickminute:range:2" },
        { text: "30–39", callback_data: "pickminute:range:3" },
      ],
      [
        { text: "40–49", callback_data: "pickminute:range:4" },
        { text: "50–59", callback_data: "pickminute:range:5" },
      ],
      [{ text: "ورود دستی دقیقه", callback_data: "pickminute:input" }],
    ]
    await ctx.reply("دقیقه را انتخاب کنید", { reply_markup: { inline_keyboard: rows } })
    await ctx.answerCbQuery()
  })
  bot.action("pickhour:input", async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    s.step = "input_hour"
    await ctx.reply("ساعت را وارد کنید (0 تا 23)")
    await ctx.answerCbQuery()
  })
  bot.action(/pickminute:range:(\d+)/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    const idx = Number(ctx.match[1])
    const start = idx * 10
    const mins = []
    for (let m = start; m < start + 10; m++) mins.push(String(m).padStart(2, "0"))
    const rows = [
      mins.slice(0, 5).map((m) => ({ text: m, callback_data: `pickminute:${m}` })),
      mins.slice(5, 10).map((m) => ({ text: m, callback_data: `pickminute:${m}` })),
    ]
    await ctx.reply("یک دقیقه را انتخاب کنید", { reply_markup: { inline_keyboard: rows } })
    await ctx.answerCbQuery()
  })
  bot.action("pickminute:input", async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    s.step = "input_minute"
    await ctx.reply("دقیقه را وارد کنید (0 تا 59)")
    await ctx.answerCbQuery()
  })
  bot.action(/pickminute:(\d{2})/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    s.sched = s.sched || {}
    s.sched.minute = ctx.match[1]
    const [y, mo, da] = s.sched.date.split("-").map((x) => Number(x))
    const h = Number(s.sched.hour)
    const mi = Number(s.sched.minute)
    const dt = zonedDate(y, mo, da, h, mi, config.timeZone)
    if (s.mode === "reschedule" && s.rescheduleId) {
      const ok = await storage.updateBroadcastSchedule(s.rescheduleId, dt.toISOString())
      sessions.delete(ctx.from.id)
      if (ok) {
        await ctx.reply(`زمان جدید ثبت شد: ${dt.toLocaleString("fa-IR", { timeZone: config.timeZone, hour12: false })}`)
      } else {
        await ctx.reply("امکان تغییر زمان وجود ندارد (شاید دیگر زمان‌بندی نباشد)")
      }
    } else {
      const { id } = await storage.createBroadcast({
        creator_id: ctx.from.id,
        text: s.text,
        filters: s.filters || {},
        status: "scheduled",
        scheduled_at: dt.toISOString(),
      })
      sessions.delete(ctx.from.id)
      await ctx.reply(`زمان‌بندی شد: #${id} در ${dt.toLocaleString("fa-IR", { timeZone: config.timeZone, hour12: false })}`)
    }
    await ctx.answerCbQuery()
  })
  bot.action(/role:set:(admin|superadmin):(\d+)/, async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.answerCbQuery()
      return
    }
    const role = ctx.match[1]
    const uid = Number(ctx.match[2])
    await storage.addAdmin(uid, role)
    await ctx.reply(`نقش بروزرسانی شد: ${uid} => ${role}`)
    await ctx.answerCbQuery("انجام شد")
  })
}
module.exports = { registerAdmin }
