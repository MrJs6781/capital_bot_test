const express = require('express')
function createApp(storage, config) {
  const app = express()
  app.get('/r/:name', async (req, res) => {
    const name = req.params.name
    const uid = req.query.uid
    const target = config.targets[name]
    if (!target) return res.status(404).send('Not found')
    if (uid) {
      try { await storage.logEvent(Number(uid), 'click', name, { ua: req.headers['user-agent'] }) } catch {}
    }
    res.redirect(target)
  })
  return app
}
module.exports = { createApp }
