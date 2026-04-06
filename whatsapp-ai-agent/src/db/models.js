const { getDb } = require("./database");

// ==================== CONTACTS ====================

function findOrCreateContact(phone, name = "") {
  const db = getDb();

  let contact = db.prepare("SELECT * FROM contacts WHERE phone = ?").get(phone);

  if (!contact) {
    const result = db.prepare(
      "INSERT INTO contacts (phone, name) VALUES (?, ?)"
    ).run(phone, name);
    contact = db.prepare("SELECT * FROM contacts WHERE id = ?").get(result.lastInsertRowid);
    console.log(`[DB] New contact created: ${phone}`);
  } else {
    db.prepare(
      "UPDATE contacts SET last_contact = datetime('now'), total_messages = total_messages + 1 WHERE id = ?"
    ).run(contact.id);
  }

  return contact;
}

function updateContactName(contactId, name) {
  const db = getDb();
  db.prepare("UPDATE contacts SET name = ? WHERE id = ?").run(name, contactId);
}

function addContactTag(contactId, tag) {
  const db = getDb();
  const contact = db.prepare("SELECT tags FROM contacts WHERE id = ?").get(contactId);
  const tags = JSON.parse(contact.tags || "[]");
  if (!tags.includes(tag)) {
    tags.push(tag);
    db.prepare("UPDATE contacts SET tags = ? WHERE id = ?").run(JSON.stringify(tags), contactId);
  }
}

function getAllContacts(tag = null) {
  const db = getDb();
  if (tag) {
    return db.prepare("SELECT * FROM contacts WHERE tags LIKE ? AND opted_out = 0").all(`%${tag}%`);
  }
  return db.prepare("SELECT * FROM contacts WHERE opted_out = 0").all();
}

function getContactByPhone(phone) {
  const db = getDb();
  return db.prepare("SELECT * FROM contacts WHERE phone = ?").get(phone);
}

// ==================== CONVERSATIONS ====================

function saveMessage(contactId, role, message, intent = "general") {
  const db = getDb();
  db.prepare(
    "INSERT INTO conversations (contact_id, role, message, intent) VALUES (?, ?, ?, ?)"
  ).run(contactId, role, message, intent);
}

function getRecentConversation(contactId, limit = 10) {
  const db = getDb();
  return db
    .prepare(
      "SELECT role, message, intent, timestamp FROM conversations WHERE contact_id = ? ORDER BY timestamp DESC LIMIT ?"
    )
    .all(contactId, limit)
    .reverse();
}

// ==================== BOOKINGS ====================

function createBooking(contactId, service, date, time) {
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO bookings (contact_id, service, date, time) VALUES (?, ?, ?, ?)"
  ).run(contactId, service, date, time);
  return result.lastInsertRowid;
}

function getBookingsForDate(date) {
  const db = getDb();
  return db
    .prepare(
      `SELECT b.*, c.phone, c.name FROM bookings b
       JOIN contacts c ON b.contact_id = c.id
       WHERE b.date = ? AND b.status = 'confirmed'
       ORDER BY b.time`
    )
    .all(date);
}

function getBookedSlots(date) {
  const db = getDb();
  return db
    .prepare(
      "SELECT time FROM bookings WHERE date = ? AND status = 'confirmed'"
    )
    .all(date)
    .map((r) => r.time);
}

