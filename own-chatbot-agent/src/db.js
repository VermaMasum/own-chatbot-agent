import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(rootDir, "data");
const dbPath = resolve(dataDir, "app-db.json");

let writeQueue = Promise.resolve();

export async function listBots() {
  const db = await readDb();
  return Array.isArray(db.bots) ? db.bots : [];
}

export async function getBot(botId) {
  if (!botId) return null;
  const db = await readDb();
  return (Array.isArray(db.bots) ? db.bots : []).find((bot) => bot.id === botId) || null;
}

export async function saveBot(profile, botId) {
  if (!profile || typeof profile !== "object") {
    throw new Error("A chatbot profile is required");
  }

  return updateDb(async (db) => {
    const now = new Date().toISOString();
    const id = typeof botId === "string" && botId.trim() ? botId.trim() : randomUUID();
    const bots = Array.isArray(db.bots) ? db.bots : [];
    const index = bots.findIndex((bot) => bot.id === id);
    const record = {
      id,
      createdAt: index >= 0 ? bots[index].createdAt : now,
      updatedAt: now,
      status: "published",
      profile: sanitizeBotProfile(profile, id),
      source: "local-db"
    };

    if (index >= 0) {
      bots[index] = record;
    } else {
      bots.unshift(record);
    }

    db.bots = bots;
    return { db, result: record };
  });
}

export async function saveCrawlRun(payload) {
  return updateDb(async (db) => {
    const runs = Array.isArray(db.crawlRuns) ? db.crawlRuns : [];
    const now = new Date().toISOString();
    const record = {
      id: randomUUID(),
      createdAt: now,
      ...payload,
      pages: Array.isArray(payload?.pages) ? payload.pages : [],
      sections: Array.isArray(payload?.sections) ? payload.sections : [],
      chunks: Array.isArray(payload?.chunks) ? payload.chunks : [],
      topics: Array.isArray(payload?.topics) ? payload.topics : []
    };
    runs.unshift(record);
    db.crawlRuns = runs.slice(0, 100);
    return { db, result: record };
  });
}

export async function saveChatExchange(payload) {
  return updateDb(async (db) => {
    const messages = Array.isArray(db.messages) ? db.messages : [];
    const now = new Date().toISOString();
    const record = {
      id: randomUUID(),
      createdAt: now,
      botId: String(payload?.botId || "").trim(),
      sessionId: String(payload?.sessionId || "").trim(),
      userMessage: String(payload?.userMessage || "").trim(),
      assistantReply: String(payload?.assistantReply || "").trim(),
      provider: String(payload?.provider || "").trim(),
      metadata: isPlainObject(payload?.metadata) ? payload.metadata : {}
    };
    messages.unshift(record);
    db.messages = messages.slice(0, 500);
    return { db, result: record };
  });
}

async function readDb() {
  try {
    const raw = await readFile(dbPath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeDb(parsed);
  } catch {
    return normalizeDb();
  }
}

async function updateDb(mutator) {
  return enqueueWrite(async () => {
    const current = await readDb();
    const outcome = await mutator(current);
    const nextDb = normalizeDb(outcome?.db || current);
    nextDb.meta.updatedAt = new Date().toISOString();
    await persistDb(nextDb);
    return outcome?.result ?? nextDb;
  });
}

async function enqueueWrite(task) {
  const run = writeQueue.then(task);
  writeQueue = run.catch(() => {});
  return run;
}

async function persistDb(db) {
  await mkdir(dirname(dbPath), { recursive: true });
  const tempPath = `${dbPath}.tmp`;
  await writeFile(tempPath, JSON.stringify(db, null, 2), "utf8");
  await rename(tempPath, dbPath);
}

function normalizeDb(input = {}) {
  const db = isPlainObject(input) ? input : {};
  return {
    meta: {
      schemaVersion: 1,
      createdAt: db.meta?.createdAt || new Date().toISOString(),
      updatedAt: db.meta?.updatedAt || new Date().toISOString()
    },
    users: Array.isArray(db.users) ? db.users : [],
    bots: Array.isArray(db.bots) ? db.bots : [],
    pages: Array.isArray(db.pages) ? db.pages : [],
    messages: Array.isArray(db.messages) ? db.messages : [],
    leads: Array.isArray(db.leads) ? db.leads : [],
    crawlRuns: Array.isArray(db.crawlRuns) ? db.crawlRuns : [],
    lastResult: db.lastResult
  };
}

function sanitizeBotProfile(profile, botId) {
  return {
    ...profile,
    botId,
    publishUrl: profile.publishUrl || "",
    embedUrl: profile.embedUrl || ""
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
