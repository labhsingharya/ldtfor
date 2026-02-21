import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import express from "express";

/* ================= SERVER ================= */

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => res.send("Forwarder Running"));
app.listen(PORT, () => console.log("🌐 Server running"));

/* ================= TELEGRAM CONFIG ================= */

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.SESSION_STRING);

/* ================= CHAT CONFIG ================= */

// 👇 Test के लिए सिर्फ 1 source डालो
const SOURCE_CHAT = "-1002625638849";

// 👇 Target group
const TARGET_CHAT = "-1001717159768";

/* ================= START ================= */

(async () => {

  const client = new TelegramClient(
    stringSession,
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  await client.connect();

  console.log("✅ Telegram Connected");
  console.log("🔁 Waiting for messages...");

  client.addEventHandler(async (event) => {

    try {

      const msg = event.message;
      if (!msg) return;

      const peer = await event.getChat();
      if (!peer) return;

      const chatId = peer.id.toString();

      console.log("📩 Message from:", chatId);

      // ❌ Ignore everything except one source
      if (chatId !== SOURCE_CHAT) return;

      // ❌ Ignore self messages
      if (msg.out) return;

      console.log("➡ Forwarding message...");

      await client.forwardMessages(
        TARGET_CHAT,
        {
          messages: [msg.id],
          fromPeer: peer
        }
      );

      console.log("✅ Forwarded successfully");

    } catch (err) {
      console.error("❌ Error:", err.message);
    }

  }, new NewMessage({}));

})();
