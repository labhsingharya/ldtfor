import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import express from "express";

/* SERVER */
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => res.send("Userbot Running"));
app.listen(PORT, () => console.log("🌐 Server running"));

/* TELEGRAM */
const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.SESSION_STRING);

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

(async () => {

  const client = new TelegramClient(
    stringSession,
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  await client.connect();
  console.log("✅ Connected");

  /* FORCE UPDATE STATE SYNC */
  await client.invoke({
    _: "updates.getState"
  });

  console.log("🔁 Update state synced");

  client.addEventHandler(async (event) => {

    const msg = event.message;
    if (!msg) return;

    const peer = await event.getChat();
    if (!peer) return;

    const chatId = peer.id.toString();

    console.log("📩 From:", chatId);

    if (!SOURCE_CHATS.includes(chatId)) return;
    if (chatId === TARGET_CHAT) return;
    if (msg.out) return;

    if (msg.media) {
      await client.sendFile(TARGET_CHAT, {
        file: msg.media,
        caption: msg.message || undefined
      });
    } else {
      await client.sendMessage(TARGET_CHAT, {
        message: msg.message || ""
      });
    }

    console.log("✅ Copied");

  }, new NewMessage({}));

})();
