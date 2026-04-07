const form = document.getElementById("builderForm");
const output = document.getElementById("output");
const businessType = document.getElementById("businessType");
const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const quickActions = document.getElementById("quickActions");
const simName = document.getElementById("simName");
const simMeta = document.getElementById("simMeta");
const publishButton = document.getElementById("publishButton");
const publishOutput = document.getElementById("publishOutput");
const submitButton = document.getElementById("generateBtn");

const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
let backendUrl = isLocal ? "" : "https://own-chatbot-agent.onrender.com";
if (window.location.hostname.includes("github.io")) {
  backendUrl = localStorage.getItem("chatbot_backend_url") || "https://own-chatbot-agent.onrender.com";
  const notice = document.getElementById("backendNotice");
  if (notice) notice.style.display = "block";
  const btn = document.getElementById("setBackend");
  if (btn) {
    btn.addEventListener("click", () => {
      const url = prompt("Enter your Render/Railway backend URL (e.g., https://my-bot.onrender.com):", backendUrl);
      if (url !== null) {
        localStorage.setItem("chatbot_backend_url", url.trim());
        window.location.reload();
      }
    });
  }
}

let currentProfile = null;
let currentBot = null;
let conversation = [];

const localTemplates = {
  real_estate: {
    label: "Real Estate",
    tone: "professional, helpful, and conversion-focused",
    goals: ["capture leads", "answer property questions", "book viewings"],
    knowledgeHints: ["property listings", "pricing", "loan guidance", "contact details"]
  },
  ecommerce: {
    label: "Ecommerce",
    tone: "friendly, concise, and sales-oriented",
    goals: ["answer product questions", "recommend products", "reduce support load"],
    knowledgeHints: ["product catalog", "shipping policy", "return policy", "promotions"]
  },
  clinic: {
    label: "Clinic / Healthcare",
    tone: "calm, professional, and reassuring",
    goals: ["book appointments", "answer service questions", "share clinic details"],
    knowledgeHints: ["services", "pricing", "timings", "doctor profiles"]
  },
  saas: {
    label: "SaaS",
    tone: "clear, technical, and support-friendly",
    goals: ["qualify leads", "answer product questions", "support onboarding"],
    knowledgeHints: ["pricing", "features", "documentation", "onboarding"]
  },
  restaurant: {
    label: "Restaurant",
    tone: "warm, quick, and welcoming",
    goals: ["share menu", "take reservations", "answer timing questions"],
    knowledgeHints: ["menu", "hours", "location", "delivery policy"]
  },
  generic: {
    label: "General Business",
    tone: "helpful, friendly, and adaptable",
    goals: ["answer website questions", "capture leads", "route complex issues"],
    knowledgeHints: ["about page", "FAQ", "contact details", "policies"]
  }
};

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

// Populate dropdown immediately from local data
if (businessType) {
  businessType.innerHTML = Object.entries(localTemplates)
    .map(([key, value], index) => `<option value="${key}" ${index === 0 ? "selected" : ""}>${value.label}</option>`)
    .join("");
  syncQuickActions(businessType.value);
}

// Sync dropdown with backend templates in background (no profile generation)
(async function syncTemplates() {
  try {
    const data = await callApi("/api/templates");
    if (!data || !data.templates || !data.templates.length) return;
    const currentVal = businessType.value;
    businessType.innerHTML = data.templates
      .map((item) => `<option value="${item.key}" ${item.key === currentVal ? "selected" : ""}>${item.label}</option>`)
      .join("");
  } catch {
    // keep local templates
  }
})();

// Show initial ready state — no auto-generation, wait for user to fill form
showReadyState();

submitButton.addEventListener("click", async () => {
  await generateProfile();
});

