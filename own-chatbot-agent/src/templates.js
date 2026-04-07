export const templates = {
  real_estate: {
    label: "Real Estate",
    tone: "professional, helpful, and conversion-focused",
    goals: ["capture leads", "answer property questions", "book viewings"],
    questions: [
      "What locations do you serve?",
      "What types of properties do you sell or rent?",
      "What is the main conversion goal: lead, call, or viewing booking?"
    ],
    knowledgeHints: ["property listings", "pricing", "loan guidance", "contact details"]
  },
  ecommerce: {
    label: "Ecommerce",
    tone: "friendly, concise, and sales-oriented",
    goals: ["answer product questions", "recommend products", "reduce support load"],
    questions: [
      "What products do you sell?",
      "What are your shipping and return policies?",
      "What is the main conversion goal: purchase, cart recovery, or support?"
    ],
    knowledgeHints: ["product catalog", "shipping policy", "return policy", "promotions"]
  },
  clinic: {
    label: "Clinic / Healthcare",
    tone: "calm, professional, and reassuring",
    goals: ["book appointments", "answer service questions", "share clinic details"],
    questions: [
      "What services do you offer?",
      "What are your working hours?",
      "Do you want the bot to book appointments or just collect inquiries?"
    ],
    knowledgeHints: ["services", "pricing", "timings", "doctor profiles"]
  },
  saas: {
    label: "SaaS",
    tone: "clear, technical, and support-friendly",
    goals: ["qualify leads", "answer product questions", "support onboarding"],
    questions: [
      "What problem does your product solve?",
      "What plan or pricing info should the bot know?",
      "Should the bot focus on sales, support, or both?"
    ],
    knowledgeHints: ["pricing", "features", "documentation", "onboarding"]
  },
  restaurant: {
    label: "Restaurant",
    tone: "warm, quick, and welcoming",
    goals: ["share menu", "take reservations", "answer timing questions"],
    questions: [
      "What cuisine or specialties do you offer?",
      "Do you want reservation handling or only inquiries?",
      "What are your hours and delivery options?"
    ],
    knowledgeHints: ["menu", "hours", "location", "delivery policy"]
  },
  portfolio: {
    label: "Portfolio / Personal",
    tone: "friendly, professional, and personable",
    goals: ["introduce the person", "answer questions about skills and projects", "encourage contact"],
    questions: [
      "What is your name and role?",
      "What skills or projects should visitors know about?",
      "What should the bot encourage visitors to do (contact, hire, collaborate)?"
    ],
    knowledgeHints: ["skills and technologies", "projects and work", "experience and education", "contact info"]
  },
  generic: {
    label: "General Business",
    tone: "helpful, friendly, and adaptable",
    goals: ["answer website questions", "capture leads", "route complex issues"],
    questions: [
      "What does your business do?",
      "What should the chatbot help with most?",
      "What should it never answer without human help?"
    ],
    knowledgeHints: ["about page", "FAQ", "contact details", "policies"]
  }
};

export function listTemplates() {
  return Object.entries(templates).map(([key, value]) => ({
    key,
    label: value.label
  }));
}
