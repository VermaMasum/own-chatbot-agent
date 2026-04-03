import { templates } from "./templates.js";

export function buildChatbotProfile(answers) {
  const template = templates[answers.businessType] ?? templates.generic;
  const knowledgeSources = compact([
    answers.websiteUrl && `Website: ${answers.websiteUrl}`,
    answers.websiteTitle && `Website title: ${answers.websiteTitle}`,
    answers.websiteSummary && `Website summary: ${answers.websiteSummary}`,
    ...(Array.isArray(answers.websiteChunks)
      ? answers.websiteChunks.map((chunk) => `Chunk: ${chunk.title || chunk.url} - ${chunk.text || ""}`.trim())
      : []),
    ...(Array.isArray(answers.websiteSections)
      ? answers.websiteSections.map((section) => {
          const pieces = [
            section.kind && `kind=${section.kind}`,
            section.role && `role=${section.role}`,
            section.company && `company=${section.company}`,
            section.description && `description=${section.description}`
          ].filter(Boolean);
          return `Section: ${section.title || section.url} - ${pieces.join(", ")}`;
        })
      : []),
    ...(Array.isArray(answers.websitePages)
      ? answers.websitePages.map((page) => `Page: ${page.title || page.url} - ${page.summary || ""}`.trim())
      : []),
    ...(Array.isArray(answers.websiteTopics) && answers.websiteTopics.length
      ? [`Website topics: ${answers.websiteTopics.join(", ")}`]
      : []),
    answers.uploadedDocs && `Uploaded docs: ${answers.uploadedDocs}`,
    ...template.knowledgeHints.map((hint) => `Business knowledge: ${hint}`)
  ]);

  const leadFields = compact([
    answers.capturesName === "yes" && "name",
    answers.capturesEmail === "yes" && "email",
    answers.capturesPhone === "yes" && "phone"
  ]);

  const handoffConditions = compact([
    answers.handoffReason || "The user asks for something outside the knowledge base.",
    "The user requests a human representative.",
    "The bot is uncertain about the answer."
  ]);

  return {
    projectName: answers.projectName || `${template.label} Chatbot`,
    businessType: template.label,
    websiteUrl: answers.websiteUrl || "",
    websiteTitle: answers.websiteTitle || "",
    websiteSummary: answers.websiteSummary || "",
    websitePages: Array.isArray(answers.websitePages) ? answers.websitePages : [],
    websiteSections: Array.isArray(answers.websiteSections) ? answers.websiteSections : [],
    websiteChunks: Array.isArray(answers.websiteChunks) ? answers.websiteChunks : [],
    websiteTopics: Array.isArray(answers.websiteTopics) ? answers.websiteTopics : [],
    tone: answers.tone || template.tone,
    goals: compact([answers.mainGoal, ...template.goals]),
    targetAudience: answers.targetAudience || "website visitors",
    knowledgeSources,
    leadCaptureFields: leadFields,
    handoffConditions,
    allowedTopics: compact([
      answers.allowedTopics,
      "business services",
      "pricing or packages",
      "basic support"
    ]),
    blockedTopics: compact([
      answers.blockedTopics,
      "legal advice",
      "medical diagnosis",
      "financial guarantees"
    ]),
    prompt: buildSystemPrompt({
      projectName: answers.projectName || `${template.label} Chatbot`,
      businessType: template.label,
      tone: answers.tone || template.tone,
      goals: compact([answers.mainGoal, ...template.goals]),
      knowledgeSources,
      handoffConditions,
      leadFields,
      websitePages: answers.websitePages || [],
      websiteSections: answers.websiteSections || [],
      websiteChunks: answers.websiteChunks || [],
      websiteTopics: answers.websiteTopics || []
    })
  };
}

function buildSystemPrompt(profile) {
  return [
    `You are the AI chatbot for ${profile.projectName}.`,
    `Business type: ${profile.businessType}.`,
    `Tone: ${profile.tone}.`,
    `Primary goals: ${profile.goals.join(", ")}.`,
    `Knowledge sources: ${profile.knowledgeSources.join(", ")}.`,
    Array.isArray(profile.websitePages) && profile.websitePages.length
      ? `Website pages: ${profile.websitePages.map((page) => `${page.title || page.url}: ${page.summary || ""}`).join(" | ")}.`
      : "Website pages: none provided.",
    Array.isArray(profile.websiteSections) && profile.websiteSections.length
      ? `Website sections: ${profile.websiteSections.map((section) => `${section.title || section.url}: ${section.role || section.company || section.description || ""}`).join(" | ")}.`
      : "Website sections: none provided.",
    Array.isArray(profile.websiteChunks) && profile.websiteChunks.length
      ? `Website chunks: ${profile.websiteChunks.map((chunk) => `${chunk.title || chunk.url}: ${chunk.text || ""}`).join(" | ")}.`
      : "Website chunks: none provided.",
    Array.isArray(profile.websiteTopics) && profile.websiteTopics.length
      ? `Topics extracted from the website: ${profile.websiteTopics.join(", ")}.`
      : "Topics extracted from the website: none.",
    `Capture lead fields only when useful: ${profile.leadFields.join(", ") || "none"}.`,
    `Hand off to a human when: ${profile.handoffConditions.join(" | ")}.`,
    "Be accurate, concise, and friendly.",
    "If a question cannot be answered confidently, say so and offer a handoff.",
    "Adapt the reply to the user's intent instead of sounding generic."
  ].join("\n");
}

function compact(values) {
  return [...new Set(values.flat ? values.flat().filter(Boolean) : values.filter(Boolean))];
}
