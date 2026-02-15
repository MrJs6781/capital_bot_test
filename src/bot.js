const { Telegraf } = require("telegraf");
const https = require("https");
const { delay, formatReport, parseDateTimeTz, zonedDate, formatUsersPage, formatEventsPage } = require("./utils");
function createBot(storage, config) {
  const agent = new https.Agent({ family: 4 });
  const bot = new Telegraf(process.env.BOT_TOKEN, { telegram: { agent } });
  const sessions = new Map();
  const reportPrefs = new Map();
  async function isSuper(ctx) {
    if (config.superAdminId && ctx.from && ctx.from.id === config.superAdminId)
      return true;
    const role = await storage.getAdminRole(ctx.from.id);
    return role === "superadmin";
  }
  async function isAdmin(ctx) {
    if (await isSuper(ctx)) return true;
    const role = await storage.getAdminRole(ctx.from.id);
    return !!role;
  }
  async function sendStart(ctx) {
    await storage.upsertUser(ctx.from);
    await storage.logEvent(ctx.from.id, "start", "start");
    if (config.imageUrl) {
      await ctx.replyWithPhoto(config.imageUrl);
      await delay(500);
    }
    const isAdm = await isAdmin(ctx);
    const rows = [
      [{ text: "کانال رسمی", callback_data: "section:channel" }],
      [
        { text: "ثبت‌نام", callback_data: "section:signup" },
        { text: "سایت فارسی", callback_data: "section:site-fa" },
      ],
      [
        { text: "قوانین و شرایط", callback_data: "section:rules" },
        { text: "پشتیبانی تلگرام", callback_data: "section:support" },
      ],
    ];
    if (isAdm) rows.push([{ text: "مشاهده گزارش", callback_data: "stats" }]);
    await ctx.reply(
      `👋 به ربات فارسی CapitalChin خوش آمدید
برای دسترسی سریع به بخش‌های مختلف از دکمه‌های زیر استفاده کنید.`,
      { reply_markup: { inline_keyboard: rows } },
    );
    const kb = isAdm
      ? [
          [{ text: "شروع" }, { text: "گزارش" }],
          [{ text: "راهنما" }, { text: "مدیریت" }],
        ]
      : [[{ text: "شروع" }], [{ text: "راهنما" }]];
    await ctx.reply(`منوی اصلی`, {
      reply_markup: {
        keyboard: kb,
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    });
  }
  async function replyFull(ctx) {
    const s = await storage.getStats();
    const all = await storage.getAllData();
    const messages = formatReport(s, all);
    for (const m of messages) {
      await ctx.reply(m, { parse_mode: "HTML" });
    }
  }
  async function previewRecipients(filters) {
    const ids = await storage.getRecipients(filters);
    return { count: ids.length, ids };
  }
  async function openReportMenu(ctx) {
    const s = await storage.getStats();
    const all = await storage.getAllData();
    const summary = formatReport(s, all)[0];
    const ps = reportPrefs.get(ctx.from.id)?.pageSize || config.reportDefaultPageSize || 30;
    const rows = [
      [
        { text: "کاربران", callback_data: "report:users:1" },
        { text: "رویدادها", callback_data: "report:events:1" },
      ],
      [
        { text: `تعداد/صفحه: ${ps}`, callback_data: "report:size" },
        { text: "بستن", callback_data: "report:close" },
      ],
    ];
    await ctx.reply(summary, { parse_mode: "HTML", reply_markup: { inline_keyboard: rows } });
  }
  async function sendBroadcastNow(text, filters, creatorId) {
    const ids = await storage.getRecipients(filters);
    const { id } = await storage.createBroadcast({
      creator_id: creatorId,
      text,
      filters,
      status: "pending",
    });
    for (const uid of ids) {
      try {
        await bot.telegram.sendMessage(uid, text);
      } catch {}
      await delay(30);
    }
    await storage.markBroadcastSent(id);
    return ids.length;
  }
  bot.start(async (ctx) => {
    try {
      await sendStart(ctx);
    } catch {}
  });
  bot.action("stats", async (ctx) => {
    try {
      if (!(await isAdmin(ctx))) {
        await ctx.answerCbQuery("دسترسی ندارید");
        return;
      }
      await openReportMenu(ctx);
      await ctx.answerCbQuery();
    } catch {
      await ctx.answerCbQuery("خطای گزارش");
    }
  });
  bot.command("stats", async (ctx) => {
    try {
      if (!(await isAdmin(ctx))) {
        await ctx.reply("دسترسی ندارید");
        return;
      }
      await openReportMenu(ctx);
    } catch {
      await ctx.reply("خطا در گزارش");
    }
  });
  bot.command("help", async (ctx) => {
    const t = `دستورات:\n/start شروع\n/stats گزارش کامل\n/help راهنما`;
    await ctx.reply(t);
  });
  bot.hears("گزارش", async (ctx) => {
    try {
      if (!(await isAdmin(ctx))) return;
      await openReportMenu(ctx);
    } catch {}
  });
  bot.hears("شروع", async (ctx) => {
    try {
      await sendStart(ctx);
    } catch {}
  });
  bot.hears("راهنما", async (ctx) => {
    const t = `دستورات:\n/start شروع\n/stats گزارش کامل\n/help راهنما`;
    await ctx.reply(t);
  });
  bot.hears("مدیریت", async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    const isSup = await isSuper(ctx);
    const rows = [
      [
        { text: "ارسال اعلان", callback_data: "admin:broadcast" },
        { text: "فهرست ادمین‌ها", callback_data: "admin:list" },
      ],
      [
        { text: "افزودن ادمین", callback_data: "admin:add" },
        { text: "حذف ادمین", callback_data: "admin:remove" },
      ],
    ];
    if (isSup)
      rows.push([
        { text: "افزودن سوپرادمین", callback_data: "admin:addsuper" },
      ]);
    await ctx.reply("پنل مدیریت", { reply_markup: { inline_keyboard: rows } });
  });
  bot.command("admin", async (ctx) => {
    if (!(await isSuper(ctx))) return;
    const parts = (ctx.message.text || "").trim().split(/\s+/);
    const cmd = parts[1];
    if (cmd === "add" && parts[2]) {
      const role = parts[3] || "admin";
      const token = parts[2];
      const uid = /^\d+$/.test(token)
        ? Number(token)
        : await storage.resolveUserIdByUsername(token);
      if (!uid) {
        await ctx.reply(
          "کاربر یافت نشد؛ از شناسه عددی یا یوزرنیم موجود در دیتابیس استفاده کنید",
        );
        return;
      }
      await storage.addAdmin(uid, role);
      await ctx.reply(`ادمین اضافه شد: ${uid} نقش: ${role}`);
      return;
    }
    if (cmd === "remove" && parts[2]) {
      const token = parts[2];
      const uid = /^\d+$/.test(token)
        ? Number(token)
        : await storage.resolveUserIdByUsername(token);
      if (!uid) {
        await ctx.reply(
          "کاربر یافت نشد؛ از شناسه عددی یا یوزرنیم موجود در دیتابیس استفاده کنید",
        );
        return;
      }
      await storage.removeAdmin(uid);
      await ctx.reply(`ادمین حذف شد: ${uid}`);
      return;
    }
    if (cmd === "setrole" && parts[2] && parts[3]) {
      const token = parts[2];
      const uid = /^\d+$/.test(token)
        ? Number(token)
        : await storage.resolveUserIdByUsername(token);
      if (!uid) {
        await ctx.reply(
          "کاربر یافت نشد؛ از شناسه عددی یا یوزرنیم موجود در دیتابیس استفاده کنید",
        );
        return;
      }
      const role = parts[3];
      await storage.addAdmin(uid, role);
      await ctx.reply(`نقش بروزرسانی شد: ${uid} => ${role}`);
      return;
    }
    if (cmd === "list") {
      const list = await storage.listAdmins();
      const lines = list.map((a) => `${a.user_id} ${a.role}`);
      await ctx.reply(lines.length ? lines.join("\n") : "فهرست خالی است");
      return;
    }
    await ctx.reply(
      `دستورات مدیریت:\n/admin add <user_id> [role]\n/admin remove <user_id>\n/admin setrole <user_id> <role>\n/admin list`,
    );
  });
  bot.action("admin:broadcast", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      await ctx.answerCbQuery();
      return;
    }
    sessions.set(ctx.from.id, { step: "text" });
    await ctx.reply("متن پیام را ارسال کنید");
    await ctx.answerCbQuery("شروع ارسال انبوه");
  });
  bot.action("admin:list", async (ctx) => {
    if (!(await isSuper(ctx))) {
      await ctx.answerCbQuery();
      return;
    }
    const list = await storage.listAdmins();
    const lines = list.map((a) => `${a.user_id} ${a.role}`);
    await ctx.reply(lines.length ? lines.join("\n") : "فهرست خالی است");
    await ctx.answerCbQuery("فهرست ادمین‌ها");
  });
  bot.action("admin:add", async (ctx) => {
    if (!(await isSuper(ctx))) {
      await ctx.answerCbQuery();
      return;
    }
    sessions.set(ctx.from.id, { step: "add_admin_id", role: "admin" });
    await ctx.reply(
      "شناسه عددی یا یوزرنیم کاربر را وارد کنید (مثال: 123456 یا @username)",
    );
    await ctx.answerCbQuery("افزودن ادمین");
  });
  bot.action("admin:addsuper", async (ctx) => {
    if (!(await isSuper(ctx))) {
      await ctx.answerCbQuery();
      return;
    }
    sessions.set(ctx.from.id, { step: "add_admin_id", role: "superadmin" });
    await ctx.reply(
      "شناسه عددی یا یوزرنیم سوپرادمین را وارد کنید (مثال: 123456 یا @username)",
    );
    await ctx.answerCbQuery("افزودن سوپرادمین");
  });
  bot.action("admin:remove", async (ctx) => {
    if (!(await isSuper(ctx))) {
      await ctx.answerCbQuery();
      return;
    }
    sessions.set(ctx.from.id, { step: "remove_admin_id" });
    await ctx.reply("شناسه عددی یا یوزرنیم ادمین را برای حذف وارد کنید");
    await ctx.answerCbQuery("حذف ادمین");
  });
  bot.command("broadcast", async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    sessions.set(ctx.from.id, { step: "text" });
    await ctx.reply("متن پیام را ارسال کنید");
  });
  bot.on("text", async (ctx) => {
    const s = sessions.get(ctx.from.id);
    if (!s) return;
    if (s.step === "add_admin_id") {
      const token = (ctx.message.text || "").trim();
      const uid = /^\d+$/.test(token)
        ? Number(token)
        : await storage.resolveUserIdByUsername(token);
      if (!uid) {
        await ctx.reply(
          "کاربر یافت نشد؛ از شناسه عددی یا یوزرنیم موجود در دیتابیس استفاده کنید",
        );
        return;
      }
      await storage.addAdmin(uid, s.role || "admin");
      sessions.delete(ctx.from.id);
      await ctx.reply(
        s.role === "superadmin" ? "سوپرادمین اضافه شد" : "ادمین اضافه شد",
      );
      return;
    }
    if (s.step === "remove_admin_id") {
      const token = (ctx.message.text || "").trim();
      const uid = /^\d+$/.test(token)
        ? Number(token)
        : await storage.resolveUserIdByUsername(token);
      if (!uid) {
        await ctx.reply(
          "کاربر یافت نشد؛ از شناسه عددی یا یوزرنیم موجود در دیتابیس استفاده کنید",
        );
        return;
      }
      await storage.removeAdmin(uid);
      sessions.delete(ctx.from.id);
      await ctx.reply("ادمین حذف شد");
      return;
    }
    if (s.step === "text") {
      s.text = ctx.message.text;
      s.step = "filter";
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
      });
      return;
    }
    if (s.step === "schedule") {
      const dt = parseDateTimeTz(ctx.message.text, config.timeZone);
      if (!dt) {
        await ctx.reply("فرمت زمان نامعتبر است. نمونه: 2026-02-15 21:30");
        return;
      }
      const filters = s.filters || {};
      const { id } = await storage.createBroadcast({
        creator_id: ctx.from.id,
        text: s.text,
        filters,
        status: "scheduled",
        scheduled_at: dt.toISOString(),
      });
      sessions.delete(ctx.from.id);
      await ctx.reply(
        `زمان‌بندی شد: #${id} در ${dt.toLocaleString("fa-IR", { timeZone: config.timeZone, hour12: false })}`,
      );
      return;
    }
    if (s.step === "input_hour") {
      const token = (ctx.message.text || "").trim();
      const hNum = Number(token);
      if (!Number.isInteger(hNum) || hNum < 0 || hNum > 23) {
        await ctx.reply("ساعت نامعتبر است. عددی بین 0 تا 23 وارد کنید");
        return;
      }
      s.sched = s.sched || {};
      s.sched.hour = String(hNum).padStart(2, "0");
      s.step = "schedule_minute";
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
      ];
      await ctx.reply("دقیقه را انتخاب کنید", { reply_markup: { inline_keyboard: rows } });
      return;
    }
    if (s.step === "input_minute") {
      const token = (ctx.message.text || "").trim();
      const mNum = Number(token);
      if (!Number.isInteger(mNum) || mNum < 0 || mNum > 59) {
        await ctx.reply("دقیقه نامعتبر است. عددی بین 0 تا 59 وارد کنید");
        return;
      }
      s.sched = s.sched || {};
      s.sched.minute = String(mNum).padStart(2, "0");
      const [y, mo, da] = s.sched.date.split("-").map((x) => Number(x));
      const h = Number(s.sched.hour);
      const mi = Number(s.sched.minute);
      const dt = zonedDate(y, mo, da, h, mi, config.timeZone);
      const { id } = await storage.createBroadcast({
        creator_id: ctx.from.id,
        text: s.text,
        filters: s.filters || {},
        status: "scheduled",
        scheduled_at: dt.toISOString(),
      });
      sessions.delete(ctx.from.id);
      await ctx.reply(
        `زمان‌بندی شد: #${id} در ${dt.toLocaleString("fa-IR", { timeZone: config.timeZone, hour12: false })}`,
      );
      return;
    }
  });
  bot.action(/filter:(.+)/, async (ctx) => {
    const s = sessions.get(ctx.from.id);
    if (!s) return;
    const key = ctx.match[1];
    const filters = {};
    if (key === "fa") filters.lang = "fa";
    else if (key === "en") filters.lang = "en";
    else if (key === "signup") filters.event = "signup";
    s.filters = filters;
    const pr = await previewRecipients(filters);
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
    });
    await ctx.answerCbQuery();
  });
  bot.action(/send:(.+)/, async (ctx) => {
    const s = sessions.get(ctx.from.id);
    if (!s) return;
    const act = ctx.match[1];
    if (act === "cancel") {
      sessions.delete(ctx.from.id);
      await ctx.reply("لغو شد");
      await ctx.answerCbQuery();
      return;
    }
    if (act === "now") {
      const sent = await sendBroadcastNow(s.text, s.filters || {}, ctx.from.id);
      sessions.delete(ctx.from.id);
      await ctx.reply(`ارسال شد به ${sent} مخاطب`);
      await ctx.answerCbQuery();
      return;
    }
    if (act === "schedule") {
      s.step = "schedule_date";
      const today = new Date();
      const days = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() + i,
        );
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, "0");
        const da = String(d.getDate()).padStart(2, "0");
        const key = `${y}-${mo}-${da}`;
        const names = [
          "یکشنبه",
          "دوشنبه",
          "سه‌شنبه",
          "چهارشنبه",
          "پنجشنبه",
          "جمعه",
          "شنبه",
        ];
        const lab = `${i === 0 ? "امروز" : i === 1 ? "فردا" : names[d.getDay()]} ${da}/${mo}`;
        days.push({ key, lab });
      }
      const rows = [];
      for (let i = 0; i < days.length; i += 2) {
        const r = [];
        r.push({ text: days[i].lab, callback_data: `pickdate:${days[i].key}` });
        if (days[i + 1])
          r.push({
            text: days[i + 1].lab,
            callback_data: `pickdate:${days[i + 1].key}`,
          });
        rows.push(r);
      }
      await ctx.reply("تاریخ ارسال را انتخاب کنید", {
        reply_markup: { inline_keyboard: rows },
      });
      await ctx.answerCbQuery();
      return;
    }
  });
  bot.action(/pickdate:(\d{4}-\d{2}-\d{2})/, async (ctx) => {
    const s = sessions.get(ctx.from.id);
    if (!s) return;
    s.sched = s.sched || {};
    s.sched.date = ctx.match[1];
    s.step = "schedule_hour";
    const rows = [];
    for (let h = 0; h < 24; h += 6) {
      const r = [];
      for (let k = h; k < h + 6; k++) {
        r.push({
          text: String(k).padStart(2, "0"),
          callback_data: `pickhour:${String(k).padStart(2, "0")}`,
        });
      }
      rows.push(r);
    }
    rows.push([{ text: "ورود دستی ساعت", callback_data: "pickhour:input" }]);
    await ctx.reply("ساعت را انتخاب کنید", { reply_markup: { inline_keyboard: rows } });
    await ctx.answerCbQuery();
  });
  bot.action(/pickhour:(\d{2})/, async (ctx) => {
    const s = sessions.get(ctx.from.id);
    if (!s) return;
    s.sched = s.sched || {};
    s.sched.hour = ctx.match[1];
    s.step = "schedule_minute";
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
    ];
    await ctx.reply("دقیقه را انتخاب کنید", { reply_markup: { inline_keyboard: rows } });
    await ctx.answerCbQuery();
  });
  bot.action("pickhour:input", async (ctx) => {
    const s = sessions.get(ctx.from.id);
    if (!s) return;
    s.step = "input_hour";
    await ctx.reply("ساعت را وارد کنید (0 تا 23)");
    await ctx.answerCbQuery();
  });
  bot.action(/pickminute:range:(\d+)/, async (ctx) => {
    const s = sessions.get(ctx.from.id);
    if (!s) return;
    const idx = Number(ctx.match[1]);
    const start = idx * 10;
    const mins = [];
    for (let m = start; m < start + 10; m++) mins.push(String(m).padStart(2, "0"));
    const rows = [
      mins.slice(0, 5).map((m) => ({ text: m, callback_data: `pickminute:${m}` })),
      mins.slice(5, 10).map((m) => ({ text: m, callback_data: `pickminute:${m}` })),
    ];
    await ctx.reply("یک دقیقه را انتخاب کنید", { reply_markup: { inline_keyboard: rows } });
    await ctx.answerCbQuery();
  });
  bot.action("pickminute:input", async (ctx) => {
    const s = sessions.get(ctx.from.id);
    if (!s) return;
    s.step = "input_minute";
    await ctx.reply("دقیقه را وارد کنید (0 تا 59)");
    await ctx.answerCbQuery();
  });
  bot.action(/pickminute:(\d{2})/, async (ctx) => {
    const s = sessions.get(ctx.from.id);
    if (!s) return;
    s.sched = s.sched || {};
    s.sched.minute = ctx.match[1];
    const [y, mo, da] = s.sched.date.split("-").map((x) => Number(x));
    const h = Number(s.sched.hour);
    const mi = Number(s.sched.minute);
    const dt = zonedDate(y, mo, da, h, mi, config.timeZone);
    const { id } = await storage.createBroadcast({
      creator_id: ctx.from.id,
      text: s.text,
      filters: s.filters || {},
      status: "scheduled",
      scheduled_at: dt.toISOString(),
    });
    sessions.delete(ctx.from.id);
    await ctx.reply(
      `زمان‌بندی شد: #${id} در ${dt.toLocaleString("fa-IR", { timeZone: config.timeZone, hour12: false })}`,
    );
    await ctx.answerCbQuery();
  });
  bot.action(/report:users:(\d+)/, async (ctx) => {
    if (!(await isAdmin(ctx))) {
      await ctx.answerCbQuery();
      return;
    }
    const page = Number(ctx.match[1]);
    const ps = reportPrefs.get(ctx.from.id)?.pageSize || config.reportDefaultPageSize || 30;
    const all = await storage.getAllData();
    const [text, meta] = formatUsersPage(all.users || [], page, ps);
    const rows = [
      [
        { text: meta.page > 1 ? "قبلی" : "—", callback_data: `report:users:${Math.max(1, meta.page - 1)}` },
        { text: meta.page < meta.pages ? "بعدی" : "—", callback_data: `report:users:${Math.min(meta.pages, meta.page + 1)}` },
      ],
      [
        { text: "بازگشت به منو", callback_data: "stats" },
      ],
    ];
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: rows } });
    await ctx.answerCbQuery();
  });
  bot.action(/report:events:(\d+)/, async (ctx) => {
    if (!(await isAdmin(ctx))) {
      await ctx.answerCbQuery();
      return;
    }
    const page = Number(ctx.match[1]);
    const ps = reportPrefs.get(ctx.from.id)?.pageSize || config.reportDefaultPageSize || 30;
    const all = await storage.getAllData();
    const [text, meta] = formatEventsPage(all.events || [], page, ps);
    const rows = [
      [
        { text: meta.page > 1 ? "قبلی" : "—", callback_data: `report:events:${Math.max(1, meta.page - 1)}` },
        { text: meta.page < meta.pages ? "بعدی" : "—", callback_data: `report:events:${Math.min(meta.pages, meta.page + 1)}` },
      ],
      [
        { text: "بازگشت به منو", callback_data: "stats" },
      ],
    ];
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: rows } });
    await ctx.answerCbQuery();
  });
  bot.action("report:size", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      await ctx.answerCbQuery();
      return;
    }
    const current = reportPrefs.get(ctx.from.id)?.pageSize || config.reportDefaultPageSize || 30;
    const opts = [10, 20, 30, 50, 100];
    const rows = [];
    for (let i = 0; i < opts.length; i += 3) {
      const r = [];
      for (let k = i; k < i + 3 && k < opts.length; k++) {
        const v = opts[k];
        r.push({ text: `${v}${v === current ? " ✓" : ""}`, callback_data: `report:setsize:${v}` });
      }
      rows.push(r);
    }
    rows.push([{ text: "بازگشت", callback_data: "stats" }]);
    await ctx.reply("تعداد آیتم‌ها در هر صفحه را انتخاب کنید", { reply_markup: { inline_keyboard: rows } });
    await ctx.answerCbQuery();
  });
  bot.action(/report:setsize:(\d+)/, async (ctx) => {
    if (!(await isAdmin(ctx))) {
      await ctx.answerCbQuery();
      return;
    }
    const v = Number(ctx.match[1]);
    if (!Number.isInteger(v) || v <= 0) {
      await ctx.answerCbQuery("نامعتبر");
      return;
    }
    const pref = reportPrefs.get(ctx.from.id) || {};
    pref.pageSize = v;
    reportPrefs.set(ctx.from.id, pref);
    await ctx.answerCbQuery("ذخیره شد");
    await openReportMenu(ctx);
  });
  bot.action("report:close", async (ctx) => {
    await ctx.answerCbQuery("بسته شد");
  });
  return bot;
}
module.exports = { createBot };
