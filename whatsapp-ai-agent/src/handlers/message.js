const { generateResponse } = require("../ai/provider");
const models = require("../db/models");
const settings = require("../config/settings");
const {
  formatPhone,
  normalizePhone,
  getScheduledTime,
  formatDate,
  formatTime,
  getToday,
} = require("../utils/helpers");

let lockedChatId = null;

function getChatId(msg) {
  return msg.to || msg.from || (msg.id && msg.id.remote) || "";
}

function formatDebugMessage(msg) {
  return [
    `from=${msg.from || ""}`,
    `to=${msg.to || ""}`,
    `remote=${(msg.id && msg.id.remote) || ""}`,
    `fromMe=${Boolean(msg.fromMe)}`,
    `type=${msg.type || ""}`,
  ].join(" | ");
}

function isAllowedChat(msg) {
  const chatId = getChatId(msg);
  const allowedIds = settings.chatControl.allowedChatIds || [];

  if (allowedIds.length > 0) {
    const allowed = allowedIds.includes(chatId);
    if (!allowed) {
      console.log(`[CHAT] Ignored ${chatId} because it is not in ALLOWED_CHAT_IDS`);
    }
    return allowed;
  }

  if (settings.chatControl.lockToFirstChat) {
    if (!lockedChatId) {
      lockedChatId = chatId;
      console.log(`[CHAT] Locked to ${lockedChatId}`);
    }
    const allowed = chatId === lockedChatId;
    if (!allowed) {
      console.log(`[CHAT] Ignored ${chatId} because bot is locked to ${lockedChatId}`);
    }
    return allowed;
  }

  return true;
}

function isOwnerCommand(messageBody) {
  const lowerCmd = messageBody.toLowerCase().trim();
  return (
    lowerCmd === "report" ||
    lowerCmd === "stats" ||
    lowerCmd === "status" ||
    lowerCmd === "bookings" ||
    lowerCmd === "today" ||
    lowerCmd === "help" ||
    lowerCmd === "commands" ||
    lowerCmd.startsWith("campaign:") ||
    lowerCmd.startsWith("broadcast:")
  );
}