if (publishButton) {
  publishButton.addEventListener("click", async () => {
    if (!currentProfile) return;

    publishButton.disabled = true;
    publishButton.textContent = currentBot ? "Updating chatbot..." : "Publishing chatbot...";
    publishOutput.textContent = "Publishing your chatbot...";

    try {
      const data = await callApi("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: currentProfile,
          botId: currentBot?.id
        })
      });

      if (!data) throw new Error("Publish request failed");

      currentBot = data;
      currentProfile = { ...currentProfile, botId: data.id, publishUrl: data.publicUrl, embedUrl: data.embedUrl };

      if (output) output.textContent = JSON.stringify(currentProfile, null, 2);
      renderPublishOutput(data);
    } catch (error) {
      publishOutput.textContent = `Could not publish chatbot: ${error.message}`;
    } finally {
      publishButton.disabled = false;
      publishButton.textContent = currentBot ? "Update chatbot" : "Publish chatbot";
    }
  });
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  if (!currentProfile) {
    addMessage("system", "Please generate a chatbot profile first using the form on the left.");
    return;
  }

  chatInput.value = "";
  addMessage("user", message);
  conversation.push({ role: "user", content: message });

  const typingId = addTyping();

  try {
    const data = (await callApi("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, profile: currentProfile, conversation })
    })) || {
      reply: generateLocalReply(message, currentProfile, conversation),
      provider: "static"
    };

    removeTyping(typingId);
    const reply = data.reply || "I could not generate a response right now.";
    addMessage("bot", reply);
    conversation.push({ role: "assistant", content: reply });
  } catch {
    removeTyping(typingId);
    addMessage("bot", "I could not reach the chatbot API right now. Please check the server and Groq key.");
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

// ─── Core profile generation ──────────────────────────────────────────────────

async function generateProfile() {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const hasWebsiteUrl = String(payload.websiteUrl || "").trim().length > 0;

  // Lock button and show progress
  submitButton.disabled = true;
  submitButton.textContent = hasWebsiteUrl ? "Scraping website..." : "Generating profile...";
  output.textContent = hasWebsiteUrl
    ? `Reading ${payload.websiteUrl} and building your chatbot profile...`
    : "Building chatbot profile from your inputs...";
  simMeta.textContent = hasWebsiteUrl ? "Fetching website content..." : "Generating...";

  // Show progress in chat while waiting
  chatWindow.innerHTML = "";
  addMessage("system", hasWebsiteUrl
    ? `Reading ${payload.websiteUrl}... this may take up to 15 seconds.`
    : "Generating your chatbot profile...");

  try {
    const data = (await callApi("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, forceRefresh: true })
    })) || buildLocalProfile(payload);

    currentProfile = data;
    currentBot = null;

    // Show generated config
    output.textContent = JSON.stringify(currentProfile, null, 2);

    // Update simulator header
    simName.textContent = currentProfile.projectName || "Website Assistant";

    const hasWebContent = Array.isArray(data.websiteChunks) && data.websiteChunks.length > 0;
    const sourceLabel = data.provider === "static"
      ? "demo mode — no website scraped"
      : hasWebContent
        ? `${data.websitePages?.length || 0} pages scraped`
        : "profile generated, no web content found";

    simMeta.textContent = `${currentProfile.businessType} | ${currentProfile.tone} | ${sourceLabel}`;

    // Show welcome in chat
    chatWindow.innerHTML = "";
    const welcome = `Hi, I'm ${currentProfile.projectName || "your chatbot"}. Ask me anything about the business!`;
    addMessage("bot", welcome);
    conversation = [{ role: "assistant", content: welcome }];

    if (!hasWebContent && hasWebsiteUrl) {
      addMessage("system", "Note: I could not read the website content. I am using your form inputs to answer questions.");
    }

    syncQuickActions(payload.businessType);
    renderPublishPrompt();
    scrollChatToBottom();
  } catch (error) {
    currentProfile = null;
    output.textContent = `Error: ${error.message}`;
    simMeta.textContent = "Failed to generate profile";
    chatWindow.innerHTML = "";
    addMessage("system", `Could not generate profile: ${error.message}`);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Generate chatbot profile";
    if (publishButton) {
      publishButton.disabled = !currentProfile;
      publishButton.textContent = "Publish chatbot";
    }
  }
}

