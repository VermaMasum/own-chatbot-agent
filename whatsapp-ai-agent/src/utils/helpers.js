function formatPhone(phone) {
  if (!phone) return "";
  // Remove WhatsApp chat suffixes and keep only the numeric identifier.
  return phone
    .replace(/@c\.us$/i, "")
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/@lid$/i, "")
    .replace(/@newsletter$/i, "")
    .replace(/@g\.us$/i, "")
    .replace(/[^\d]/g, "");
}

function normalizePhone(phone) {
  return formatPhone(phone);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(timeStr) {
  const [hours, minutes] = timeStr.split(":");
  const h = parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayHour}:${minutes} ${ampm}`;
}

function getScheduledTime(hoursFromNow) {
  const d = new Date();
  d.setHours(d.getHours() + hoursFromNow);
  return d.toISOString().replace("T", " ").split(".")[0];
}

function isBusinessHours() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  if (day === 0) return false; // Closed Sunday
  const hour = now.getHours();
  return hour >= 10 && hour < 20; // 10 AM - 8 PM
}

module.exports = {
  formatPhone,
  normalizePhone,
  delay,
  getToday,
  getTomorrow,
  formatDate,
  formatTime,
  getScheduledTime,
  isBusinessHours,
};
