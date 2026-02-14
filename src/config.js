const port = process.env.PORT || 3000
const channelUrl = process.env.CHANNEL_URL
const signupUrl = process.env.SIGNUP_URL
const siteFaUrl = process.env.SITE_FA_URL
const rulesUrl = process.env.RULES_URL
const supportUrl = process.env.SUPPORT_URL
const imageUrl = process.env.IMAGE_URL
const redirectBase = process.env.REDIRECT_BASE_URL || `http://localhost:${port}`
const dbUrl = process.env.DATABASE_URL
const dbSsl = process.env.DATABASE_SSL === 'true'
const targets = { channel: channelUrl, signup: signupUrl, 'site-fa': siteFaUrl, rules: rulesUrl, support: supportUrl }
module.exports = { port, channelUrl, signupUrl, siteFaUrl, rulesUrl, supportUrl, imageUrl, redirectBase, dbUrl, dbSsl, targets }