function showReadyState() {
  output.textContent = "Fill in the form and click \"Generate chatbot profile\" to get started.";
  simName.textContent = "Website Assistant";
  simMeta.textContent = "Ready — waiting for profile";
  chatWindow.innerHTML = "";
  addMessage("bot", "Hi! Fill in your website URL and business details on the left, then click Generate chatbot profile.");
  addMessage("system", "Your chatbot will be trained on your website content and ready to answer questions here.");
  renderPublishPrompt();
  if (publishButton) publishButton.disabled = true;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function syncQuickActions(type) {
  const prompts = templatePrompts[type] || templatePrompts.generic;
  quickActions.innerHTML = prompts
    .map((prompt) => `<button type="button" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`)
    .join("");
}

function renderPublishPrompt(message = "") {
  if (!publishOutput) return;
  publishOutput.textContent = message
    ? `Error: ${message}`
    : "Generate a chatbot profile first, then publish it to get a live URL and embed code.";
}

function renderPublishOutput(bot) {
  if (!publishOutput) return;
  const shareUrl = bot.publicUrl || bot.shareUrl || "";
  const embedScript = bot.embedScript || "";
  const embedIframe = bot.embedIframe || "";
  publishOutput.innerHTML = `
    <div class="publish-summary">
      <div><strong>Bot ID:</strong> <code>${escapeHtml(bot.id || "")}</code></div>
      <div><strong>Share URL:</strong> <a href="${escapeHtml(shareUrl)}" target="_blank" rel="noreferrer">${escapeHtml(shareUrl)}</a></div>
    </div>
    <label class="snippet-label">Embed script<textarea readonly rows="3">${escapeHtml(embedScript)}</textarea></label>
    <label class="snippet-label">Embed iframe<textarea readonly rows="4">${escapeHtml(embedIframe)}</textarea></label>
  `;
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
  return String(value || "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  );
}

function scrollChatToBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function loadTemplates() {
  try {
    const data = await callApi("/api/templates");
    if (!data || !data.templates) throw new Error("Invalid template data");
    return data;
  } catch {
    return {
      templates: Object.entries(localTemplates).map(([key, value]) => ({ key, label: value.label }))
    };
  }
}

async function callApi(path, options) {
  try {
    const fullPath = backendUrl ? `${backendUrl.replace(/\/$/, "")}${path}` : path;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    const response = await fetch(fullPath, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await response.json();
    if (!response.ok || data?.error) {
      throw new Error(data?.error || `Request failed with status ${response.status}`);
    }
    return data;
  } catch (error) {
    console.error("API Call failed:", error.message);
    return null;
  }
}

// ─── Local fallback profile ───────────────────────────────────────────────────

function buildLocalProfile(payload) {
  const template = localTemplates[payload.businessType] || localTemplates.generic;
  const projectName = payload.projectName || `${template.label} Chatbot`;
  const goals = compact([payload.mainGoal, ...template.goals]);
  const knowledgeSources = compact([
    payload.websiteUrl && `Website: ${payload.websiteUrl}`,
    payload.uploadedDocs && `Uploaded docs: ${payload.uploadedDocs}`,
    ...template.knowledgeHints.map((hint) => `Business knowledge: ${hint}`)
  ]);
  const leadCaptureFields = compact([
    payload.capturesName === "yes" && "name",
    payload.capturesEmail === "yes" && "email",
    payload.capturesPhone === "yes" && "phone"
  ]);
  const handoffConditions = compact([
    payload.handoffReason || "The user asks for something outside the knowledge base.",
    "The user requests a human representative.",
    "The bot is uncertain about the answer."
  ]);
  return {
    projectName,
    businessType: template.label,
    websiteUrl: payload.websiteUrl || "",
    websiteTitle: "",
    websiteSummary: "",
    websitePages: [],
    websiteSections: [],
    websiteChunks: [],
    websiteTopics: [],
    tone: payload.tone || template.tone,
    goals,
    targetAudience: payload.targetAudience || "website visitors",
    knowledgeSources,
    leadCaptureFields,
    handoffConditions,
    allowedTopics: compact([payload.allowedTopics, "business services", "pricing or packages", "basic support"]),
    blockedTopics: compact([payload.blockedTopics, "legal advice", "medical diagnosis", "financial guarantees"]),
    prompt: [
      `You are the AI chatbot for ${projectName}.`,
      `Business type: ${template.label}.`,
      `Tone: ${payload.tone || template.tone}.`,
      `Primary goals: ${goals.join(", ")}.`,
      `Knowledge sources: ${knowledgeSources.join(", ")}.`,
      `Capture lead fields only when useful: ${leadCaptureFields.join(", ") || "none"}.`,
      `Hand off to a human when: ${handoffConditions.join(" | ")}.`,
      "Be accurate, concise, and friendly.",
      "If a question cannot be answered confidently, say so and offer a handoff."
    ].join("\n"),
    provider: "static"
  };
}

function generateLocalReply(message, profile, history) {
  const text = String(message || "").toLowerCase();
  const name = profile?.projectName || "this chatbot";
  if (text.includes("price") || text.includes("pricing")) return `${name} can help with pricing guidance — ask a specific question for details.`;
  if (text.includes("hello") || text.includes("hi")) return `Hi, I'm ${name}. How can I help today?`;
  if (text.includes("contact") || text.includes("email") || text.includes("phone")) return `I can help route you to the right contact details for ${profile?.businessType || "this business"}.`;
  return `I'm your AI assistant for ${profile?.businessType || "this business"}. Ask me about ${profile?.goals?.[0] || "our services"}.`;
}

function compact(values) {
  return [...new Set((values.flat ? values.flat() : values).filter(Boolean))];
}
