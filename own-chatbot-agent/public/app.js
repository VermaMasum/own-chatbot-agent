const form = document.getElementById("builderForm");
const output = document.getElementById("output");
const businessType = document.getElementById("businessType");
const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const quickActions = document.getElementById("quickActions");
const simName = document.getElementById("simName");
const simMeta = document.getElementById("simMeta");
const submitButton = form.querySelector('button[type="submit"]');

let currentProfile = null;
let conversation = [];

const templatesResponse = await fetch("/api/templates");
const templatesData = await templatesResponse.json();

businessType.innerHTML = templatesData.templates
  .map((item, index) => `<option value="${item.key}" ${index === 0 ? "selected" : ""}>${item.label}</option>`)
  .join("");

const templatePrompts = {
  real_estate: [
    "Do you have 2BHK apartments?",
    "Can I book a site visit?",
    "What is the starting price?"
  ],
  ecommerce: [
    "Do you have this in stock?",
    "What is your return policy?",
    "Do you deliver nationwide?"
  ],
  clinic: [
    "Can I book an appointment?",
    "What are your timings?",
    "Do you offer consultation for skin care?"
  ],
  saas: [
    "How does this product work?",
    "What plans do you offer?",
    "Can I book a demo?"
  ],
  restaurant: [
    "What is on your menu?",
    "Do you take table reservations?",
    "Are you open today?"
  ],
  generic: [
    "What services do you offer?",
    "How can I contact your team?",
    "Do you have pricing details?"
  ]
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await refreshProfile();
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message || !currentProfile) return;

  chatInput.value = "";
  addMessage("user", message);
  conversation.push({ role: "user", content: message });

  const typingId = addTyping();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        profile: currentProfile,
        conversation
      })
    });

    const data = await response.json();
    removeTyping(typingId);

    const reply = data.reply || "I could not generate a response right now.";
    if (data.error) {
      simMeta.textContent = `${currentProfile.businessType} | ${currentProfile.tone} | ${data.provider || "fallback"}`;
    }
    addMessage("bot", reply);
    conversation.push({ role: "assistant", content: reply });
  } catch {
    removeTyping(typingId);
    const fallback = "I could not reach the chatbot API right now. Please check the server and Groq key.";
    addMessage("bot", fallback);
    conversation.push({ role: "assistant", content: fallback });
  }

  scrollChatToBottom();
});

quickActions.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-prompt]");
  if (!button) return;
  chatInput.value = button.dataset.prompt;
  chatForm.requestSubmit();
});

businessType.addEventListener("change", () => {
  syncQuickActions(businessType.value);
});

await refreshProfile(true);

async function refreshProfile(isInitial = false) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  submitButton.disabled = true;
  submitButton.textContent = isInitial ? "Loading chatbot profile..." : "Updating chatbot profile...";
  output.textContent = "Building chatbot profile from your website...";
  simMeta.textContent = "Reading website and generating profile...";

  try {
    const response = await fetch("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || `Profile build failed with status ${response.status}`);
    }

    if (!Array.isArray(data.websiteChunks) || data.websiteChunks.length === 0) {
      simMeta.textContent = `${data.businessType} | ${data.tone} | no readable website content found`;
    }

    currentProfile = data;
    output.textContent = JSON.stringify(currentProfile, null, 2);

    simName.textContent = currentProfile.projectName || "Website Assistant";
    simMeta.textContent = `${currentProfile.businessType} | ${currentProfile.tone}`;

    conversation = [];
    renderIntro(isInitial);
    syncQuickActions(payload.businessType);
  } catch (error) {
    currentProfile = null;
    output.textContent = `Could not generate chatbot profile.\n\n${error.message}`;
    simMeta.textContent = "Could not read the website";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Generate chatbot profile";
  }
}

function renderIntro(isInitial = false) {
  chatWindow.innerHTML = "";

  const welcome = currentProfile?.projectName
    ? `Hi, I'm ${currentProfile.projectName}. Ask me anything about the business and I will answer like the live chatbot.`
    : "Hi, I'm your chatbot assistant. Ask me anything about the business.";

  addMessage("bot", welcome);
  conversation.push({ role: "assistant", content: welcome });

  if (isInitial) {
    const hint = "This is a live simulator. Type a question below and I will answer using Groq when configured.";
    addMessage("system", hint);
  }

  scrollChatToBottom();
}

function syncQuickActions(type) {
  const prompts = templatePrompts[type] || templatePrompts.generic;
  quickActions.innerHTML = prompts
    .map((prompt) => `<button type="button" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`)
    .join("");
}

function addMessage(role, text) {
  const row = document.createElement("div");
  row.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  row.appendChild(bubble);
  chatWindow.appendChild(row);
  scrollChatToBottom();
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
  chatWindow.appendChild(row);
  scrollChatToBottom();
  return id;
}

function removeTyping(id) {
  const row = chatWindow.querySelector(`[data-typing-id="${id}"]`);
  if (row) row.remove();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function scrollChatToBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
