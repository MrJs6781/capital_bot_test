function createScheduler(storage, bot, config) {
  async function runDue() {
    const nowIso = new Date().toISOString()
    const due = await storage.listDueBroadcasts(nowIso)
    for (const b of due) {
      const filters = typeof b.filters === 'string' ? JSON.parse(b.filters || '{}') : (b.filters || {})
      const ids = await storage.getRecipients(filters)
      for (const id of ids) {
        try { await bot.telegram.sendMessage(id, b.text) } catch {}
        await new Promise(r => setTimeout(r, 30))
      }
      await storage.markBroadcastSent(b.id)
    }
  }
  const t = setInterval(runDue, config.broadcastTickMs)
  return { stop() { clearInterval(t) } }
}
module.exports = { createScheduler }
