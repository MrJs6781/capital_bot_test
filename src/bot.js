const { Telegraf } = require("telegraf");
const https = require("https");
const { delay, makeUrl, formatReport } = require("./utils");
function createBot(storage, config) {
  const agent = new https.Agent({ family: 4 });
  const bot = new Telegraf(process.env.BOT_TOKEN, { telegram: { agent } });
  const pendingBroadcast = new Set();
  const pendingAddAdmin = new Set();
  const pendingRemoveAdmin = new Set();
  const bc = new Map(); // { text, filter: { languages:[], clickedNames:[], startedOnly:false }, awaitingSchedule:boolean }
  const isSuperAdmin = (ctx) =>
    Number(config.superAdminId || 0) === ctx.from.id;
  const isAdmin = async (ctx) => {
    if (isSuperAdmin(ctx)) return true;
    return storage.isAdmin(ctx.from.id);
  };
  async function sendStart(ctx) {
    await storage.upsertUser(ctx.from);
    await storage.logEvent(ctx.from.id, "start", "start");
    if (config.imageUrl) {
      await ctx.replyWithPhoto(config.imageUrl);
      await delay(500);
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
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "کانال رسمی",
                url: makeUrl(config.redirectBase, "channel", ctx.from.id),
              },
            ],
          ],
        },
      },
    );
    await delay(700);
    await ctx.reply(`🔗 لینک ثبت‌نام:\n👉 https://checkout.capitalchain.co`, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "ثبت‌نام",
              url: makeUrl(config.redirectBase, "signup", ctx.from.id),
            },
          ],
        ],
      },
    });
    await delay(700);
    await ctx.reply(
      `📌 ورود به سایت فارسی کپیتال چین\n🔗 http://CapitalChain.co/farsi`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "سایت فارسی",
                url: makeUrl(config.redirectBase, "site-fa", ctx.from.id),
              },
            ],
          ],
        },
      },
    );
    await delay(700);
    await ctx.reply(
      `📌 قوانین و شرایط
مطالعه قوانین، پلن‌ها و شرایط برداشت
🔗 قوانین و مقررات:
👉 https://capitalchain.co/terms-of-use`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "قوانین و شرایط",
                url: makeUrl(config.redirectBase, "rules", ctx.from.id),
              },
            ],
          ],
        },
      },
    );
    await delay(700);
    await ctx.reply(
      `📌 پشتیبانی فارسی
در صورت داشتن هرگونه سوال یا مشکل، با پشتیبانی در ارتباط باشید
🔗 پشتیبانی تلگرام:
👉 https://t.me/CapitalChainfarsi_support`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "پشتیبانی تلگرام",
                url: makeUrl(config.redirectBase, "support", ctx.from.id),
              },
            ],
          ],
        },
      },
    );
    await delay(700);
    await ctx.reply(`🧾 گزارش ساده`, {
      reply_markup: {
        inline_keyboard: [[{ text: "مشاهده گزارش", callback_data: "stats" }]],
      },
    });
    await delay(500);
    const kb = [[{ text: "شروع" }, { text: "گزارش" }], [{ text: "راهنما" }]];
    if (await isAdmin(ctx)) kb[0].push({ text: "اطلاعیه" });
    if (isSuperAdmin(ctx)) kb.push([{ text: "مدیریت ادمین‌ها" }]);
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
  async function doBroadcast(ctx, text, filter = {}) {
    const ids = await storage.getTargetUsers(filter);
    let ok = 0,
      fail = 0;
    for (const uid of ids) {
      try {
        await bot.telegram.sendMessage(uid, text, {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
        await delay(25);
        ok++;
      } catch {
        fail++;
      }
    }
    await ctx.reply(`اطلاعیه ارسال شد.\nگیرنده‌ها: ${ids.length}\nموفق: ${ok} | ناموفق: ${fail}`);
  }
  function summarizeFilter(f) {
    const langs = (f.languages || []).join(", ") || "همه";
    const evts = (f.clickedNames || []).join(", ") || "بدون فیلتر کلیک";
    const started = f.startedOnly ? "فقط شروع کرده‌اند" : "همه کاربران";
    return `زبان: ${langs}\nرویداد کلیک: ${evts}\nمحدوده: ${started}`;
  }
  async function showComposeMenu(ctx) {
    const st = bc.get(ctx.from.id);
    if (!st || !st.text) return;
    const filterText = summarizeFilter(st.filter || {});
    await ctx.reply(
      `اطلاعیه آماده ارسال\n\n${filterText}\n\nگزینه‌ها:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "زبان fa", callback_data: "bc_lang_fa" },
              { text: "زبان en", callback_data: "bc_lang_en" },
            ],
            [
              { text: "کلیک signup", callback_data: "bc_evt_signup" },
              { text: "کلیک channel", callback_data: "bc_evt_channel" },
            ],
            [
              { text: "کلیک site-fa", callback_data: "bc_evt_site-fa" },
              { text: "کلیک rules", callback_data: "bc_evt_rules" },
              { text: "کلیک support", callback_data: "bc_evt_support" },
            ],
            [{ text: "فقط شروع کرده‌اند", callback_data: "bc_started_toggle" }],
            [{ text: "پاکسازی فیلترها", callback_data: "bc_clear" }],
            [{ text: "پیش‌نمایش", callback_data: "bc_preview" }],
            [{ text: "ارسال اکنون", callback_data: "bc_send_now" }],
            [{ text: "زمان‌بندی", callback_data: "bc_schedule" }],
          ],
        },
      },
    );
  }
  async function showAdminMenu(ctx) {
    const list = await storage.getAdmins();
    const lines = list.length ? list.map((id) => `• ${id}`).join("\n") : "—";
    await ctx.reply(`مدیریت ادمین‌ها\nلیست فعلی:\n${lines}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "افزودن ادمین", callback_data: "admin_add" }],
          [{ text: "حذف ادمین", callback_data: "admin_remove" }],
          [{ text: "به‌روزرسانی لیست", callback_data: "admin_list" }],
        ],
      },
    });
  }

  bot.command("broadcast", async (ctx) => {
    if (!(await isAdmin(ctx))) return ctx.reply("دسترسی ندارید");
    const text = (ctx.message.text || "").replace(/^\/broadcast\s*/, "").trim();
    if (text) {
      bc.set(ctx.from.id, { text, filter: { languages: [], clickedNames: [], startedOnly: false }, awaitingSchedule: false });
      return showComposeMenu(ctx);
    }
    bc.set(ctx.from.id, { text: null, filter: { languages: [], clickedNames: [], startedOnly: false }, awaitingSchedule: false });
    await ctx.reply("متن اطلاعیه را ارسال کنید. برای لغو: /cancel");
  });
  bot.hears("اطلاعیه", async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    bc.set(ctx.from.id, { text: null, filter: { languages: [], clickedNames: [], startedOnly: false }, awaitingSchedule: false });
    await ctx.reply("متن اطلاعیه را ارسال کنید. برای لغو: /cancel");
  });
  bot.command("cancel", async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    bc.delete(ctx.from.id);
    pendingAddAdmin.delete(ctx.from.id);
    pendingRemoveAdmin.delete(ctx.from.id);
    await ctx.reply("لغو شد.");
  });
  bot.hears("مدیریت ادمین‌ها", async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    await showAdminMenu(ctx);
  });
  bot.action("admin_add", async (ctx) => {
    if (!isSuperAdmin(ctx)) return ctx.answerCbQuery("دسترسی ندارید");
    pendingAddAdmin.add(ctx.from.id);
    await ctx.reply("آیدی عددی کاربر را ارسال کنید. برای لغو: /cancel");
    await ctx.answerCbQuery();
  });
  bot.action("admin_remove", async (ctx) => {
    if (!isSuperAdmin(ctx)) return ctx.answerCbQuery("دسترسی ندارید");
    pendingRemoveAdmin.add(ctx.from.id);
    await ctx.reply("آیدی عددی کاربر را ارسال کنید. برای لغو: /cancel");
    await ctx.answerCbQuery();
  });
  bot.action("admin_list", async (ctx) => {
    if (!isSuperAdmin(ctx)) return ctx.answerCbQuery("دسترسی ندارید");
    const list = await storage.getAdmins();
    await ctx.reply(
      list.length
        ? `ادمین‌ها:\n${list.map((id) => `• ${id}`).join("\n")}`
        : "ادمینی ثبت نشده است.",
    );
    await ctx.answerCbQuery();
  });
  bot.on("text", async (ctx) => {
    const st = bc.get(ctx.from.id);
    if ((await isAdmin(ctx)) && st && !(ctx.message.text || "").startsWith("/")) {
      if (!st.text && !st.awaitingSchedule) {
        st.text = ctx.message.text;
        bc.set(ctx.from.id, st);
        await showComposeMenu(ctx);
        return;
      }
      if (st.awaitingSchedule) {
        const { parseTehranDateTime } = require("./utils");
        const dt = parseTehranDateTime(ctx.message.text || "");
        if (!dt) return ctx.reply("فرمت زمان نامعتبر است. مثال: 2026-02-15 14:30");
        const runAt = dt.toISOString();
        const id = await storage.addJob(ctx.from.id, st.text, st.filter || {}, runAt);
        bc.delete(ctx.from.id);
        await ctx.reply(`اطلاعیه زمان‌بندی شد. شناسه: ${id}\nزمان اجرا: ${dt.toLocaleString("fa-IR", { timeZone: "Asia/Tehran", hour12: false })}`);
        return;
      }
    }
    if (
      isSuperAdmin(ctx) &&
      pendingAddAdmin.has(ctx.from.id) &&
      !(ctx.message.text || "").startsWith("/")
    ) {
      const id = Number((ctx.message.text || "").trim());
      if (!id || isNaN(id) || id <= 0) return ctx.reply("آیدی نامعتبر است.");
      pendingAddAdmin.delete(ctx.from.id);
      await storage.addAdmin(id);
      await ctx.reply(`ادمین با آیدی ${id} افزوده شد.`);
      return;
    }
    if (
      isSuperAdmin(ctx) &&
      pendingRemoveAdmin.has(ctx.from.id) &&
      !(ctx.message.text || "").startsWith("/")
    ) {
      const id = Number((ctx.message.text || "").trim());
      if (!id || isNaN(id) || id <= 0) return ctx.reply("آیدی نامعتبر است.");
      pendingRemoveAdmin.delete(ctx.from.id);
      await storage.removeAdmin(id);
      await ctx.reply(`ادمین با آیدی ${id} حذف شد.`);
      return;
    }
  });

  bot.start(async (ctx) => {
    try {
      await sendStart(ctx);
    } catch {}
  });
  bot.action("stats", async (ctx) => {
    try {
      await replyFull(ctx);
      await ctx.answerCbQuery();
    } catch {
      await ctx.answerCbQuery("خطای گزارش");
    }
  });
  bot.command("stats", async (ctx) => {
    try {
      await replyFull(ctx);
    } catch {
      await ctx.reply("خطا در گزارش");
    }
  });
  bot.command("help", async (ctx) => {
    const t = `دستورات:\n/start شروع\n/stats گزارش کامل\n/help راهنما`;
    const adminT = (await isAdmin(ctx)) ? `\n/broadcast اطلاع‌رسانی` : "";
    const superT = isSuperAdmin(ctx)
      ? `\nمدیریت ادمین‌ها از منو\n/addadmin <id>\n/removeadmin <id>\n/admins`
      : "";
    await ctx.reply(t + adminT + superT);
  });
  function toggleFilter(arr, val) {
    const i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(val);
  }
  bot.action("bc_lang_fa", async (ctx) => {
    const st = bc.get(ctx.from.id);
    if (!st) return ctx.answerCbQuery();
    toggleFilter(st.filter.languages, "fa");
    bc.set(ctx.from.id, st);
    await ctx.answerCbQuery("به‌روزرسانی زبان: fa");
  });
  bot.action("bc_lang_en", async (ctx) => {
    const st = bc.get(ctx.from.id);
    if (!st) return ctx.answerCbQuery();
    toggleFilter(st.filter.languages, "en");
    bc.set(ctx.from.id, st);
    await ctx.answerCbQuery("به‌روزرسانی زبان: en");
  });
  const evtNames = ["signup", "channel", "site-fa", "rules", "support"];
  for (const name of evtNames) {
    bot.action(`bc_evt_${name}`, async (ctx) => {
      const st = bc.get(ctx.from.id);
      if (!st) return ctx.answerCbQuery();
      toggleFilter(st.filter.clickedNames, name);
      bc.set(ctx.from.id, st);
      await ctx.answerCbQuery(`فیلتر کلیک: ${name}`);
    });
  }
  bot.action("bc_started_toggle", async (ctx) => {
    const st = bc.get(ctx.from.id);
    if (!st) return ctx.answerCbQuery();
    st.filter.startedOnly = !st.filter.startedOnly;
    bc.set(ctx.from.id, st);
    await ctx.answerCbQuery("به‌روزرسانی محدوده");
  });
  bot.action("bc_clear", async (ctx) => {
    const st = bc.get(ctx.from.id);
    if (!st) return ctx.answerCbQuery();
    st.filter = { languages: [], clickedNames: [], startedOnly: false };
    bc.set(ctx.from.id, st);
    await ctx.answerCbQuery("پاکسازی فیلترها");
  });
  bot.action("bc_preview", async (ctx) => {
    const st = bc.get(ctx.from.id);
    if (!st) return ctx.answerCbQuery();
    const ids = await storage.getTargetUsers(st.filter || {});
    const sample = ids.slice(0, 10).map((x) => `• ${x}`).join("\n") || "—";
    await ctx.reply(
      `پیش‌نمایش اطلاع‌رسانی\nگیرنده‌ها: ${ids.length}\nنمونه:\n${sample}\n\nمتن:\n${st.text.slice(0, 400)}`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "تأیید ارسال", callback_data: "bc_confirm_send" }]],
        },
      },
    );
    await ctx.answerCbQuery();
  });
  bot.action("bc_send_now", async (ctx) => {
    const st = bc.get(ctx.from.id);
    if (!st) return ctx.answerCbQuery();
    await doBroadcast(ctx, st.text, st.filter || {});
    bc.delete(ctx.from.id);
    await ctx.answerCbQuery();
  });
  bot.action("bc_confirm_send", async (ctx) => {
    const st = bc.get(ctx.from.id);
    if (!st) return ctx.answerCbQuery();
    await doBroadcast(ctx, st.text, st.filter || {});
    bc.delete(ctx.from.id);
    await ctx.answerCbQuery("ارسال شد");
  });
  bot.action("bc_schedule", async (ctx) => {
    const st = bc.get(ctx.from.id);
    if (!st) return ctx.answerCbQuery();
    st.awaitingSchedule = true;
    bc.set(ctx.from.id, st);
    await ctx.reply("زمان اجرا را به‌صورت YYYY-MM-DD HH:mm (تهران) ارسال کنید. مثال: 2026-02-15 14:30");
    await ctx.answerCbQuery();
  });
  // Scheduler loop
  setInterval(async () => {
    try {
      const jobs = await storage.getDueJobs();
      for (const j of jobs) {
        const ids = await storage.getTargetUsers(j.filter || {});
        let ok = 0, fail = 0;
        for (const uid of ids) {
          try {
            await bot.telegram.sendMessage(uid, j.text, { parse_mode: "HTML", disable_web_page_preview: true });
            await delay(25);
            ok++;
          } catch {
            fail++;
          }
        }
        await storage.markJobDone(j.id);
        await bot.telegram.sendMessage(j.creator_id, `اطلاعیه زمان‌بندی‌شده اجرا شد.\nگیرنده‌ها: ${ids.length}\nموفق: ${ok} | ناموفق: ${fail}`);
      }
    } catch {}
  }, 15000);
  bot.command("addadmin", async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    const id = Number(
      (ctx.message.text || "").replace(/^\/addadmin\s*/, "").trim(),
    );
    if (!id || isNaN(id) || id <= 0) return ctx.reply("آیدی نامعتبر است.");
    await storage.addAdmin(id);
    await ctx.reply(`ادمین با آیدی ${id} افزوده شد.`);
  });
  bot.command("removeadmin", async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    const id = Number(
      (ctx.message.text || "").replace(/^\/removeadmin\s*/, "").trim(),
    );
    if (!id || isNaN(id) || id <= 0) return ctx.reply("آیدی نامعتبر است.");
    await storage.removeAdmin(id);
    await ctx.reply(`ادمین با آیدی ${id} حذف شد.`);
  });
  bot.command("admins", async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    const list = await storage.getAdmins();
    await ctx.reply(
      list.length
        ? `ادمین‌ها:\n${list.map((id) => `• ${id}`).join("\n")}`
        : "ادمینی ثبت نشده است.",
    );
  });
  bot.hears("گزارش", async (ctx) => {
    try {
      await replyFull(ctx);
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
  return bot;
}
module.exports = { createBot };
