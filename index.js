import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import express from "express";

/* ================= SERVER ================= */
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("Userbot Running"));
app.listen(PORT, () => console.log("🌐 Server running on", PORT));

/* ================= ENV ================= */
const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.SESSION_STRING);

/* ================= CONFIG ================= */
const TARGET_CHAT = -1001717159768;
const KEYWORDS = ["loot", "fast", "grab", "steal", "buy max", "lowest"];

/* ================= MEMORY ================= */
const processed = new Set();
const lastChannelMessage = new Map();
let pollingInitialized = false;

/* ================= HELPERS ================= */

function normalize(text = "") {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasKeyword(text = "") {
  const cleaned = normalize(text);
  return KEYWORDS.some(k => cleaned.includes(k));
}

function preview(text = "") {
  return text.slice(0, 80).replace(/\n/g, " ");
}

/* ================= PROCESS FUNCTION ================= */

async function processMessage(client, msg, chatName) {

  const rawText = msg.message || "";
  if (!rawText) return;

  const unique = `${msg.chatId}_${msg.id}`;
  if (processed.has(unique)) return;
  processed.add(unique);

  console.log("\n==============================");
  console.log(`📩 Channel: ${chatName}`);
  console.log(`📝 Preview: ${preview(rawText)}`);

  if (!hasKeyword(rawText)) {
    console.log("❌ Not Triggered");
    return;
  }

  console.log("🔥 Trigger Matched");

  await client.invoke(
    new Api.messages.CopyMessages({
      fromPeer: msg.peerId,
      id: [msg.id],
      toPeer: TARGET_CHAT,
      randomId: [BigInt(Date.now())]
    })
  );

  console.log("✅ Copied to Target");
  console.log("==============================\n");
}

/* ================= START ================= */

(async () => {

  const client = new TelegramClient(
    stringSession,
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  await client.start();
  console.log("✅ Telegram Connected");

  await client.getDialogs({ limit: 500 });
  console.log("📡 Dialogs Synced");

  /* ================= REALTIME ================= */

  client.addEventHandler(async (event) => {
    try {

      const msg = event.message;
      if (!msg) return;
      if (msg.out) return;

      const chatId = Number(event.chatId);
      if (!chatId) return;
      if (chatId === TARGET_CHAT) return;

      const entity = await msg.getChat();
      const chatName = entity?.title || "Unknown";

      await processMessage(client, msg, chatName);

    } catch (err) {
      console.log("Realtime Error:", err.message);
    }
  }, new NewMessage({ incoming: true }));


  /* ================= POLLING (ONLY NEW POSTS) ================= */

  setInterval(async () => {

    try {

      console.log("🔄 Polling...");

      const dialogs = await client.getDialogs({ limit: 300 });

      for (const dialog of dialogs) {

        if (!dialog.isChannel) continue;

        const entity = dialog.entity;
        const channelId = entity.id;
        if (channelId === TARGET_CHAT) continue;

        const messages = await client.getMessages(entity, { limit: 1 });
        if (!messages.length) continue;

        const latest = messages[0];

        // First cycle: only store IDs, don't process
        if (!pollingInitialized) {
          lastChannelMessage.set(channelId, latest.id);
          continue;
        }

        if (lastChannelMessage.get(channelId) === latest.id)
          continue;

        lastChannelMessage.set(channelId, latest.id);

        console.log("📢 New Post Detected:", entity.title);

        await processMessage(client, latest, entity.title);

      }

      pollingInitialized = true;

    } catch (err) {
      console.log("Polling Error:", err.message);
    }

  }, 30000);

})();
