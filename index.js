import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import axios from "axios";
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

const EXCEPT_CHATS = [
  -1001778288856,
  -1007738288255,
  -1007882828866,
  -10011864904417
];

const KEYWORDS = ["loot", "fast", "grab", "steal", "buy max", "lowest"];
const REPLACE_LINK = "https://t.me/Lootdealtricky";
const CACHE_TIME = 30 * 60 * 1000;

/* ================= CACHE ================= */
const urlCache = new Map();
const textCache = new Map();
const processedMessages = new Set();

/* ================= HELPERS ================= */

function normalizeUnicodeFont(text = "") {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function cleanForTrigger(text = "") {
  return normalizeUnicodeFont(text)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasKeyword(text = "") {
  return KEYWORDS.some(k => cleanForTrigger(text).includes(k));
}

function normalizeText(text = "") {
  return cleanForTrigger(text).replace(/https?:\/\/\S+/g, "").trim();
}

function cleanCache() {
  const now = Date.now();

  for (const [k, v] of urlCache)
    if (now - v > CACHE_TIME) urlCache.delete(k);

  for (const [k, v] of textCache)
    if (now - v > CACHE_TIME) textCache.delete(k);

  if (processedMessages.size > 5000)
    processedMessages.clear();
}

async function unshortUrl(url) {
  try {
    const res = await axios.get(url, {
      timeout: 5000,
      maxRedirects: 5
    });
    return res.request?.res?.responseUrl || url;
  } catch {
    return url;
  }
}

function replaceTelegramLinks(text = "") {
  const t = normalizeUnicodeFont(text);

  return t
    .replace(/https?:\/\/t\.me\/[^\s]+/gi, REPLACE_LINK)
    .replace(/@[\w\d_]+/gi, REPLACE_LINK)
    .replace(/loot\s*deal\s*tricky/gi, REPLACE_LINK);
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
  await client.getDialogs({ limit: 500 });
console.log("📡 Dialogs Synced");

  client.addEventHandler(async (event) => {

    try {

      const msg = event.message;
      if (!msg) return;

      if (event.edit) return;
      if (msg.out) return;

      const chatId = Number(event.chatId);
      if (!chatId) return;

      const entity = await msg.getChat();
      const chatName =
        entity?.title ||
        entity?.username ||
        entity?.firstName ||
        "Unknown";

      const rawText = msg.message || msg.text || "";
      const preview = rawText.slice(0, 80).replace(/\n/g, " ");

      console.log("\n==============================");
      console.log(`📩 Chat: ${chatName}`);
      console.log(`🆔 Chat ID: ${chatId}`);
      console.log(`📝 Preview: ${preview}`);

      // 🚫 Never process target
      if (chatId === TARGET_CHAT) {
        console.log("⛔ Skipped (Target)");
        return;
      }

      if (EXCEPT_CHATS.includes(chatId)) {
        console.log("⛔ Skipped (Except list)");
        return;
      }

      if (!rawText && !msg.media) {
        console.log("⛔ Skipped (Empty)");
        return;
      }

      if (rawText.includes("EarnKaro Converter")) {
        console.log("⛔ Skipped (Converter)");
        return;
      }

      if (rawText.includes("Lootdealtricky")) {
        console.log("⛔ Skipped (Own link)");
        return;
      }

      const fingerprint = `${chatId}_${msg.id}`;
      if (processedMessages.has(fingerprint)) {
        console.log("⛔ Skipped (Duplicate)");
        return;
      }
      processedMessages.add(fingerprint);

      if (!hasKeyword(rawText)) {
        console.log("❌ Not Triggered");
        return;
      }

      console.log("🔥 Trigger Matched");

      cleanCache();

      const urls = rawText.match(/https?:\/\/\S+/gi) || [];
      for (const u of urls) {
        const finalUrl = await unshortUrl(u);
        if (urlCache.has(finalUrl)) {
          console.log("⛔ Skipped (Duplicate URL)");
          return;
        }
        urlCache.set(finalUrl, Date.now());
      }

      const normalizedTopic = normalizeText(rawText);
      if (textCache.has(normalizedTopic)) {
        console.log("⛔ Skipped (Duplicate Text)");
        return;
      }
      textCache.set(normalizedTopic, Date.now());

      let finalText = replaceTelegramLinks(rawText);

      if (finalText.length > 1024)
        finalText = finalText.substring(0, 1020) + "...";

      /* ================= COPY ================= */

      await client.invoke({
        _: "messages.copyMessages",
        from_peer: msg.peerId,
        id: [msg.id],
        to_peer: TARGET_CHAT,
        random_id: [BigInt(Date.now())]
      });

      console.log("✅ Copied Successfully");
      console.log("==============================\n");

    } catch (err) {
      console.error("❌ Error:", err.message);
    }

  }, new NewMessage({
  incoming: true
}));
