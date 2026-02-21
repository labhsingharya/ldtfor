import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import express from "express";

/* ================= SERVER ================= */

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => res.send("Userbot Running"));
app.listen(PORT, () =>
  console.log("🌐 Dummy server running on port", PORT)
);

/* ================= TELEGRAM CONFIG ================= */

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.SESSION_STRING);

/* ================= CHAT CONFIG ================= */

const TARGET_CHAT = "-1001717159768";

const SOURCE_CHATS = [
  "-1002104838072",
  "-1002392800902",
  "-1001495002618",
  "-1001486606418",
  "-1002466523687",
  "-1001175095956",
  "-1001193143102",
  "-1001450712440",
  "-1002139950066",
  "-1003222915238",
  "-1001921864192",
  "-1001749853075",
  "-1001600775522",
  "-1001837130426",
  "-1001707571730",
  "-1002158788262",
  "-1001315464303",
  "-1001420725892"
];

/* ================= START ================= */

(async () => {

  const client = new TelegramClient(
    stringSession,
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  /* ===== CONNECT MODE ===== */

  await client.connect();
  await client.getMe();   // force update sync

  console.log("✅ Telegram connected");
  console.log("🔁 Listening for messages...");

  /* ================= HANDLER ================= */

  client.addEventHandler(async (event) => {

    try {

      const msg = event.message;
      if (!msg) return;

      const peer = await event.getChat();
      if (!peer) return;

      const chatId = peer.id.toString();

      console.log("📩 Incoming from:", chatId);

      /* ===== HARD BLOCK TARGET ===== */
      if (chatId === TARGET_CHAT) {
        console.log("⛔ Target ignored");
        return;
      }

      /* ===== ONLY ALLOW SOURCES ===== */
      if (!SOURCE_CHATS.includes(chatId)) {
        console.log("⛔ Not in source list");
        return;
      }

      /* ===== IGNORE SELF ===== */
      if (msg.out) {
        console.log("⛔ Self message ignored");
        return;
      }

      /* ===== COPY MODE ===== */

      if (msg.media) {

        await client.sendFile(TARGET_CHAT, {
          file: msg.media,
          caption: msg.message || undefined
        });

        console.log("✅ Media copied");

      } else {

        await client.sendMessage(TARGET_CHAT, {
          message: msg.message || ""
        });

        console.log("✅ Text copied");
      }

    } catch (err) {
      console.error("❌ Error:", err.message);
    }

  }, new NewMessage({}));

})();
