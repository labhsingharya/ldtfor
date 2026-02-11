import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import axios from "axios";
import express from "express";

/* ================= DUMMY SERVER (Render Fix) ================= */
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

const KEYWORDS = ["loot", "fast", "grab"];
const REPLACE_LINK = "https://t.me/Lootdealtricky";
const CACHE_TIME = 30 * 60 * 1000;

/* ================= CACHE ================= */
const urlCache = new Map();
const textCache = new Map();

/* ================= HELPERS ================= */

function normalizeUnicodeFont(text = "") {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function hasKeyword(text = "") {
  const t = text.toLowerCase();
  return KEYWORDS.some(k => t.includes(k));
}

function normalizeText(text = "") {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCache() {
  const now = Date.now();
  for (const [k, v] of urlCache)
    if (now - v > CACHE_TIME) urlCache.delete(k);
  for (const [k, v] of textCache)
    if (now - v > CACHE_TIME) textCache.delete(k);
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
      if (!msg || !msg.peerId) return;

      const entity = await msg.getChat();
      const chatId = entity?.id;

      if (!chatId) return;
      if (EXCEPT_CHATS.includes(Number(chatId))) return;

      const rawText = msg.message || msg.text || "";
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
      const normalizedTopic = normalizeText(
        normalizeUnicodeFont(rawText)
      );

      if (textCache.has(normalizedTopic)) return;
      textCache.set(normalizedTopic, Date.now());

      const finalText = replaceTelegramLinks(rawText);

      /* ================= MEDIA FIX ================= */
      if (msg.media) {

        // Forward original message
        const forwarded = await client.forwardMessages(
          TARGET_CHAT,
          {
            messages: [msg.id],
            fromPeer: entity
          }
        );

        // Edit caption after forward (for link replace)
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

      console.log("✅ Forwarded:", normalizedTopic.slice(0, 60));

    } catch (err) {
      console.error("❌ Error:", err.message);
    }
  }, new NewMessage({}));

})();
