const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { handleIncomingMessage } = require("./handlers/message");
const scheduler = require("./services/scheduler");
const { initTables } = require("./db/database");
const settings = require("./config/settings");
let hasLoggedAuthenticated = false;
let hasStartedScheduler = false;
let isReconnecting = false;
const recentOutgoingMessages = new Map();

function normalizeMessageBody(body = "") {
  return body.trim().replace(/\s+/g, " ").toLowerCase();
}

function rememberOutgoingMessage(body) {
  const normalized = normalizeMessageBody(body);
  if (!normalized) return;

  recentOutgoingMessages.set(normalized, Date.now());

  setTimeout(() => {
    const savedAt = recentOutgoingMessages.get(normalized);
    if (savedAt && Date.now() - savedAt >= 15000) {
      recentOutgoingMessages.delete(normalized);
    }
  }, 16000);
}

function shouldIgnoreOutgoingMessage(body) {
  const normalized = normalizeMessageBody(body);
  if (!normalized) return false;

  const savedAt = recentOutgoingMessages.get(normalized);
  if (!savedAt) return false;

  if (Date.now() - savedAt > 15000) {
    recentOutgoingMessages.delete(normalized);
    return false;
  }

  return true;
}

console.log(`
╔══════════════════════════════════════════════╗
║     WhatsApp AI Marketing Agent              ║
║     Business: ${settings.business.name.padEnd(30)}║
║     Status: Starting...                      ║
╚══════════════════════════════════════════════╝
`);

// Initialize database
initTables();

// Create WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--disable-gpu",
    ],
  },
});

// QR Code - scan this with your WhatsApp
client.on("qr", (qr) => {
  console.log("\n[AUTH] Scan this QR code with your WhatsApp:\n");
  qrcode.generate(qr, { small: true });
  console.log("\nOpen WhatsApp > Settings > Linked Devices > Link a Device\n");
});

// Successfully connected
client.on("ready", () => {
  isReconnecting = false;
  console.log(`
╔══════════════════════════════════════════════╗
║     ✅ WhatsApp AI Agent is LIVE!            ║
║                                              ║
║     Listening for messages...                ║
║     Owner commands: report, bookings, help   ║
║                                              ║
║     Press Ctrl+C to stop                     ║
╚══════════════════════════════════════════════╝
`);

  // Start scheduled tasks (reminders, follow-ups, daily report)
  if (!hasStartedScheduler) {
    scheduler.init(client);
    hasStartedScheduler = true;
  }
});

// Handle incoming messages
client.on("message", async (msg) => {
  await handleIncomingMessage(client, msg, {
    registerOutgoingMessage: rememberOutgoingMessage,
    shouldIgnoreOutgoingMessage,
  });
});

// Allow one-number testing from self-chat and ignore bot echoes
client.on("message_create", async (msg) => {
  if (!msg.fromMe) return;
  if (shouldIgnoreOutgoingMessage(msg.body || "")) return;
  await handleIncomingMessage(client, msg, {
    allowFromMe: true,
    registerOutgoingMessage: rememberOutgoingMessage,
    shouldIgnoreOutgoingMessage,
  });
});

// Authentication success
client.on("authenticated", () => {
  if (!hasLoggedAuthenticated) {
    console.log("[AUTH] Authenticated successfully!");
    hasLoggedAuthenticated = true;
  }
});

// Authentication failure
client.on("auth_failure", (msg) => {
  console.error("[AUTH] Authentication failed:", msg);
  console.log("[AUTH] Delete .wwebjs_auth folder and try again.");
});

// Disconnected
client.on("disconnected", (reason) => {
  console.log("[DISCONNECTED]", reason);
  hasLoggedAuthenticated = false;
  if (!isReconnecting) {
    isReconnecting = true;
    console.log("[INFO] Attempting to reconnect...");
    client.initialize();
  }
});

// Handle errors gracefully
client.on("error", (error) => {
  console.error("[ERROR]", error.message);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[SHUTDOWN] Shutting down gracefully...");
  const { close } = require("./db/database");
  close();
  client.destroy();
  process.exit(0);
});

process.on("unhandledRejection", (error) => {
  console.error("[UNHANDLED]", error.message);
});

// Start the client
console.log("[INIT] Connecting to WhatsApp...");
client.initialize();
