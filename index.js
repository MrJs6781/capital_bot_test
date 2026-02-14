require("dotenv").config();
const { createApp } = require("./src/server");
const { createBot } = require("./src/bot");
const storage = require("./src/storage");
const config = require("./src/config");
const app = createApp(storage, config);
const bot = createBot(storage, config);
(async () => {
  try {
    await storage.initDb();
  } catch {}
  app.listen(config.port);
  bot.launch();
  await bot.telegram.setMyCommands([
    { command: "start", description: "شروع" },
    { command: "stats", description: "گزارش" },
    { command: "help", description: "راهنما" },
  ]);
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
})();