async function handleIncomingMessage(client, msg, options = {}) {
  try {
    const {
      allowFromMe = false,
      registerOutgoingMessage = () => {},
      shouldIgnoreOutgoingMessage = () => false,
    } = options;

    // Skip unsupported chats like groups, status updates, and newsletters/channels
    if (
      !msg.from ||
      msg.from.includes("@g.us") ||
      msg.from === "status@broadcast" ||
      msg.from.includes("@newsletter")
    ) return;
    if (!isAllowedChat(msg)) return;
    if (msg.fromMe && !allowFromMe) return;
    if (msg.fromMe && allowFromMe && shouldIgnoreOutgoingMessage(msg.body || "")) return;
    if (!msg.body || msg.body.trim() === "") return;

    const rawBody = msg.body.trim();
    const isSelfTestMessage = allowFromMe && msg.fromMe && rawBody.toLowerCase().startsWith("test:");
    const messageBody = isSelfTestMessage
      ? rawBody.slice(5).trim()
      : rawBody;
    const chatId = getChatId(msg);
    const phone = formatPhone(chatId);

    if (messageBody === "") return;

    console.log(`[CHAT] ${formatDebugMessage(msg)} | chatId=${chatId} | resolvedPhone=${phone} | selfTest=${allowFromMe && msg.fromMe}`);
    console.log(`[MSG] From ${phone}: ${messageBody}`);

    // Find or create contact
    const contact = models.findOrCreateContact(phone);

    // Check if this is the owner
    const isOwner =
      (allowFromMe && msg.fromMe) ||
      normalizePhone(phone) === normalizePhone(settings.ownerPhone);

    if (isOwner && isOwnerCommand(messageBody)) {
      const handled = await handleOwnerCommand(client, msg, messageBody, registerOutgoingMessage, chatId);
      if (handled) return;
    }

    // Save incoming message
    models.saveMessage(contact.id, "customer", messageBody);

    // Get recent conversation for context
    const recentMessages = models.getRecentConversation(contact.id, 10);

    // Try to extract name from WhatsApp contact
    let contactName = contact.name;
    if (!contactName) {
      try {
        const waContact = await msg.getContact();
        if (waContact.pushname) {
          contactName = waContact.pushname;
          models.updateContactName(contact.id, contactName);
        }
      } catch (e) {
        // Ignore - name is optional
      }
    }

    // Generate AI response
    const { intent, message: aiResponse } = await generateResponse(
      messageBody,
      recentMessages,
      contactName
    );

    console.log(`[AI] Intent: ${intent} | Response: ${aiResponse.substring(0, 80)}...`);

    // Save AI response
    models.saveMessage(contact.id, "agent", aiResponse, intent);

    // Tag contact based on intent
    if (intent === "inquiry" || intent === "followup_needed") {
      models.addContactTag(contact.id, "lead");
    }
    if (intent === "booking") {
      models.addContactTag(contact.id, "customer");
    }
    if (intent === "complaint") {
      models.addContactTag(contact.id, "complaint");
      // Alert owner about complaint
      await alertOwner(client, `Complaint from ${contactName || phone}:\n"${messageBody}"`, registerOutgoingMessage);
    }

    // Schedule follow-up if needed
    if (intent === "followup_needed" || intent === "inquiry") {
      const scheduledAt = getScheduledTime(settings.followUp.delayHours);
      const followUpMsg = contactName
        ? `Hi ${contactName}! You asked about our services yesterday. We'd love to help you! Any questions? 😊`
        : `Hi! You asked about our services yesterday. We'd love to help you! Any questions? 😊`;

      models.scheduleFollowUp(contact.id, "inquiry_followup", followUpMsg, scheduledAt);
      console.log(`[FOLLOWUP] Scheduled for ${phone} at ${scheduledAt}`);
    }

    // Send response with typing simulation
    try {
      const chat = await msg.getChat();
      await chat.sendStateTyping();
      // Simulate typing based on message length (min 1s, max 3s)
      const typingDelay = Math.min(3000, Math.max(1000, aiResponse.length * 20));
      await new Promise((r) => setTimeout(r, typingDelay));
      await chat.clearState();
    } catch (typingError) {
      console.warn(`[MSG] Could not set typing state for ${phone}: ${typingError.message}`);
    }

    const replyTarget = chatId;
    registerOutgoingMessage(aiResponse);
    await client.sendMessage(replyTarget, aiResponse);
    console.log(`[SENT] To ${phone} | target=${replyTarget}: ${aiResponse.substring(0, 80)}...`);
  } catch (error) {
    console.error("[MSG] Error handling message:", error);
  }
}

async function handleOwnerCommand(client, msg, command, registerOutgoingMessage = () => {}, replyTarget = null) {
  const lowerCmd = command.toLowerCase().trim();
  const target = replyTarget || msg.from || msg.to;

  // Daily report
  if (lowerCmd === "report" || lowerCmd === "stats" || lowerCmd === "status") {
    const daily = models.getDailyStats();
    const weekly = models.getWeeklyStats();

    const report = `📊 *Daily Report (${daily.date})*

Today:
• Conversations: ${daily.conversations}
• Messages: ${daily.messages}
• New Contacts: ${daily.newContacts}
• Bookings: ${daily.bookings}
• Follow-ups Sent: ${daily.followUpsSent}

This Week:
• Total Conversations: ${weekly.conversations}
• Total Messages: ${weekly.messages}
• Bookings: ${weekly.bookings}
• New Contacts: ${weekly.newContacts}

_Your AI agent is working 24/7_ 🤖`;

    registerOutgoingMessage(report);
    await client.sendMessage(target, report);
    console.log(`[OWNER] report -> target=${target}`);
    return true;
  }

  // Send campaign
  if (lowerCmd.startsWith("campaign:") || lowerCmd.startsWith("broadcast:")) {
    const campaignMessage = command.split(":").slice(1).join(":").trim();
    if (!campaignMessage) {
      const usage = "Usage: campaign: Your message here\n\nExample: campaign: Diwali special! 30% off on all services this week!";
      registerOutgoingMessage(usage);
      await client.sendMessage(target, usage);
      console.log(`[OWNER] campaign usage -> target=${target}`);
      return true;
    }

    await sendCampaign(client, target, campaignMessage, registerOutgoingMessage);
    return true;
  }

  // List today's bookings
  if (lowerCmd === "bookings" || lowerCmd === "today") {
    const bookings = models.getBookingsForDate(getToday());
    if (bookings.length === 0) {
      const noBookings = "No bookings for today.";
      registerOutgoingMessage(noBookings);
      await client.sendMessage(target, noBookings);
      console.log(`[OWNER] bookings -> target=${target} | no bookings`);
      return true;
    }

    let bookingList = `📅 *Today's Bookings*\n\n`;
    bookings.forEach((b, i) => {
      bookingList += `${i + 1}. ${formatTime(b.time)} - ${b.service}\n   👤 ${b.name || b.phone}\n\n`;
    });

    registerOutgoingMessage(bookingList);
    await client.sendMessage(target, bookingList);
    console.log(`[OWNER] bookings -> target=${target} | count=${bookings.length}`);
    return true;
  }

  // Help
  if (lowerCmd === "help" || lowerCmd === "commands") {
    const helpText = `🤖 *Owner Commands*

• *report* - Get daily/weekly stats
• *bookings* - See today's bookings
• *campaign: message* - Send promo to all contacts
• *help* - Show this help

Your AI agent is handling all customer messages automatically!`;

    registerOutgoingMessage(helpText);
    await client.sendMessage(target, helpText);
    console.log(`[OWNER] help -> target=${target}`);
    return true;
  }

  return false; // Not an owner command, process normally
}

