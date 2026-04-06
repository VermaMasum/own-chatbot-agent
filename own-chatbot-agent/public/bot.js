const botId = getBotIdFromPath();
const isEmbed = new URL(window.location.href).searchParams.has("embed");

const botTitle = document.getElementById("botTitle");
const botDescription = document.getElementById("botDescription");
const botBusinessType = document.getElementById("botBusinessType");
const botTone = document.getElementById("botTone");
const botName = document.getElementById("botName");
const botMeta = document.getElementById("botMeta");
const botChatWindow = document.getElementById("botChatWindow");
const botChatForm = document.getElementById("botChatForm");
const botChatInput = document.getElementById("botChatInput");

let currentBot = null;
let conversation = [];

document.body.classList.toggle("embed-mode", isEmbed);

if (!botId) {
  renderError("Missing chatbot id.");
} else {
  await loadBot();
}

botChatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = botChatInput.value.trim();
  if (!message || !currentBot) return;

  botChatInput.value = "";
  addMessage("user", message);
  conversation.push({ role: "user", content: message });

  const typingId = addTyping();
  try {
    const data = await callApi("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        botId: currentBot.id,
        message,
        conversation
      })
    });

    removeTyping(typingId);
    const reply = data?.reply || "I could not generate a response right now.";
    addMessage("bot", reply);
    conversation.push({ role: "assistant", content: reply });
  } catch {
    removeTyping(typingId);
    const fallback = "The chatbot is temporarily unavailable.";
    addMessage("bot", fallback);
    conversation.push({ role: "assistant", content: fallback });
  }
});

async function loadBot() {
  try {
    const bot = await callApi(`/api/bots/${encodeURIComponent(botId)}`);
    if (!bot) {
      renderError("This chatbot could not be found.");
      return;
    }

    currentBot = bot;
    botTitle.textContent = bot.profile?.projectName || "Published chatbot";
    botDescription.textContent = bot.profile?.websiteSummary || "A published chatbot created from the builder.";
    botBusinessType.textContent = bot.profile?.businessType || "General Business";
    botTone.textContent = bot.profile?.tone || "Helpful tone";
    botName.textContent = bot.profile?.projectName || "Chatbot";
    botMeta.textContent = `${bot.profile?.businessType || "General Business"} | ${bot.profile?.tone || "Helpful tone"}`;

    renderWelcome(bot);
  } catch (error) {
    renderError(error.message || "Could not load chatbot.");
  }
}

function renderWelcome(bot) {
  botChatWindow.innerHTML = "";
  const welcome = `Hi, I'm ${bot.profile?.projectName || "your chatbot"}. Ask me anything about the business.`;
  addMessage("bot", welcome);
}

function renderError(message) {
  botTitle.textContent = "Chatbot unavailable";
  botDescription.textContent = message;
  botBusinessType.textContent = "Unknown";
  botTone.textContent = "Unavailable";
  botName.textContent = "Error";
  botMeta.textContent = message;
  botChatWindow.innerHTML = "";
  addMessage("system", message);
  botChatForm?.setAttribute("aria-disabled", "true");
  botChatInput.disabled = true;
}

function addMessage(role, text) {
  const row = document.createElement("div");
  row.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  row.appendChild(bubble);
  botChatWindow.appendChild(row);
  botChatWindow.scrollTop = botChatWindow.scrollHeight;
}

function addTyping() {
  const id = `typing-${Date.now()}`;
  const row = document.createElement("div");
  row.className = "message bot";
  row.dataset.typingId = id;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = "Typing...";

  row.appendChild(bubble);
  botChatWindow.appendChild(row);
  botChatWindow.scrollTop = botChatWindow.scrollHeight;
  return id;
}

function removeTyping(id) {
  const row = botChatWindow.querySelector(`[data-typing-id="${id}"]`);
  if (row) row.remove();
}

async function callApi(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }
  return data;
}

function getBotIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "bot" && parts[1]) {
    return parts[1];
  }
  return "";
}
