import { templates } from "./templates.js";

// Patterns that indicate a chunk is Three.js/React/WebGL internals rather than real content
const NOISE_PATTERNS = [
  /uniform\s+(mat4|vec3|sampler)/i,
  /attribute\s+(vec3|vec4|mat4)/i,
  /strokeDasharray|strokeDashoffset|strokeLinecap|strokeLinejoin/i,
  /morphTarget|skinIndex|skinWeight|boneTexture|morphTexture/i,
  /colorInterpolation|dominantBaseline|floodColor|glyphName|horizAdvX/i,
  /kernelMatrix|stdDeviation|tableValues|pathLength|startOffset/i,
  /CubemapFromEquirect|BackgroundCubeMaterial|PMREMGGXConvolution|SphericalGaussianBlur|EquirectangularToCubeUV/,
  /bindMatrix|boneTexture|batchingTexture|batchingIdTexture/i,
  /onTapStart|onTapCancel|onPanStart|onPanSessionStart|onPanEnd|onViewportEnter/,
  /LayoutAnimationStart|LayoutAnimationComplete|BeforeLayoutMeasure|LayoutMeasure/,
  /unicodeBidi|unicodeRange|unitsPerEm|vAlphabetic|vHanging|vIdeographic/i
];

function isNoisyChunk(chunk) {
  const text = chunk.text || "";
  return NOISE_PATTERNS.some((p) => p.test(text));
}

export function buildChatbotProfile(answers) {
  const template = templates[answers.businessType] ?? templates.generic;

  // Only keep chunks that are not library-internal noise
  const cleanChunks = Array.isArray(answers.websiteChunks)
    ? answers.websiteChunks.filter((c) => !isNoisyChunk(c))
    : [];

  const knowledgeSources = compact([
    answers.websiteUrl && `Website: ${answers.websiteUrl}`,
    answers.websiteTitle && `Website title: ${answers.websiteTitle}`,
    answers.websiteSummary && `Website summary: ${answers.websiteSummary}`,
    ...cleanChunks.map((chunk) => `Chunk: ${chunk.title || chunk.url} - ${chunk.text || ""}`.trim()),
    ...(Array.isArray(answers.websiteSections)
      ? answers.websiteSections.map((section) => {
          const content = section.text || section.description || section.role || section.company || "";
          return `Section: ${section.title || section.url}${content ? ` — ${content}` : ""}`;
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
      websiteChunks: cleanChunks,
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
      ? `Website sections: ${profile.websiteSections.map((section) => {
          const content = section.text || section.description || section.role || section.company || "";
          return `${section.title || section.url}: ${content}`;
        }).join(" | ")}.`
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
