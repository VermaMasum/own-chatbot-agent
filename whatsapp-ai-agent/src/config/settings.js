require("dotenv").config();

const settings = {
  // Business Info
  business: {
    name: process.env.BUSINESS_NAME || "My Business",
    type: process.env.BUSINESS_TYPE || "it_services",
    phone: process.env.BUSINESS_PHONE || "",
    hours: "9:30 AM - 7:00 PM",
    days: "Monday to Friday",
    closedOn: "Sunday",
    address: "Ahmedabad, Gujarat",
    upiId: "", // Add UPI ID for payments
  },

  // Services / Catalog - CUSTOMIZE THIS FOR YOUR BUSINESS
  catalog: [
    { name: "Website Development", price: 25000, duration: "2-4 weeks" },
    { name: "E-commerce Website", price: 45000, duration: "3-6 weeks" },
    { name: "Mobile App Development", price: 80000, duration: "6-10 weeks" },
    { name: "Custom CRM / ERP Solution", price: 120000, duration: "6-12 weeks" },
    { name: "UI/UX Design", price: 15000, duration: "1-2 weeks" },
    { name: "SEO & Digital Marketing", price: 12000, duration: "monthly" },
    { name: "Website Maintenance", price: 5000, duration: "monthly" },
    { name: "Cloud / DevOps Setup", price: 20000, duration: "1-2 weeks" },
  ],

  // Current offers
  offers: [
    "Free project consultation for new clients",
    "10% off on website development for first-time customers",
  ],

  // Consultation slots (24hr format)
  slots: [
    "09:30", "10:00", "10:30", "11:00",
    "11:30", "12:00", "14:00", "14:30",
    "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30",
  ],

  // AI Settings
  ai: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
    maxTokens: 300,
    temperature: 0.7,
  },

  // Owner phone (for alerts and reports)
  ownerPhone: process.env.OWNER_PHONE || "",

  // Chat control
  chatControl: {
    allowedChatIds: (process.env.ALLOWED_CHAT_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    lockToFirstChat: process.env.LOCK_TO_FIRST_CHAT === "true",
  },

  // Follow-up settings
  followUp: {
    delayHours: 24, // Follow up after 24 hours
    maxAttempts: 3, // Max 3 follow-ups per lead
  },

  // Reminder settings
  reminder: {
    beforeMinutes: 60, // Remind 1 hour before consultation
  },
};

module.exports = settings;
