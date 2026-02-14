const { Telegraf } = require("telegraf");
require("dotenv").config();
const https = require('https');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const agent = new https.Agent({ family: 4 });
const bot = new Telegraf(process.env.BOT_TOKEN, { telegram: { agent: agent } });
const app = express();
const PORT = process.env.PORT || 3000;
let upsertUser = async () => {};
let logEvent = async () => {};
let initDb = async () => {};
const usePg = !!process.env.DATABASE_URL;
if (usePg) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  });
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
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT,
        type TEXT,
        name TEXT,
        ts TIMESTAMPTZ,
        metadata TEXT
      )
    `);
  };
  upsertUser = async function(from) {
    const now = new Date().toISOString();
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
    ]);
  };
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
    ]);
  };
} else {
  const DB_FILE = path.join(process.cwd(), 'analytics.json');
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, events: [] }));
  }
  const readStore = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  const writeStore = (s) => fs.writeFileSync(DB_FILE, JSON.stringify(s));
  initDb = async function(){};
  upsertUser = async function(from) {
    const s = readStore();
    const now = new Date().toISOString();
    const prev = s.users[from.id];
    s.users[from.id] = {
      id: from.id,
      username: from.username || null,
      first_name: from.first_name || null,
      last_name: from.last_name || null,
      language_code: from.language_code || null,
      is_bot: from.is_bot ? 1 : 0,
      created_at: prev && prev.created_at ? prev.created_at : now,
      updated_at: now
    };
    writeStore(s);
  };
  logEvent = async function(userId, type, name, metadata) {
    const s = readStore();
    s.events.push({
      id: s.events.length + 1,
      user_id: userId || null,
      type,
      name,
      ts: new Date().toISOString(),
      metadata: metadata ? JSON.stringify(metadata) : null
    });
    writeStore(s);
  };
}

const channelUrl = process.env.CHANNEL_URL;
const signupUrl = process.env.SIGNUP_URL;
const siteFaUrl = process.env.SITE_FA_URL;
const rulesUrl = process.env.RULES_URL;
const supportUrl = process.env.SUPPORT_URL;
const imageUrl = process.env.IMAGE_URL;
const redirectBase = process.env.REDIRECT_BASE_URL || `http://localhost:${PORT}`;
const targets = { channel: channelUrl, signup: signupUrl, "site-fa": siteFaUrl, rules: rulesUrl, support: supportUrl };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function makeUrl(name, uid) {
  return `${redirectBase}/r/${name}?uid=${uid}`;
}

bot.start(async (ctx) => {
  await upsertUser(ctx.from);
  await logEvent(ctx.from.id, 'start', 'start');
  if (imageUrl) {
    await ctx.replyWithPhoto(imageUrl);
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
        inline_keyboard: [[{ text: "کانال رسمی", url: makeUrl("channel", ctx.from.id) }]],
      },
    },
  );
  await delay(700);
  await ctx.reply(`🔗 لینک ثبت‌نام:\n👉 https://checkout.capitalchain.co`, {
    reply_markup: { inline_keyboard: [[{ text: "ثبت‌نام", url: makeUrl("signup", ctx.from.id) }]] },
  });
  await delay(700);
  await ctx.reply(`📌 ورود به سایت فارسی کپیتال چین\n🔗 http://CapitalChain.co/farsi`, {
    reply_markup: { inline_keyboard: [[{ text: "سایت فارسی", url: makeUrl("site-fa", ctx.from.id) }]] },
  });
  await delay(700);
  await ctx.reply(
    `📌 قوانین و شرایط
مطالعه قوانین، پلن‌ها و شرایط برداشت
🔗 قوانین و مقررات:
👉 https://capitalchain.co/terms-of-use`,
    { reply_markup: { inline_keyboard: [[{ text: "قوانین و شرایط", url: makeUrl("rules", ctx.from.id) }]] } },
  );
  await delay(700);
  await ctx.reply(
    `📌 پشتیبانی فارسی
در صورت داشتن هرگونه سوال یا مشکل، با پشتیبانی در ارتباط باشید
🔗 پشتیبانی تلگرام:
👉 https://t.me/CapitalChainfarsi_support`,
    { reply_markup: { inline_keyboard: [[{ text: "پشتیبانی تلگرام", url: makeUrl("support", ctx.from.id) }]] } },
  );
});

app.get('/r/:name', async (req, res) => {
  const name = req.params.name;
  const uid = req.query.uid;
  const target = targets[name];
  if (!target) return res.status(404).send('Not found');
  if (uid) {
    await logEvent(Number(uid), 'click', name, { ua: req.headers['user-agent'] });
  }
  res.redirect(target);
});
(async () => {
  try {
    await initDb();
  } catch {}
  app.listen(PORT);
  bot.launch();
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
})();