function getUpcomingBookings(contactId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM bookings
       WHERE contact_id = ? AND status = 'confirmed' AND date >= date('now')
       ORDER BY date, time`
    )
    .all(contactId);
}

function getPendingReminders() {
  const db = getDb();
  return db
    .prepare(
      `SELECT b.*, c.phone, c.name FROM bookings b
       JOIN contacts c ON b.contact_id = c.id
       WHERE b.status = 'confirmed'
       AND b.reminder_sent = 0
       AND datetime(b.date || ' ' || b.time) <= datetime('now', '+65 minutes')
       AND datetime(b.date || ' ' || b.time) >= datetime('now')`
    )
    .all();
}

function markReminderSent(bookingId) {
  const db = getDb();
  db.prepare("UPDATE bookings SET reminder_sent = 1 WHERE id = ?").run(bookingId);
}

function updateBookingStatus(bookingId, status) {
  const db = getDb();
  db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, bookingId);
}

// ==================== FOLLOW-UPS ====================

function scheduleFollowUp(contactId, reason, message, scheduledAt) {
  const db = getDb();
  const existing = db
    .prepare(
      "SELECT id FROM follow_ups WHERE contact_id = ? AND sent = 0"
    )
    .get(contactId);

  if (existing) return existing.id;

  const result = db.prepare(
    "INSERT INTO follow_ups (contact_id, reason, message, scheduled_at) VALUES (?, ?, ?, ?)"
  ).run(contactId, reason, message, scheduledAt);
  return result.lastInsertRowid;
}

function getPendingFollowUps() {
  const db = getDb();
  return db
    .prepare(
      `SELECT f.*, c.phone, c.name FROM follow_ups f
       JOIN contacts c ON f.contact_id = c.id
       WHERE f.sent = 0 AND f.scheduled_at <= datetime('now')
       ORDER BY f.scheduled_at`
    )
    .all();
}

function markFollowUpSent(followUpId) {
  const db = getDb();
  db.prepare("UPDATE follow_ups SET sent = 1 WHERE id = ?").run(followUpId);
}

// ==================== CAMPAIGNS ====================

function createCampaign(name, messageTemplate, targetTags = []) {
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO campaigns (name, message_template, target_tags) VALUES (?, ?, ?)"
  ).run(name, messageTemplate, JSON.stringify(targetTags));
  return result.lastInsertRowid;
}

function updateCampaignStats(campaignId, sentCount, replyCount = 0) {
  const db = getDb();
  db.prepare(
    "UPDATE campaigns SET sent_count = ?, reply_count = ?, status = 'completed' WHERE id = ?"
  ).run(sentCount, replyCount, campaignId);
}

// ==================== ANALYTICS ====================

function getDailyStats() {
  const db = getDb();

  const today = new Date().toISOString().split("T")[0];

  const totalConversations = db
    .prepare(
      "SELECT COUNT(DISTINCT contact_id) as count FROM conversations WHERE date(timestamp) = ?"
    )
    .get(today);

  const totalMessages = db
    .prepare(
      "SELECT COUNT(*) as count FROM conversations WHERE date(timestamp) = ?"
    )
    .get(today);

  const newContacts = db
    .prepare(
      "SELECT COUNT(*) as count FROM contacts WHERE date(first_contact) = ?"
    )
    .get(today);

  const bookingsToday = db
    .prepare(
      "SELECT COUNT(*) as count FROM bookings WHERE date = ? AND status = 'confirmed'"
    )
    .get(today);

  const followUpsSent = db
    .prepare(
      "SELECT COUNT(*) as count FROM follow_ups WHERE date(scheduled_at) = ? AND sent = 1"
    )
    .get(today);

  return {
    date: today,
    conversations: totalConversations.count,
    messages: totalMessages.count,
    newContacts: newContacts.count,
    bookings: bookingsToday.count,
    followUpsSent: followUpsSent.count,
  };
}

function getWeeklyStats() {
  const db = getDb();

  const stats = db
    .prepare(
      `SELECT
        COUNT(DISTINCT contact_id) as conversations,
        COUNT(*) as messages
       FROM conversations
       WHERE timestamp >= datetime('now', '-7 days')`
    )
    .get();

  const bookings = db
    .prepare(
      "SELECT COUNT(*) as count FROM bookings WHERE date >= date('now', '-7 days')"
    )
    .get();

  const newContacts = db
    .prepare(
      "SELECT COUNT(*) as count FROM contacts WHERE first_contact >= datetime('now', '-7 days')"
    )
    .get();

  return {
    ...stats,
    bookings: bookings.count,
    newContacts: newContacts.count,
  };
}

module.exports = {
  findOrCreateContact,
  updateContactName,
  addContactTag,
  getAllContacts,
  getContactByPhone,
  saveMessage,
  getRecentConversation,
  createBooking,
  getBookingsForDate,
  getBookedSlots,
  getUpcomingBookings,
  getPendingReminders,
  markReminderSent,
  updateBookingStatus,
  scheduleFollowUp,
  getPendingFollowUps,
  markFollowUpSent,
  createCampaign,
  updateCampaignStats,
  getDailyStats,
  getWeeklyStats,
};
