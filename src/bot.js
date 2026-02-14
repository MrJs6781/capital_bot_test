const { Telegraf } = require("telegraf");
const https = require("https");
const { delay, makeUrl, formatReport } = require("./utils");
function createBot(storage, config) {
  const agent = new https.Agent({ family: 4 });
  const bot = new Telegraf(process.env.BOT_TOKEN, { telegram: { agent } });
  const pendingBroadcast = new Set();
  const pendingAddAdmin = new Set();
  const pendingRemoveAdmin = new Set();
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
  async function doBroadcast(ctx, text) {
    const { users } = await storage.getAllData();
    let ok = 0,
      fail = 0;
    for (const u of users) {
      try {
        await bot.telegram.sendMessage(u.id, text, {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
        await delay(25);
        ok++;
      } catch {
        fail++;
      }
    }
    await ctx.reply(`اطلاعیه ارسال شد.\nموفق: ${ok} | ناموفق: ${fail}`);
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
    if (text) return doBroadcast(ctx, text);
    pendingBroadcast.add(ctx.from.id);
    await ctx.reply("متن اطلاعیه را ارسال کنید. برای لغو: /cancel");
  });
  bot.hears("اطلاعیه", async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    pendingBroadcast.add(ctx.from.id);
    await ctx.reply("متن اطلاعیه را ارسال کنید. برای لغو: /cancel");
  });
  bot.command("cancel", async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    pendingBroadcast.delete(ctx.from.id);
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
    if (
      (await isAdmin(ctx)) &&
      pendingBroadcast.has(ctx.from.id) &&
      !(ctx.message.text || "").startsWith("/")
    ) {
      pendingBroadcast.delete(ctx.from.id);
      await doBroadcast(ctx, ctx.message.text);
      return;
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
