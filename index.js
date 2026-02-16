import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import axios from "axios";
import express from "express";

/* ================= DUMMY SERVER ================= */
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Userbot Running");
});

app.listen(PORT, () => {
  console.log("🌐 Dummy server running on port", PORT);
});

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
  const cleaned = cleanForTrigger(text);
  return KEYWORDS.some(k => cleaned.includes(k));
}

function normalizeText(text = "") {
  return cleanForTrigger(text)
    .replace(/https?:\/\/\S+/g, "")
    .trim();
}

function cleanCache() {
  const now = Date.now();

  for (const [k, v] of urlCache)
    if (now - v > CACHE_TIME) urlCache.delete(k);

  for (const [k, v] of textCache)
    if (now - v > CACHE_TIME) textCache.delete(k);

  if (processedMessages.size > 3000)
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
  console.log("✅ Telegram user connected");

 client.addEventHandler(async (event) => {

  try {

    const msg = event.message;
    if (!msg) return;

    // 🚫 Ignore edits
    if (event.edit) return;

    // 🚫 Ignore self messages
    if (msg.out) return;

    const chatId = Number(event.chatId);
    if (!chatId) return;

    console.log("📩 Incoming from:", chatId);

    // 🚫 Strictly ignore target
    if (chatId === TARGET_CHAT) return;

    // 🚫 Ignore except list
    if (EXCEPT_CHATS.includes(chatId)) return;

    const rawText = msg.message || msg.text || "";

    // 🚫 Ignore empty messages
    if (!rawText && !msg.media) return;

    // 🚫 Block converter text
    if (rawText.includes("EarnKaro Converter")) return;

    // 🚫 Block own channel link
    if (rawText.includes("Lootdealtricky")) return;

    // 🔒 Duplicate fingerprint guard
    const fingerprint = `${chatId}_${msg.id}`;
    if (processedMessages.has(fingerprint)) return;
    processedMessages.add(fingerprint);

    if (processedMessages.size > 5000)
      processedMessages.clear();

    // 🔥 Trigger word detection (emoji/font safe)
    if (!hasKeyword(rawText)) return;

    cleanCache();

    /* ---------- URL DUPLICATE BLOCK ---------- */
    const urls = rawText.match(/https?:\/\/\S+/gi) || [];

    for (const u of urls) {
      const finalUrl = await unshortUrl(u);
      if (urlCache.has(finalUrl)) return;
      urlCache.set(finalUrl, Date.now());
    }

    /* ---------- TEXT DUPLICATE BLOCK ---------- */
    const normalizedTopic = normalizeText(rawText);
    if (textCache.has(normalizedTopic)) return;
    textCache.set(normalizedTopic, Date.now());

    let finalText = replaceTelegramLinks(rawText);

    if (finalText.length > 1024)
      finalText = finalText.substring(0, 1020) + "...";

    /* ================= SEND ================= */

    if (msg.media) {

      const forwarded = await client.forwardMessages(
        TARGET_CHAT,
        { messages: [msg.id], fromPeer: chatId }
      );

      if (forwarded?.length && finalText !== rawText) {
        await client.editMessage(TARGET_CHAT, {
          message: forwarded[0].id,
          text: finalText
        });
      }

    } else {

      await client.sendMessage(TARGET_CHAT, {
        message: finalText
      });

    }

    console.log("✅ Forwarded");

  } catch (err) {
    console.error("❌ Error:", err.message);
  }

}, new NewMessage({}));
