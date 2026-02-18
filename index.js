import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import axios from "axios";
import express from "express";

/* ================= SERVER ================= */
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Userbot Running"));
app.listen(PORT, () => console.log("🌐 Dummy server running on port", PORT));

/* ================= ENV ================= */
const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.SESSION_STRING);

/* ================= CONFIG ================= */

// 🎯 TARGET GROUP
const TARGET_CHAT = "-1001717159768"; // String में रखना बेहतर है comparison के लिए

// 🎯 SOURCE GROUPS / CHANNELS (FIXED LIST)
const SOURCE_CHATS = [
  "-1002104838072", "-1002392800902", "-1001495002618", "-1001486606418",
  "-1002466523687", "-1001175095956", "-1001193143102", "-1001450712440",
  "-1002139950066", "-1003222915238", "-1001921864192", "-1001749853075",
  "-1001600775522", "-1001837130426", "-1001707571730", "-1002158788262",
  "-1001315464303", "-1001420725892"
];

const KEYWORDS = ["loot", "fast", "grab", "steal", "buy max", "lowest", "deal", "off"];
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
  const cleaned = cleanForTrigger(text);
  return KEYWORDS.some(k => cleaned.includes(k));
}

function normalizeText(text = "") {
  return cleanForTrigger(text).replace(/https?:\/\/\S+/g, "").trim();
}

function cleanCache() {
  const now = Date.now();
  for (const [k, v] of urlCache) if (now - v > CACHE_TIME) urlCache.delete(k);
  for (const [k, v] of textCache) if (now - v > CACHE_TIME) textCache.delete(k);
  if (processedMessages.size > 5000) processedMessages.clear();
}

async function unshortUrl(url) {
  try {
    const res = await axios.get(url, { timeout: 5000, maxRedirects: 5 });
    return res.request?.res?.responseUrl || url;
  } catch { return url; }
}

function replaceTelegramLinks(text = "") {
  return text
    .replace(/https?:\/\/t\.me\/[^\s]+/gi, REPLACE_LINK)
    .replace(/@[\w\d_]+/gi, REPLACE_LINK);
}

/* ================= START ================= */
(async () => {
  const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
  await client.start();
  console.log("✅ Telegram user connected");

  client.addEventHandler(async (event) => {
    try {
      const msg = event.message;
      if (!msg) return;

      // 🛠️ FIX: Peer ID को String में कन्वर्ट करना ज़रूरी है ताकि comparison सही हो
      const chatId = event.message.peerId. thoseId || event.message.chatId?.toString();
      const senderId = event.message.senderId?.toString();

      // 🔒 HARD BLOCK TARGET & SELF
      if (chatId === TARGET_CHAT || msg.out) return;

      // 🔒 ONLY ALLOW SOURCE LIST (Matches strings)
      if (!SOURCE_CHATS.includes(chatId)) return;

      // 🔒 Duplicate guard
      const uniqueId = `${chatId}_${msg.id}`;
      if (processedMessages.has(uniqueId)) return;
      processedMessages.add(uniqueId);

      const rawText = msg.message || "";
      if (!rawText && !msg.media) return;

      // 🔥 Keyword Check
      if (rawText && !hasKeyword(rawText)) return;

      cleanCache();

      /* URL duplicate check */
      const urls = rawText.match(/https?:\/\/\S+/gi) || [];
      for (const u of urls) {
        const finalUrl = await unshortUrl(u);
        if (urlCache.has(finalUrl)) return;
        urlCache.set(finalUrl, Date.now());
      }

      const normalizedTopic = normalizeText(rawText);
      if (normalizedTopic && textCache.has(normalizedTopic)) return;
      if (normalizedTopic) textCache.set(normalizedTopic, Date.now());

      let finalText = replaceTelegramLinks(rawText);
      if (finalText.length > 1024) finalText = finalText.substring(0, 1020) + "...";

      /* ================= SENDING ================= */
      if (msg.media) {
        await client.sendFile(TARGET_CHAT, {
          file: msg.media,
          caption: finalText || undefined,
          parseMode: "html"
        });
      } else {
        await client.sendMessage(TARGET_CHAT, {
          message: finalText,
          parseMode: "html"
        });
      }

      console.log(`✅ Copied from: ${chatId}`);
    } catch (err) {
      console.error("❌ Error:", err.message);
    }
  }, new NewMessage({}));
})();
