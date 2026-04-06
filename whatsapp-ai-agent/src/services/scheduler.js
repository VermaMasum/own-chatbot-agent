const cron = require("node-cron");
const models = require("../db/models");
const settings = require("../config/settings");
const { formatTime, formatDate, normalizePhone } = require("../utils/helpers");

let whatsappClient = null;

function init(client) {
  whatsappClient = client;

  // Check for pending reminders every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    await sendPendingReminders();
  });

  // Check for pending follow-ups every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    await sendPendingFollowUps();
  });

  // Send daily report to owner at 9 PM
  cron.schedule("0 21 * * *", async () => {
    await sendDailyReport();
  });

  console.log("[SCHEDULER] All cron jobs initialized");
}

async function sendPendingReminders() {
  if (!whatsappClient) return;

  try {
    const reminders = models.getPendingReminders();

    for (const booking of reminders) {
      const message = `⏰ *Appointment Reminder*\n\nHi${booking.name ? " " + booking.name : ""}! Just a reminder about your appointment:\n\n📋 ${booking.service}\n📅 ${formatDate(booking.date)}\n🕐 ${formatTime(booking.time)}\n📍 ${settings.business.address}\n\nSee you soon! 😊`;

      try {
        const chatId = `${booking.phone}@c.us`;
        await whatsappClient.sendMessage(chatId, message);
        models.markReminderSent(booking.id);
        console.log(`[REMINDER] Sent to ${booking.phone} for ${booking.service}`);

        // Small delay between reminders
        await new Promise((r) => setTimeout(r, 2000));
      } catch (error) {
        console.error(`[REMINDER] Failed for ${booking.phone}:`, error.message);
      }
    }
  } catch (error) {
    console.error("[REMINDER] Error checking reminders:", error.message);
  }
}

async function sendPendingFollowUps() {
  if (!whatsappClient) return;

  try {
    const followUps = models.getPendingFollowUps();

    for (const followUp of followUps) {
      try {
        const chatId = `${followUp.phone}@c.us`;
        const message = followUp.message || `Hi${followUp.name ? " " + followUp.name : ""}! You showed interest in our services. Would you like to book an appointment? We have great offers this week! 😊`;

        await whatsappClient.sendMessage(chatId, message);
        models.markFollowUpSent(followUp.id);
        console.log(`[FOLLOWUP] Sent to ${followUp.phone}: ${followUp.reason}`);

        // Delay between follow-ups (5-8 seconds)
        const randomDelay = 5000 + Math.random() * 3000;
        await new Promise((r) => setTimeout(r, randomDelay));
      } catch (error) {
        console.error(`[FOLLOWUP] Failed for ${followUp.phone}:`, error.message);
      }
    }
  } catch (error) {
    console.error("[FOLLOWUP] Error checking follow-ups:", error.message);
  }
}

async function sendDailyReport() {
  if (!whatsappClient || !settings.ownerPhone) return;

  try {
    const daily = models.getDailyStats();
    const weekly = models.getWeeklyStats();

    const report = `📊 *End of Day Report*\n\nToday (${daily.date}):\n• ${daily.conversations} conversations\n• ${daily.newContacts} new contacts\n• ${daily.bookings} bookings\n• ${daily.followUpsSent} follow-ups sent\n\nThis Week:\n• ${weekly.conversations} total conversations\n• ${weekly.newContacts} new contacts\n• ${weekly.bookings} bookings\n\nGood night! Your AI agent will keep working while you rest. 🌙`;

    const ownerChat = `${normalizePhone(settings.ownerPhone)}@c.us`;
    await whatsappClient.sendMessage(ownerChat, report);
    console.log("[SCHEDULER] Daily report sent to owner");
  } catch (error) {
    console.error("[SCHEDULER] Failed to send daily report:", error.message);
  }
}

module.exports = { init };
