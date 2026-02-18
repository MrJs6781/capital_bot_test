const { Telegraf } = require("telegraf")
const https = require("https")
const { registerSections } = require("./bot/sections")
const { registerReport } = require("./bot/report")
const { registerAdmin } = require("./bot/admin")
function createBot(storage, config) {
  const agent = new https.Agent({ family: 4 })
  const bot = new Telegraf(process.env.BOT_TOKEN, { telegram: { agent } })
  const sessions = new Map()
  const reportPrefs = new Map()
  async function isSuper(ctx) {
    if (config.superAdminId && ctx.from && ctx.from.id === config.superAdminId) return true
    const role = await storage.getAdminRole(ctx.from.id)
    return role === "superadmin"
  }
  async function isAdmin(ctx) {
    if (await isSuper(ctx)) return true
    const role = await storage.getAdminRole(ctx.from.id)
    return !!role
  }
  async function can(ctx, perm) {
    if (await isSuper(ctx)) return true
    const role = await storage.getAdminRole(ctx.from.id)
    if (!role) return false
    const perms = {
      broadcast: new Set(["admin", "broadcaster"]),
      schedule: new Set(["admin", "broadcaster"]),
      report: new Set(["admin", "report"]),
    }
    const p = perms[perm]
    if (!p) return false
    return p.has(role)
  }
  const helpers = { isSuper, isAdmin, can }
  registerSections(bot, storage, config, sessions, helpers)
  registerReport(bot, storage, config, reportPrefs, helpers)
  registerAdmin(bot, storage, config, sessions, helpers)
  bot.command("help", async (ctx) => {
    const t = `دستورات:\n/start شروع\n/stats گزارش کامل\n/help راهنما`
    await ctx.reply(t)
  })
  return bot
}
module.exports = { createBot }
