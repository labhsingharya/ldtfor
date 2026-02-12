const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const { chromium } = require("playwright");

/* ===== ENV ===== */
const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.SESSION_STRING);

const sourceChat = process.env.SOURCE_CHAT || "-1003508245377";
const destinationChat = process.env.DESTINATION_CHAT || "-1001208173141";

/* =====================================================
   🔤 REMOVE FANCY FONT TEXT
===================================================== */
function normalizeText(input) {
  if (!input) return input;

  return input
    .replace(/[\u{1D400}-\u{1D7FF}]/gu, "")
    .replace(/[\u{2100}-\u{214F}]/gu, "")
    .replace(/[\u{2500}-\u{2BFF}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* =====================================================
   🚦 MESSAGE SEND QUEUE (ANTI FLOOD SYSTEM)
===================================================== */
let sending = false;
const queue = [];

async function processQueue() {
  if (sending || queue.length === 0) return;

  sending = true;
  const job = queue.shift();

  try {
    await job();
  } catch (e) {
    if (e.message && e.message.includes("FLOOD_WAIT")) {
      const seconds = e.seconds || 10;
      console.log(`🚨 FLOOD_WAIT ${seconds}s`);
      await new Promise(r => setTimeout(r, seconds * 1000));
    } else {
      console.error("❌ Send Error:", e.message);
    }
  }

  await new Promise(r => setTimeout(r, 1200)); // 1.2 sec gap
  sending = false;
  processQueue();
}

/* =====================================================
   🌐 PLAYWRIGHT LAZY BROWSER
===================================================== */
let browser;

async function getBrowser() {
  if (browser) return browser;

  console.log("🧠 Launching Chromium...");
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });

  console.log("✅ Chromium Ready");
  return browser;
}

/* =====================================================
   🔁 STRICT faym → ONLY meesho
===================================================== */
async function unshortFaymStrict(url, depth = 0) {
  if (depth > 5) return null;

  let page;
  try {
    const br = await getBrowser();
    page = await br.newPage();

    let finalUrl = null;

    page.on("request", req => {
      const reqUrl = req.url();
      if (reqUrl.startsWith("http") && !reqUrl.includes("faym.co")) {
        finalUrl = reqUrl;
      }
    });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    await page.waitForTimeout(6000);
    await page.close();

    if (!finalUrl) return null;

    if (finalUrl.includes("meesho.com")) return finalUrl;

    if (finalUrl.includes("faym.co")) {
      return await unshortFaymStrict(finalUrl, depth + 1);
    }

    return null;

  } catch (err) {
    if (page) await page.close();
    console.error("❌ Unshort Error:", err.message);
    return null;
  }
}

/* =====================================================
   🚀 START BOT
===================================================== */
(async () => {
  console.log("🚀 Bot Starting...");

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5
  });

  await client.connect();
  console.log("✅ Bot Connected | Watching:", sourceChat);

  client.addEventHandler(async (event) => {
    const message = event.message;
    if (!message || !message.peerId) return;

    try {
      const senderChatId = (await client.getPeerId(message.peerId)).toString();
      if (senderChatId !== sourceChat) return;

      let text = message.message || message.text || "";
      text = normalizeText(text);

      /* ===== PROCESS faym LINKS ===== */
      const urls = text.match(/https?:\/\/[^\s]+/g) || [];
      let reject = false;

      for (const url of urls) {
        if (url.includes("faym.co")) {
          const finalUrl = await unshortFaymStrict(url);

          if (!finalUrl) {
            reject = true;
            break;
          }

          text = text.split(url).join(finalUrl);
        }
      }

      if (reject) {
        console.log("⛔ Non-Meesho link found → skipped");
        return;
      }

      /* =====================================================
         📸 MEDIA MESSAGE
      ===================================================== */
      if (message.media) {

        if (text && text.length > 1024) {
          text = text.substring(0, 1020) + "...";
        }

        queue.push(async () => {
          await client.sendFile(destinationChat, {
            file: message, // FIXED object issue
            caption: text || undefined
          });
          console.log("📸 Media forwarded");
        });

        processQueue();
        return;
      }

      /* =====================================================
         📝 TEXT MESSAGE
      ===================================================== */
      if (text.trim()) {

        queue.push(async () => {
          await client.invoke(
            new Api.messages.SendMessage({
              peer: destinationChat,
              message: text,
              noWebpage: false
            })
          );
          console.log("📝 Text forwarded");
        });

        processQueue();
      }

    } catch (err) {
      console.error("❌ Handler Error:", err.message);
    }

  }, new NewMessage({}));

})();

/* =====================================================
   🛑 GRACEFUL SHUTDOWN
===================================================== */
async function closeBrowser() {
  if (browser) {
    console.log("🛑 Closing Browser...");
    await browser.close();
    browser = null;
  }
}

process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});
