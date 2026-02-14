function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
function makeUrl(redirectBase, name, uid) {
  return `${redirectBase}/r/${name}?uid=${uid}`
}
async function chunkAndReply(ctx, text) {
  const limit = 3500
  for (let i = 0; i < text.length; i += limit) {
    await ctx.reply(text.slice(i, i + limit))
  }
}
module.exports = { delay, makeUrl, chunkAndReply }
