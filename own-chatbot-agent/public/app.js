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

const templatesData = await loadTemplates();

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
    const data =
      (await callApi("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          profile: currentProfile,
          conversation
        })
      })) || {
        reply: generateLocalReply(message, currentProfile, conversation),
        provider: "static"
      };

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
    const data =
      (await callApi("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })) || buildLocalProfile(payload);

    if (!Array.isArray(data.websiteChunks) || data.websiteChunks.length === 0) {
      simMeta.textContent = `${data.businessType} | ${data.tone} | ${
        data.provider === "static" ? "demo mode" : "no readable website content found"
      }`;
    }

    currentProfile = data;
    output.textContent = JSON.stringify(currentProfile, null, 2);

    simName.textContent = currentProfile.projectName || "Website Assistant";
    simMeta.textContent = `${currentProfile.businessType} | ${currentProfile.tone}${currentProfile.provider === "static" ? " | demo mode" : ""}`;

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
  return value.replace(/[&<>"']/g, (char) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]
  );
}

function scrollChatToBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function loadTemplates() {
  try {
    const response = await fetch("./api/templates");
    if (!response.ok) throw new Error("Template endpoint unavailable");
    return await response.json();
  } catch {
    return {
      templates: Object.entries(localTemplates).map(([key, value]) => ({
        key,
        label: value.label
      }))
    };
  }
}

async function callApi(path, options) {
  try {
    const response = await fetch(path, options);
    const data = await response.json();
    if (!response.ok || data?.error) {
      throw new Error(data?.error || `Request failed with status ${response.status}`);
    }
    return data;
  } catch {
    return null;
  }
}

function buildLocalProfile(payload) {
  const template = localTemplates[payload.businessType] || localTemplates.generic;
  const projectName = payload.projectName || `${template.label} Chatbot`;
  const goals = compact([payload.mainGoal, ...template.goals]);
  const knowledgeSources = compact([
    payload.websiteUrl && `Website: ${payload.websiteUrl}`,
    payload.websiteTitle && `Website title: ${payload.websiteTitle}`,
    payload.websiteSummary && `Website summary: ${payload.websiteSummary}`,
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
    websiteTitle: payload.websiteTitle || "",
    websiteSummary: payload.websiteSummary || "",
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
    allowedTopics: compact([
      payload.allowedTopics,
      "business services",
      "pricing or packages",
      "basic support"
    ]),
    blockedTopics: compact([
      payload.blockedTopics,
      "legal advice",
      "medical diagnosis",
      "financial guarantees"
    ]),
    prompt: buildLocalPrompt({
      projectName,
      businessType: template.label,
      tone: payload.tone || template.tone,
      goals,
      knowledgeSources,
      handoffConditions,
      leadFields: leadCaptureFields
    }),
    provider: "static"
  };
}

function buildLocalPrompt(profile) {
  return [
    `You are the AI chatbot for ${profile.projectName}.`,
    `Business type: ${profile.businessType}.`,
    `Tone: ${profile.tone}.`,
    `Primary goals: ${profile.goals.join(", ")}.`,
    `Knowledge sources: ${profile.knowledgeSources.join(", ")}.`,
    `Capture lead fields only when useful: ${profile.leadFields.join(", ") || "none"}.`,
    `Hand off to a human when: ${profile.handoffConditions.join(" | ")}.`,
    "Be accurate, concise, and friendly.",
    "If a question cannot be answered confidently, say so and offer a handoff.",
    "Adapt the reply to the user's intent instead of sounding generic."
  ].join("\n");
}

function generateLocalReply(message, profile, history) {
  const text = String(message || "").toLowerCase();
  const name = profile?.projectName || "this chatbot";

  if (text.includes("price") || text.includes("pricing")) {
    return `${name} can help with pricing guidance, but exact numbers depend on the business setup.`;
  }

  if (text.includes("hello") || text.includes("hi")) {
    return `Hi, I’m ${name}. How can I help today?`;
  }

  if (text.includes("contact") || text.includes("email") || text.includes("phone")) {
    return `I can help route you to the right contact details for ${profile?.businessType || "this business"}.`;
  }

  const lastUserMessage = [...history].reverse().find((item) => item.role === "user")?.content;
  return `I’m in demo mode right now, so I can simulate helpful replies for ${
    profile?.businessType || "this business"
  }. Ask me about ${profile?.goals?.[0] || "services"} or "${lastUserMessage || "your question"}".`;
}

function compact(values) {
  return [...new Set(values.flat ? values.flat().filter(Boolean) : values.filter(Boolean))];
}
