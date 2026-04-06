const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "../../data/agent.db");

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

function initTables() {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT '',
      first_contact DATETIME DEFAULT (datetime('now')),
      last_contact DATETIME DEFAULT (datetime('now')),
      total_messages INTEGER DEFAULT 0,
      tags TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      opted_out BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer', 'agent')),
      message TEXT NOT NULL,
      intent TEXT DEFAULT 'general',
      timestamp DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contacts(id)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      service TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'completed', 'cancelled', 'no_show')),
      reminder_sent BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contacts(id)
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      message_template TEXT NOT NULL,
      target_tags TEXT DEFAULT '[]',
      sent_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sending', 'completed'))
    );

    CREATE TABLE IF NOT EXISTS follow_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      message TEXT DEFAULT '',
      scheduled_at DATETIME NOT NULL,
      sent BOOLEAN DEFAULT 0,
      response TEXT DEFAULT '',
      attempt INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contacts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
    CREATE INDEX IF NOT EXISTS idx_follow_ups_scheduled ON follow_ups(scheduled_at, sent);
  `);

  console.log("[DB] Database initialized successfully");
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, initTables, close };
