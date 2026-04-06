const Groq = require("groq-sdk");
const settings = require("../config/settings");
const { buildSystemPrompt, buildConversationContext } = require("./prompts");

let groqClient;

function getClient() {
  if (!groqClient) {
    if (!settings.ai.apiKey || settings.ai.apiKey === "your_groq_api_key_here") {
      console.error("[AI] ERROR: No Groq API key set! Get one free at https://console.groq.com/keys");
      process.exit(1);
    }
    groqClient = new Groq({ apiKey: settings.ai.apiKey });
  }
  return groqClient;
}

async function generateResponse(customerMessage, recentMessages = [], contactName = "") {
  const client = getClient();

  const systemPrompt = buildSystemPrompt();
  const conversationContext = buildConversationContext(recentMessages, contactName);

  const messages = [
    { role: "system", content: systemPrompt + conversationContext },
    { role: "user", content: customerMessage },
  ];

  try {
    const response = await client.chat.completions.create({
      model: settings.ai.model,
      messages,
      max_tokens: settings.ai.maxTokens,
      temperature: settings.ai.temperature,
    });

    const fullResponse = response.choices[0]?.message?.content || "";
    return parseResponse(fullResponse);
  } catch (error) {
    console.error("[AI] Error generating response:", error.message);

    // Handle rate limiting
    if (error.status === 429) {
      return {
        intent: "general",
        message: "Sorry, I'm a bit busy right now! I'll get back to you in a moment. 😊",
      };
    }

    return {
      intent: "general",
      message: "Sorry, I couldn't process that right now. Please try again or call us directly!",
    };
  }
}

function parseResponse(fullResponse) {
  const intentMatch = fullResponse.match(/\[INTENT:(\w+)\]/);
  const intent = intentMatch ? intentMatch[1] : "general";

  // Remove the intent tag from the customer-facing message
  const message = fullResponse
    .replace(/\[INTENT:\w+\]\s*/g, "")
    .trim();

  return { intent, message };
}

async function classifyIntent(message) {
  // Quick local classification for common patterns before using AI
  const lowerMsg = message.toLowerCase();

  // Owner commands
  if (lowerMsg === "report" || lowerMsg === "stats" || lowerMsg === "status") {
    return "owner_command";
  }
  if (lowerMsg.startsWith("campaign:") || lowerMsg.startsWith("broadcast:")) {
    return "owner_command";
  }

  // Greetings
  if (/^(hi|hello|hey|hii+|namaste|good morning|good evening)\s*[!.]*$/i.test(lowerMsg)) {
    return "greeting";
  }

  // Booking keywords
  if (/\b(book|appointment|slot|reserve|schedule)\b/i.test(lowerMsg)) {
    return "booking";
  }

  // Complaint keywords
  if (/\b(complaint|problem|issue|bad|worst|terrible|disappointed|refund)\b/i.test(lowerMsg)) {
    return "complaint";
  }

  // Price/service inquiry
  if (/\b(price|rate|cost|charge|kitna|kya milega|service|menu|list)\b/i.test(lowerMsg)) {
    return "inquiry";
  }

  return null; // Let AI decide
}

module.exports = { generateResponse, classifyIntent };