async function sendCampaign(client, ownerChat, campaignMessage, registerOutgoingMessage = () => {}) {
  const contacts = models.getAllContacts();

  if (contacts.length === 0) {
    const noContacts = "No contacts to send to yet!";
    registerOutgoingMessage(noContacts);
    await client.sendMessage(ownerChat, noContacts);
    console.log(`[CAMPAIGN] target=${ownerChat} | no contacts`);
    return;
  }

  const campaignId = models.createCampaign("WhatsApp Campaign", campaignMessage);
  const startMsg = `📢 Sending campaign to ${contacts.length} contacts...\n\nMessage: "${campaignMessage}"`;
  registerOutgoingMessage(startMsg);
  await client.sendMessage(ownerChat, startMsg);
  console.log(`[CAMPAIGN] start -> target=${ownerChat} | contacts=${contacts.length}`);

  let sentCount = 0;

  for (const contact of contacts) {
    try {
      // Skip owner
      if (normalizePhone(contact.phone) === normalizePhone(settings.ownerPhone)) continue;

      // Personalize message
      let personalMsg = campaignMessage;
      if (contact.name) {
        personalMsg = `Hi ${contact.name}! ${campaignMessage}`;
      }

      const chatId = `${contact.phone}@c.us`;
      await client.sendMessage(chatId, personalMsg);
      sentCount++;

      // Delay between messages to avoid spam detection (3-5 seconds)
      const randomDelay = 3000 + Math.random() * 2000;
      await new Promise((r) => setTimeout(r, randomDelay));
    } catch (error) {
      console.error(`[CAMPAIGN] Failed to send to ${contact.phone}:`, error.message);
    }
  }

  models.updateCampaignStats(campaignId, sentCount);
  const doneMsg = `✅ Campaign sent to ${sentCount}/${contacts.length} contacts!`;
  registerOutgoingMessage(doneMsg);
  await client.sendMessage(ownerChat, doneMsg);
  console.log(`[CAMPAIGN] done -> target=${ownerChat} | sent=${sentCount}`);
}

async function alertOwner(client, message, registerOutgoingMessage = () => {}) {
  if (!settings.ownerPhone) return;
  try {
    const ownerChat = `${normalizePhone(settings.ownerPhone)}@c.us`;
    const alertText = `🚨 *Alert*\n\n${message}`;
    registerOutgoingMessage(alertText);
    await client.sendMessage(ownerChat, alertText);
    console.log(`[ALERT] target=${ownerChat}`);
  } catch (error) {
    console.error("[ALERT] Failed to alert owner:", error.message);
  }
}

module.exports = { handleIncomingMessage, alertOwner };
