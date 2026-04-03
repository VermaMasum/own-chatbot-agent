import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChatbotProfile } from "./builder.js";
import { listTemplates } from "./templates.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const rootDir = resolve(__dirname, "..");
const publicDir = resolve(rootDir, "public");

await loadEnvFile(resolve(rootDir, ".env"));

const groqBaseUrl = "https://api.groq.com/openai/v1";
const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const websiteContextCache = new Map();

const port = Number(process.env.PORT || 3000);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/templates") {
      return sendJson(res, 200, { templates: listTemplates() });
    }

    if (req.method === "POST" && url.pathname === "/api/build") {
      const body = await readJsonBody(req);
      const websiteContext = await getWebsiteContext(body.websiteUrl);
      const profile = buildChatbotProfile({
        ...body,
        websiteTitle: websiteContext.title,
        websiteSummary: websiteContext.summary,
        websitePages: websiteContext.pages,
        websiteSections: websiteContext.sections,
        websiteChunks: websiteContext.chunks,
        websiteTopics: websiteContext.topics
      });
      return sendJson(res, 200, profile);
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      const body = await readJsonBody(req);
      const reply = await generateChatReply(body);
      return sendJson(res, 200, reply);
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, () => {
  console.log(`Own Chatbot Agent UI running at http://localhost:${port}`);
});

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(publicDir, `.${safePath}`);

  if (!filePath.startsWith(publicDir)) {
    return sendText(res, 403, "Forbidden");
  }

  try {
    const data = await readFile(filePath);
    return sendFile(res, 200, data, extname(filePath));
  } catch {
    if (safePath !== "/index.html") {
      try {
        const fallback = await readFile(join(publicDir, "index.html"));
        return sendFile(res, 200, fallback, ".html");
      } catch {
        return sendText(res, 404, "Not found");
      }
    }
    return sendText(res, 404, "Not found");
  }
}

function sendFile(res, status, data, ext) {
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  }[ext] || "application/octet-stream";

  res.writeHead(status, { "Content-Type": type });
  res.end(data);
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function loadEnvFile(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // No local .env file yet.
  }
}

async function generateChatReply(body) {
  const profile = body.profile || {};
  const userMessage = String(body.message || "").trim();
  const history = Array.isArray(body.conversation) ? body.conversation : [];
  const allChunks = Array.isArray(profile.websiteChunks) ? profile.websiteChunks : [];
  const allSections = Array.isArray(profile.websiteSections) ? profile.websiteSections : [];
  const relevantChunks = selectRelevantChunks(allChunks, userMessage);
  const relevantSections = selectRelevantSections(allSections, userMessage);
  const directAnswer =
    inferDirectAnswerFromSections(relevantSections.length ? relevantSections : allSections, userMessage) ||
    inferDirectAnswerFromChunks(relevantChunks.length ? relevantChunks : allChunks, userMessage);
  const websiteContext = formatWebsiteContext(
    relevantSections.length ? relevantSections : allSections.slice(0, 30),
    relevantChunks.length ? relevantChunks : allChunks.slice(0, 50)
  );

  if (!userMessage) {
    return { reply: "Please type a message first." };
  }

  if (!process.env.GROQ_API_KEY) {
    if (directAnswer) {
      return { reply: directAnswer, provider: "retrieval" };
    }
    return { reply: fallbackReply(userMessage, profile, relevantChunks) };
  }

  try {
    const messages = [
      {
        role: "system",
        content: buildChatSystemPrompt(profile, websiteContext)
      },
      ...history
        .filter((item) => item && typeof item.role === "string" && typeof item.content === "string")
        .slice(-10)
        .map((item) => ({
          role: item.role,
          content: item.content
        })),
      {
        role: "user",
        content: userMessage
      }
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${groqBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: groqModel,
        messages,
        temperature: 0.7,
        max_tokens: 800
      })
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      return {
        reply: fallbackReply(userMessage, profile, relevantChunks),
        error: `Groq request failed with status ${response.status}`,
        provider: "fallback"
      };
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return {
        reply: fallbackReply(userMessage, profile, relevantChunks),
        error: "Groq returned an empty response",
        provider: "fallback"
      };
    }

    return { reply, provider: "groq" };
  } catch (error) {
    return {
      reply: fallbackReply(userMessage, profile, relevantChunks),
      error: error?.message || "Groq request failed",
      provider: "fallback"
    };
  }
}

function buildChatSystemPrompt(profile, websiteContext = "") {
  const projectName = profile.projectName || "Website Assistant";
  const businessType = profile.businessType || "General Business";
  const tone = profile.tone || "friendly and professional";
  const goals = Array.isArray(profile.goals) ? profile.goals.join(", ") : "answer website questions";
  const knowledgeSources = Array.isArray(profile.knowledgeSources) ? profile.knowledgeSources.join(", ") : "website content";
  const allowedTopics = Array.isArray(profile.allowedTopics) ? profile.allowedTopics.join(", ") : "services, pricing, support";
  const blockedTopics = Array.isArray(profile.blockedTopics) ? profile.blockedTopics.join(", ") : "legal, medical, financial advice";
  const handoffConditions = Array.isArray(profile.handoffConditions) ? profile.handoffConditions.join(" | ") : "uncertain answers";

  return [
    `You are the chatbot for ${projectName}.`,
    `Business type: ${businessType}.`,
    `Tone: ${tone}.`,
    `Main goals: ${goals}.`,
    `Knowledge sources available: ${knowledgeSources}.`,
    `Allowed topics: ${allowedTopics}.`,
    `Blocked topics: ${blockedTopics}.`,
    `Hand off to a human when: ${handoffConditions}.`,
    websiteContext ? `Website excerpts:\n${websiteContext}` : "Website excerpts: none provided.",
    "Provide accurate, direct, and factual answers based strictly on the website excerpts.",
    "Do NOT add conversational fluff or human-like filler words.",
    "When the question asks about a role, position, project, skill, or contact detail, quote the exact website excerpt directly.",
    "Do not mention that you are an AI model.",
    "If the answer cannot be found in the website excerpts, reply exactly with: 'I do not have that information at this time.'"
  ].join("\n");
}

function fallbackReply(message, profile, relevantChunks = []) {
  const text = message.toLowerCase();
  const projectName = profile.projectName || "this business";
  const goals = Array.isArray(profile.goals) ? profile.goals : [];
  const websiteUrl = profile.websiteUrl ? ` I can tailor the answers more once the website content is connected from ${profile.websiteUrl}.` : "";
  const websiteAnswer = buildAnswerFromChunks(relevantChunks, text);

  if (websiteAnswer) {
    return websiteAnswer;
  }

  if (containsAny(text, ["price", "pricing", "cost", "fee", "charge"])) {
    return `I can help with pricing for ${projectName}. If you want the chatbot to answer exact prices, connect the price page or upload the pricing details.${websiteUrl}`;
  }

  if (containsAny(text, ["book", "booking", "appointment", "visit", "demo", "call", "reserve"])) {
    return `Yes, I can help with bookings and lead capture for ${projectName}. I would collect the visitor's details and pass the lead to your team.${websiteUrl}`;
  }

  if (containsAny(text, ["hours", "open", "timing", "timings", "today", "working"])) {
    return `I can answer hours once the business hours are provided. Right now I only know the chatbot setup, not the live schedule.${websiteUrl}`;
  }

  if (containsAny(text, ["service", "services", "offer", "menu", "product", "features"])) {
    return `I can help with the main topics for ${projectName}: ${goals.slice(0, 3).join(", ") || "website support"}. For exact details, connect the website pages or FAQ.${websiteUrl}`;
  }

  if (containsAny(text, ["contact", "phone", "email", "reach", "support"])) {
    return `Yes, I can capture contact details and route the conversation to a human when needed. That is useful for ${projectName}.${websiteUrl}`;
  }

  return `I am set up to help with ${goals.slice(0, 3).join(", ") || "website questions"} for ${projectName}. If you want a smarter response, connect the live website content and an API key.${websiteUrl}`;
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function selectRelevantChunks(chunks, query, limit = 40) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  const scored = chunks
    .map((chunk) => {
      const text = [chunk.title, chunk.url, chunk.text].filter(Boolean).join(" ").toLowerCase();
      let score = 0;
      for (const token of queryTokens) {
        if (text.includes(token)) score += token.length >= 6 ? 2 : 1;
      }
      if (/experience|work|career|job/.test(query.toLowerCase()) && /experience|work|career/.test(text)) {
        score += 5;
      }
      if (/project|projects|portfolio/.test(query.toLowerCase()) && /project|portfolio/.test(text)) {
        score += 5;
      }
      if (/contact|email|phone|reach/.test(query.toLowerCase()) && /contact/.test(text)) {
        score += 5;
      }
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((item) => item.chunk);
}

function selectRelevantSections(sections, query, limit = 30) {

  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  const queryLower = query.toLowerCase();
  const scored = sections
    .map((section) => {
      const text = [
        section.kind,
        section.role,
        section.company,
        section.title,
        section.subtitle,
        section.description,
        section.text
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      let score = 0;
      for (const token of queryTokens) {
        if (text.includes(token)) score += token.length >= 6 ? 2 : 1;
      }

      if (/experience|work|career|job|role/.test(queryLower) && /experience|role|career|job|work/.test(text)) {
        score += 6;
      }
      if (/project|projects|portfolio|built|made/.test(queryLower) && /project|portfolio/.test(text)) {
        score += 5;
      }
      if (/contact|email|phone|reach/.test(queryLower) && /contact/.test(text)) {
        score += 5;
      }

      return { section, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((item) => item.section);
}

function buildAnswerFromChunks(chunks, query) {
  if (!chunks.length) return "";

  const first = chunks[0];
  const text = cleanText(first.text || "");
  if (!text) return "";

  if (/experience|work|career|job/.test(query)) {
    return `From the experience page: ${limitText(text, 420)}`;
  }

  if (/project|projects|portfolio/.test(query)) {
    return `From the portfolio site: ${limitText(text, 420)}`;
  }

  if (/contact|email|phone|reach/.test(query)) {
    return `From the contact page: ${limitText(text, 320)}`;
  }

  return `From the website: ${limitText(text, 360)}`;
}

function inferDirectAnswerFromChunks(chunks, query) {
  if (!chunks.length) return "";

  const normalizedQuery = String(query || "").toLowerCase();
  const needsRoleAnswer = /position|role|job|current role|current position|experience|work/.test(normalizedQuery);
  const needsProjectAnswer = /project|projects|portfolio|built|made/.test(normalizedQuery);
  const needsContactAnswer = /contact|email|phone|reach/.test(normalizedQuery);

  for (const chunk of chunks) {
    const text = cleanText(chunk.text || "");
    const title = cleanText(chunk.title || "");
    const source = `${title} ${text}`;

    if (needsContactAnswer) {
      const contactMatch = source.match(/(?:email|phone|contact|reach)[^.\n]{0,120}/i);
      if (contactMatch) {
        return `From the contact section: ${limitText(contactMatch[0], 240)}`;
      }
    }

    if (needsRoleAnswer) {
      const roleMatch = source.match(/([A-Z][A-Za-z0-9,&.\-()\/ ]{2,80})\s+[—-]\s+([A-Z][A-Za-z0-9,&.\-()\/ ]{2,80})/);
      if (roleMatch) {
        return `From the experience page: ${roleMatch[1].trim()} — ${roleMatch[2].trim()}`;
      }

      const roleLine = source.match(/(?:full stack developer|software engineer|frontend developer|backend developer|intern|developer|engineer)[^.\n]{0,120}/i);
      if (roleLine) {
        return `From the experience page: ${limitText(roleLine[0], 240)}`;
      }
    }

    if (needsProjectAnswer) {
      const projectLine = source.match(/(?:project|portfolio|built|created|developed)[^.\n]{0,160}/i);
      if (projectLine) {
        return `From the project section: ${limitText(projectLine[0], 260)}`;
      }
    }
  }

  return "";
}

function inferDirectAnswerFromSections(sections, query) {
  if (!sections.length) return "";

  const normalizedQuery = String(query || "").toLowerCase();
  const wantsRole = /position|role|job|current role|current position|experience|work/.test(normalizedQuery);
  const wantsCompany = /company|worked at|worked with|employer|organization|where did/.test(normalizedQuery);
  const wantsDescription = /describe|what did|details|about the role|responsibilities|did he do|did she do/.test(normalizedQuery);
  const wantsProject = /project|projects|portfolio|built|made/.test(normalizedQuery);
  const wantsContact = /contact|email|phone|reach/.test(normalizedQuery);

  for (const section of sections) {
    if (wantsContact && (section.kind === "contact" || /contact/.test(section.title || section.text || ""))) {
      return formatSectionAnswer(section, "contact");
    }

    if (wantsRole && (section.kind === "experience" || section.role || section.company)) {
      return formatSectionAnswer(section, "role");
    }

    if (wantsCompany && section.company) {
      return formatSectionAnswer(section, "company");
    }

    if (wantsDescription && section.description) {
      return formatSectionAnswer(section, "description");
    }

    if (wantsProject && (section.kind === "project" || /project|portfolio/.test(`${section.title || ""} ${section.text || ""}`.toLowerCase()))) {
      return formatSectionAnswer(section, "project");
    }
  }

  return "";
}

function formatSectionAnswer(section, mode = "role") {
  const role = cleanText(section.role || "");
  const company = cleanText(section.company || "");
  const title = cleanText(section.title || "");
  const description = cleanText(section.description || section.text || "");

  if (mode === "contact") {
    return `From the contact section: ${limitText(description || title, 260)}`;
  }

  if (mode === "project") {
    return `From the project section: ${limitText(description || title, 280)}`;
  }

  if (mode === "description") {
    const parts = [];
    if (role) parts.push(`role ${role}`);
    if (company) parts.push(`company ${company}`);
    if (description) parts.push(`description ${limitText(description, 220)}`);
    if (!parts.length && title) parts.push(title);
    return `From the experience page: ${parts.join(", ")}`;
  }

  if (mode === "company") {
    const parts = [];
    if (company) parts.push(`company ${company}`);
    if (role) parts.push(`role ${role}`);
    if (description) parts.push(`description ${limitText(description, 220)}`);
    if (!parts.length && title) parts.push(title);
    return `From the experience page: ${parts.join(", ")}`;
  }

  const pieces = [];
  if (role) pieces.push(`role ${role}`);
  if (company) pieces.push(`company ${company}`);
  if (!pieces.length && title) pieces.push(title);
  if (description) pieces.push(limitText(description, 220));

  return `From the experience page: ${pieces.join(", ")}`;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3)
    .slice(0, 24);
}

function formatWebsiteContext(sections = [], chunks = []) {
  const lines = [];

  for (const section of sections) {
    const title = section.title || section.role || section.company || section.url || "Website section";
    const parts = [];
    if (section.kind) parts.push(`kind: ${section.kind}`);
    if (section.role) parts.push(`role: ${section.role}`);
    if (section.company) parts.push(`company: ${section.company}`);
    if (section.description) parts.push(`description: ${limitText(cleanText(section.description), 260)}`);
    if (!parts.length && section.text) parts.push(limitText(cleanText(section.text), 260));
    lines.push(`- ${title}: ${parts.join(" | ")}`);
  }

  for (const chunk of chunks) {
    const title = chunk.title || chunk.url || "Website page";
    const text = limitText(cleanText(chunk.text || ""), 700);
    lines.push(`- ${title}: ${text}`);
  }

  return lines.join("\n");
}

async function fetchWebsiteContext(websiteUrl) {
  const empty = { title: "", summary: "", pages: [], sections: [], chunks: [], topics: [] };

  const normalizedUrl = normalizeWebsiteUrl(websiteUrl);
  if (!normalizedUrl) {
    return empty;
  }

  let browser = null;
  try {
    browser = await openPuppeteerBrowser();
    const homepage = await fetchPage(normalizedUrl.toString(), browser);
    if (!homepage || isNotFoundPage(homepage)) {
      return empty;
    }

    const candidates = await collectWebsiteCandidates(normalizedUrl, homepage);
    const pages = [homepage];
    
    // Process up to 25 candidates in batches of 5 to avoid overwhelming the browser
    const candidatesToProcess = candidates.slice(0, 25);
    for (let i = 0; i < candidatesToProcess.length; i += 5) {
      const batch = candidatesToProcess.slice(i, i + 5);
      const pageFetches = batch.map((url) => fetchPage(url, browser));
      const fetchedPages = await Promise.all(pageFetches);
      for (const page of fetchedPages) {
        if (page && !isNotFoundPage(page)) pages.push(page);
      }
    }

    const navigatedPages = await crawlRenderedNavigation(normalizedUrl, browser);
    for (const page of navigatedPages) {
      if (page && !isNotFoundPage(page)) pages.push(page);
    }

    const uniquePages = dedupePages(pages);

    const title = uniquePages.find((page) => page.title)?.title || homepage.title;
    const summary = buildCombinedWebsiteSummary(uniquePages);
    const topics = extractTopicsFromPages(uniquePages);
    const chunks = buildWebsiteChunks(uniquePages);
    const sections = uniquePages.flatMap((page) => Array.isArray(page.sections) ? page.sections : []);

    if (browser) {
      await browser.close().catch(() => {});
    }

    return {
      title,
      summary,
      pages: uniquePages.map((page) => ({
        url: page.url,
        title: page.title,
        summary: page.summary
      })),
      sections,
      chunks,
      topics
    };
  } catch {
    return empty;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function getWebsiteContext(websiteUrl) {
  const normalizedUrl = normalizeWebsiteUrl(websiteUrl);
  const key = normalizedUrl ? normalizedUrl.toString() : "";
  if (!key) {
    return { title: "", summary: "", pages: [], sections: [], chunks: [], topics: [] };
  }

  const cached = websiteContextCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now && isValidWebsiteContext(cached.value)) {
    return cached.value;
  }

  if (cached) {
    websiteContextCache.delete(key);
  }

  const value = await fetchWebsiteContext(key);
  websiteContextCache.set(key, {
    value,
    expiresAt: now + 15 * 60 * 1000
  });

  return value;
}

async function collectWebsiteCandidates(baseUrl, homepage) {
  const candidates = new Set();

  for (const url of discoverRelevantUrls(baseUrl, homepage)) {
    if (!isSkippableAssetUrl(url)) {
      candidates.add(url);
    }
  }
  for (const url of await discoverSitemapUrls(baseUrl)) {
    if (!isSkippableAssetUrl(url)) {
      candidates.add(url);
    }
  }

  for (const url of discoverLikelyRoutes(baseUrl)) {
    if (!isSkippableAssetUrl(url)) {
      candidates.add(url);
    }
  }

  return [...candidates].filter(Boolean);
}

async function crawlRenderedNavigation(baseUrl, browser) {
  if (!browser) {
    return [];
  }

  const page = await browser.newPage({
    viewport: { width: 1440, height: 2200 },
    userAgent: "Mozilla/5.0 (compatible; OwnChatbotAgent/1.0)"
  });

  const pages = [];
  const seen = new Set();

  try {
    try {
      await page.goto(baseUrl.toString(), { waitUntil: "networkidle", timeout: 20000 });
    } catch {
      try {
        await page.goto(baseUrl.toString(), { waitUntil: "load", timeout: 15000 });
      } catch {
        // proceed and try to read whatever loaded
      }
    }
    await new Promise(resolve => setTimeout(resolve, 3000));

    const homepage = await loadRenderedPageFromCurrentState(page, baseUrl.toString());
    if (!homepage) {
      return [];
    }

    addUniqueRenderedPage(pages, seen, homepage);

    const labels = ["experience", "projects", "skills", "education", "certifications", "contact", "about", "portfolio", "resume"];

    for (const label of labels) {
      const clicked = await clickRenderedNavigation(page, label);
      if (!clicked) continue;

      await new Promise(resolve => setTimeout(resolve, 4000));
      const state = await loadRenderedPageFromCurrentState(page, page.url());
      addUniqueRenderedPage(pages, seen, state);
    }
  } catch {
    // ignore navigation crawl failures
  } finally {
    await page.close().catch(() => {});
  }

  return pages;
}

async function clickRenderedNavigation(page, label) {
  const selectors = ["a", "button", "[role='button']", "li", "span", "div"];

  for (const selector of selectors) {
    const clicked = await page.evaluate((sel, exactStr, fuzzyStr) => {
      const exactRe = new RegExp(exactStr, "i");
      const fuzzyRe = new RegExp(fuzzyStr, "i");
      const els = Array.from(document.querySelectorAll(sel));
      
      for (const el of els) {
        if (exactRe.test(el.textContent)) {
          el.click();
          return true;
        }
      }
      for (const el of els) {
        if (fuzzyRe.test(el.textContent)) {
          el.click();
          return true;
        }
      }
      return false;
    }, selector, `^\\s*${escapeRegExp(label)}\\s*$`, escapeRegExp(label));
    
    if (clicked) return true;
  }

  return false;
}

async function loadRenderedPageFromCurrentState(page, url) {
  try {
    const html = await page.content();
    const details = extractWebsiteContextFromHtml(html, page.url() || url);
    if (isNotFoundPage(details)) {
      return null;
    }
    return {
      url: page.url() || url,
      html,
      ...details
    };
  } catch {
    return null;
  }
}

function addUniqueRenderedPage(pages, seen, page) {
  if (!page || isNotFoundPage(page)) return;
  const key = [page.url, page.title, page.summary].map((value) => cleanText(value || "")).join(" | ");
  if (!key || seen.has(key)) return;
  seen.add(key);
  pages.push(page);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchPage(url, browser = null) {
  if (isSkippableAssetUrl(url)) {
    return null;
  }

  try {
    const rendered = await fetchRenderedPage(url, browser);
    if (rendered) {
      return rendered;
    }

    return await fetchStaticPage(url);
  } catch {
    return null;
  }
}

async function openPuppeteerBrowser() {
  const puppeteer = await loadPuppeteer();
  if (!puppeteer) {
    return null;
  }

  try {
    return await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch {
    return null;
  }
}

async function fetchRenderedPage(url, browser = null) {
  if (!browser) {
    return null;
  }

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 2200 },
      userAgent: "Mozilla/5.0 (compatible; OwnChatbotAgent/1.0)"
    });

    let response;
    try {
      response = await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    } catch {
      try {
        response = await page.goto(url, { waitUntil: "load", timeout: 10000 });
      } catch {
        // proceed anyway
      }
    }

    await new Promise(resolve => setTimeout(resolve, 4000)); // Wait for 3D/SPA animations and fetches

    const contentType = String(response?.headers()?.["content-type"] || "").toLowerCase();
    const currentUrl = String(page.url() || url).toLowerCase();

    if (
      currentUrl.endsWith(".pdf") ||
      contentType.includes("application/pdf") ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("application/zip")
    ) {
      await page.close().catch(() => {});
      return null;
    }

    const data = await page.evaluate(() => {
      const title = document.title || "";
      const description = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
      const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 12);
      const text = (document.body?.innerText || document.documentElement?.innerText || "")
        .replace(/\s+/g, " ")
        .trim();
      const links = Array.from(document.querySelectorAll("a[href]"))
        .map((a) => ({
          href: a.href || "",
          text: (a.textContent || "").trim()
        }))
        .filter((link) => link.href);

      return {
        title,
        description,
        headings,
        text,
        links,
        sections: extractStructuredSections(),
        html: document.documentElement.outerHTML
      };

      function extractStructuredSections() {
        const root = document.querySelector("main") || document.body || document.documentElement;
        const candidates = Array.from(
          root.querySelectorAll(
            "section, article, li, [class*='card'], [class*='experience'], [class*='project'], [class*='skill'], [class*='education'], [class*='contact'], [class*='certificat']"
          )
        );
        const seen = new Set();
        const sections = [];

        for (const el of candidates) {
          if (!isVisible(el)) continue;
          if (el.closest("nav, header, footer, aside")) continue;

          const rawText = cleanInline(el.innerText || el.textContent || "");
          if (rawText.length < 40 || rawText.length > 1200) continue;
          if (/^(home|experience|projects|skills|education|certifications|contact)$/i.test(rawText)) continue;

          const headingTexts = Array.from(el.querySelectorAll("h1, h2, h3, h4, strong, b"))
            .map((node) => cleanInline(node.textContent || ""))
            .filter(Boolean);
          const heading = headingTexts[0] || "";
          const [primary, secondary] = splitTitle(heading || rawText);
          const paragraphTexts = Array.from(el.querySelectorAll("p, li, [class*='desc'], [class*='text'], [class*='content']"))
            .map((node) => cleanInline(node.textContent || ""))
            .filter((value) => value && value.length > 15 && !/^(view resume|download|view|read more|learn more)$/i.test(value));
          const linkTexts = Array.from(el.querySelectorAll("a[href], button"))
            .map((node) => cleanInline(node.textContent || ""))
            .filter((value) => value && !/^(view resume|download|view|read more|learn more)$/i.test(value));

          const description = cleanInline(paragraphTexts.join(" ")) || cleanInline(
            rawText
              .replace(heading, "")
              .replace(/view resume|download|read more|learn more/gi, " ")
          );

          const kind = inferSectionKind(el, primary, description);
          const role = extractRoleName(primary, secondary, description, kind);
          const company = extractCompanyName(primary, secondary, description, kind, role);
          const normalized = cleanInline([kind, role, company, description].filter(Boolean).join(" "));
          if (!normalized || seen.has(normalized)) continue;
          seen.add(normalized);

          sections.push({
            kind,
            title: primary || heading || rawText.slice(0, 80),
            subtitle: secondary || "",
            role,
            company,
            description: description || rawText,
            text: normalized,
            links: linkTexts.slice(0, 4)
          });
        }

        return sections.slice(0, 40);
      }

      function isVisible(el) {
        const style = window.getComputedStyle(el);
        return style && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
      }

      function cleanInline(value) {
        return String(value || "")
          .replace(/\s+/g, " ")
          .replace(/[\u200B-\u200D\uFEFF]/g, "")
          .trim();
      }

      function splitTitle(value) {
        const text = cleanInline(value);
        if (!text) return ["", ""];
        const separators = [" — ", " - ", " | ", " / ", " : "];
        for (const separator of separators) {
          if (text.includes(separator)) {
            const [first, ...rest] = text.split(separator);
            return [cleanInline(first), cleanInline(rest.join(separator))];
          }
        }
        return [text, ""];
      }

      function inferSectionKind(el, title, description) {
        const blob = `${el.className || ""} ${title || ""} ${description || ""}`.toLowerCase();
        if (/experience|work|career|intern|developer|engineer/.test(blob)) return "experience";
        if (/project|portfolio|built|created|developed/.test(blob)) return "project";
        if (/skill|stack|tech|technology/.test(blob)) return "skill";
        if (/education|school|college|university|degree/.test(blob)) return "education";
        if (/certif|award/.test(blob)) return "certification";
        if (/contact|email|phone|reach/.test(blob)) return "contact";
        return "section";
      }

      function extractRoleName(primary, secondary, description, kind) {
        if (kind !== "experience") return "";
        const candidates = [primary, secondary, description].filter(Boolean);
        for (const candidate of candidates) {
          const match = candidate.match(/(?:full stack developer|software engineer|frontend developer|backend developer|developer|engineer|intern)[^,.;\n]*/i);
          if (match) return cleanInline(match[0]);
        }
        if (primary) return cleanInline(primary);
        return "";
      }

      function extractCompanyName(primary, secondary, description) {
        const combined = [primary, secondary, description].filter(Boolean).join(" ");
        const companyPatterns = [
          /(?:at|@|for)\s+([A-Z][A-Za-z0-9&.\-() ]{2,80})/i,
          /([A-Z][A-Za-z0-9&.\-() ]{2,80})\s+[—\-|]\s+(?:full stack developer|software engineer|frontend developer|backend developer|developer|engineer|intern)/i
        ];
        for (const pattern of companyPatterns) {
          const match = combined.match(pattern);
          if (match && match[1]) return cleanInline(match[1]);
        }
        return "";
      }
    });

    const renderedText = cleanText(data.text || "");
    if (looksLikeBinaryText(renderedText) || hasPdfNoise(renderedText)) {
      await page.close().catch(() => {});
      return null;
    }

    if (isNotFoundText(data.title, renderedText)) {
      await page.close().catch(() => {});
      return null;
    }

    return {
      url,
      html: data.html || "",
      title: cleanText(data.title || ""),
      description: cleanText(data.description || ""),
      headings: Array.isArray(data.headings) ? data.headings.map(cleanText).filter(Boolean) : [],
      text: renderedText.length > 50 ? renderedText : cleanText(
        (data.html || "")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
      ),
      summary: limitText(
        [data.title, data.description, ...(Array.isArray(data.headings) ? data.headings : []), data.text]
          .filter(Boolean)
          .join(" "),
        8000
      ),
      links: Array.isArray(data.links)
        ? data.links
            .map((link) => ({
              href: link.href,
              text: cleanText(link.text || "")
            }))
            .filter((link) => link.href)
        : [],
      sections: Array.isArray(data.sections)
        ? data.sections
            .map((section) => normalizeSection(section, url))
            .filter(Boolean)
        : []
    };
  } catch {
    return null;
  }
}

async function fetchStaticPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; OwnChatbotAgent/1.0)"
    },
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    return null;
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml+xml") &&
    !contentType.includes("text/plain")
  ) {
    return null;
  }

  const html = await response.text();
  if (looksLikeBinaryText(html)) {
    return null;
  }
  if (hasPdfNoise(html)) {
    return null;
  }

  const details = extractWebsiteContextFromHtml(html, url);
  if (isNotFoundPage(details)) {
    return null;
  }
  return {
    url,
    html,
    ...details
  };
}

function extractWebsiteContextFromHtml(html, url = "") {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = cleanText(titleMatch?.[1] || "");
  const descriptionMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i)
    || html.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i);
  const description = cleanText(descriptionMatch?.[1] || "");
  const headingMatches = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].slice(0, 8);
  const headings = headingMatches.map((match) => cleanText(match[1])).filter(Boolean);

  const bodyText = cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );

  return {
    title,
    description,
    headings,
    text: bodyText,
    summary: limitText(
      [description, headings.join(". "), bodyText].filter(Boolean).join(" "),
      900
    ),
    url,
    links: extractLinksFromHtml(html, url),
    sections: extractSectionsFromHtml(html, url)
  };
}

function extractLinksFromHtml(html, baseUrl) {
  const links = [];

  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1].trim();
    const text = cleanText(match[2]);

    try {
      const resolved = new URL(href, baseUrl);
      links.push({
        href: resolved.toString(),
        text
      });
    } catch {
      // ignore invalid links
    }
  }

  return links;
}

function discoverRelevantUrls(baseUrl, source) {
  const keywords = [
    "about", "service", "services", "pricing", "price", "plan",
    "faq", "contact", "portfolio", "product", "products",
    "solution", "solutions", "features", "experience", "work",
    "projects", "resume", "testimonials", "blog", "articles",
    "news", "resources", "docs", "documentation", "support"
  ];
  
  const keywordLinks = new Set();
  const otherLinks = new Set();

  const sourceLinks = Array.isArray(source?.links) ? source.links : [];

  for (const link of sourceLinks) {
    const href = String(link.href || "");
    const text = cleanText(link.text || "").toLowerCase();
    const haystack = `${href} ${text}`;

    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.origin === baseUrl.origin && !resolved.hash) {
        if (keywords.some((keyword) => haystack.includes(keyword))) {
          keywordLinks.add(resolved.toString());
        } else {
          otherLinks.add(resolved.toString());
        }
      }
    } catch {
      // ignore invalid links
    }
  }

  return [...keywordLinks, ...otherLinks];
}


function discoverLikelyRoutes(baseUrl) {
  const routes = [
    "/experience",
    "/projects",
    "/skills",
    "/education",
    "/certifications",
    "/contact",
    "/about",
    "/portfolio"
  ];

  return routes.map((route) => new URL(route, baseUrl).toString());
}

async function discoverSitemapUrls(baseUrl) {
  const candidates = new Set();
  const rootSitemaps = [
    new URL("/sitemap.xml", baseUrl).toString(),
    new URL("/sitemap_index.xml", baseUrl).toString()
  ];

  const robotsUrl = new URL("/robots.txt", baseUrl).toString();

  try {
    const robotsResponse = await fetch(robotsUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OwnChatbotAgent/1.0)" }
    });

    if (robotsResponse.ok) {
      const robotsText = await robotsResponse.text();
      for (const match of robotsText.matchAll(/^sitemap:\s*(.+)$/gim)) {
        const sitemapValue = match[1].trim();
        try {
          candidates.add(new URL(sitemapValue, baseUrl).toString());
        } catch {
          // ignore invalid sitemap entries
        }
      }
    }
  } catch {
    // ignore robots failures
  }

  for (const sitemapUrl of [...candidates, ...rootSitemaps]) {
    const urls = await parseSitemapUrls(sitemapUrl, baseUrl.origin);
    for (const url of urls) {
      candidates.add(url);
    }
  }

  return [...candidates].filter(Boolean);
}

async function parseSitemapUrls(sitemapUrl, origin) {
  try {
    const response = await fetch(sitemapUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OwnChatbotAgent/1.0)" }
    });

    if (!response.ok) {
      return [];
    }

    const xml = await response.text();
    const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => match[1].trim());

    const pageUrls = [];
    const sitemapUrls = [];

    for (const loc of locs) {
      try {
        const parsed = new URL(loc, sitemapUrl);
        if (parsed.origin !== origin) continue;

        if (/sitemap/i.test(loc)) {
          sitemapUrls.push(parsed.toString());
        } else {
          pageUrls.push(parsed.toString());
        }
      } catch {
        // ignore invalid URLs
      }
    }

    if (sitemapUrls.length) {
      for (const nestedSitemap of sitemapUrls.slice(0, 3)) {
        const nestedUrls = await parseSitemapUrls(nestedSitemap, origin);
        pageUrls.push(...nestedUrls);
      }
    }

    return pageUrls;
  } catch {
    return [];
  }
}

function buildCombinedWebsiteSummary(pages) {
  const parts = [];

  for (const page of pages) {
    const pageLabel = page.title || page.url;
    const pageSummary = page.summary || page.description || page.headings?.join(", ") || "";
    if (pageSummary) {
      parts.push(`${pageLabel}: ${pageSummary}`);
    }
  }

  return limitText(parts.join(" | "), 6000);
}

function dedupePages(pages) {
  const seen = new Set();
  const unique = [];

  for (const page of pages) {
    const key = [
      cleanText(page?.url || ""),
      cleanText(page?.title || ""),
      cleanText(page?.summary || ""),
      cleanText(page?.text || "").slice(0, 120)
    ].join(" | ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(page);
  }

  return unique;
}

function buildWebsiteChunks(pages) {
  return pages
    .flatMap((page) => {
      const sectionChunks = Array.isArray(page.sections)
        ? page.sections.map((section) => ({
            url: page.url,
            title: section.title || section.role || page.title || page.url,
            text: cleanText(
              [
                section.kind,
                section.role,
                section.company,
                section.subtitle,
                section.description,
                ...(section.links || [])
              ]
                .filter(Boolean)
                .join(" ")
            ),
            role: section.role || "",
            company: section.company || "",
            kind: section.kind || "section",
            description: section.description || ""
          }))
        : [];

      const text = cleanText(
        [
          page.title,
          page.description,
          ...(page.headings || []),
          page.text || page.summary
        ]
          .filter(Boolean)
          .join(" ")
      );

      if (!text || looksLikeBinaryText(text) || hasPdfNoise(text)) {
        return sectionChunks;
      }

      if (isNotFoundText(page.title, text)) {
        return sectionChunks;
      }

      const chunks = chunkText(text, 1200, 180);
      const textChunks = chunks.map((chunk, index) => ({
        url: page.url,
        title: `${page.title || page.url}${chunks.length > 1 ? ` (part ${index + 1})` : ""}`,
        text: chunk
      }));

      return [...sectionChunks, ...textChunks];
    })
    .filter(Boolean);
}

function chunkText(text, size = 1200, overlap = 160) {
  const chunks = [];
  const source = String(text || "").trim();
  if (!source) return chunks;

  let start = 0;
  while (start < source.length) {
    const end = Math.min(source.length, start + size);
    chunks.push(source.slice(start, end).trim());
    if (end >= source.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

function extractTopicsFromPages(pages) {
  const tokens = new Set();
  const blacklist = new Set([
    "the", "and", "for", "with", "that", "from", "this", "your", "are", "our", "you", "can",
    "is", "to", "of", "in", "a", "an", "on", "we", "it", "as", "be", "or", "by", "at", "have",
    "has", "not", "all", "more", "about", "contact", "home", "page", "website", "services"
  ]);

  for (const page of pages) {
    const text = [page.title, page.description, ...(page.headings || []), page.summary]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    for (const word of text.split(/[^a-z0-9]+/g)) {
      if (word.length < 4 || blacklist.has(word)) continue;
      tokens.add(word);
      if (tokens.size >= 18) break;
    }

    if (tokens.size >= 18) break;
  }

  return [...tokens];
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWebsiteUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw) ? raw : `https://${raw.replace(/^\/\//, "")}`;

  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function limitText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

let puppeteerLoadPromise;

async function loadPuppeteer() {
  if (!puppeteerLoadPromise) {
    puppeteerLoadPromise = import("puppeteer")
      .then((module) => module.default || module)
      .catch(() => null);
  }

  return puppeteerLoadPromise;
}

function isSkippableAssetUrl(url) {
  const clean = String(url || "").toLowerCase().split("?")[0];
  return /\.(pdf|png|jpe?g|gif|webp|svg|zip|rar|7z|mp4|mov|mp3|wav|css|js|json|xml)$/i.test(clean);
}

function looksLikeBinaryText(text) {
  const sample = String(text || "").slice(0, 5000);
  if (!sample) return false;
  if (sample.includes("%PDF-")) return true;

  const controlChars = (sample.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
  return controlChars > Math.max(12, sample.length * 0.03);
}

function hasPdfNoise(text) {
  const sample = String(text || "").slice(0, 8000);
  return /(?:\bendstream\b|\bendobj\b|\bxref\b|\btrailer\b|\bstartxref\b|\b%%EOF\b|\bstream\b)/i.test(sample);
}

function isValidWebsiteContext(context) {
  if (!context || typeof context !== "object") return false;

  const summary = String(context.summary || "");
  if (looksLikeBinaryText(summary) || hasPdfNoise(summary)) {
    return false;
  }

  const pages = Array.isArray(context.pages) ? context.pages : [];
  const sections = Array.isArray(context.sections) ? context.sections : [];
  if (pages.length <= 1 && sections.length === 0) {
    return false;
  }

  const chunks = Array.isArray(context.chunks) ? context.chunks : [];
  return chunks.every((chunk) => {
    const text = String(chunk?.text || "");
    return text && !looksLikeBinaryText(text) && !hasPdfNoise(text);
  });
}

function isNotFoundPage(page) {
  if (!page) return true;
  return isNotFoundText(page.title, [page.summary, page.text, page.description].filter(Boolean).join(" "));
}

function isNotFoundText(title, text) {
  const combined = `${title || ""} ${text || ""}`.toLowerCase();
  return (
    combined.includes("404") ||
    combined.includes("not_found") ||
    combined.includes("not found") ||
    combined.includes("page not found") ||
    combined.includes("read our documentation to learn more about this error")
  );
}

function normalizeSection(section, url) {
  if (!section || typeof section !== "object") return null;
  const title = cleanText(section.title || "");
  const subtitle = cleanText(section.subtitle || "");
  const role = cleanText(section.role || "");
  const company = cleanText(section.company || "");
  const description = cleanText(section.description || "");
  const text = cleanText(section.text || "");
  const kind = cleanText(section.kind || "section");
  const links = Array.isArray(section.links) ? section.links.map((link) => cleanText(link)).filter(Boolean) : [];

  if (!title && !role && !company && !description && !text) return null;

  return {
    url,
    kind,
    title,
    subtitle,
    role,
    company,
    description,
    text,
    links
  };
}

function extractSectionsFromHtml(html, url) {
  const blocks = [];
  const sectionRegex = /<(?:section|article|li|div)[^>]*>([\s\S]*?)<\/(?:section|article|li|div)>/gi;
  const seen = new Set();
  let match;

  while ((match = sectionRegex.exec(html))) {
    const block = match[1] || "";
    const titleMatch = block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const paragraphMatches = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => cleanText(m[1])).filter(Boolean);
    const text = cleanText(block.replace(/<[^>]+>/g, " "));
    const title = cleanText(titleMatch?.[1] || "");
    const description = paragraphMatches.join(" ") || text;
    const normalized = cleanText([title, description].join(" "));
    if (!normalized || normalized.length < 40 || seen.has(normalized)) continue;
    seen.add(normalized);

    const kind = /experience|work|career|intern|developer|engineer/i.test(normalized)
      ? "experience"
      : /project|portfolio/i.test(normalized)
        ? "project"
        : /contact|email|phone/i.test(normalized)
          ? "contact"
          : "section";

    const [primary, secondary] = splitSectionTitle(title || description);
    blocks.push({
      url,
      kind,
      title: primary || title,
      subtitle: secondary,
      role: extractRoleFromText(primary, secondary, description, kind),
      company: extractCompanyFromText(primary, secondary, description, kind),
      description,
      text: normalized,
      links: extractLinkLabelsFromBlock(block)
    });
  }

  return blocks.slice(0, 40);
}

function splitSectionTitle(value) {
  const text = cleanText(value || "");
  if (!text) return ["", ""];
  for (const separator of [" — ", " - ", " | ", " / ", " : "]) {
    if (text.includes(separator)) {
      const [first, ...rest] = text.split(separator);
      return [cleanText(first), cleanText(rest.join(separator))];
    }
  }
  return [text, ""];
}

function extractRoleFromText(primary, secondary, description, kind) {
  if (kind !== "experience") return "";
  const candidates = [primary, secondary, description].filter(Boolean);
  for (const candidate of candidates) {
    const match = candidate.match(/(?:full stack developer|software engineer|frontend developer|backend developer|developer|engineer|intern)[^,.;\n]*/i);
    if (match) return cleanText(match[0]);
  }
  return cleanText(primary || "");
}

function extractCompanyFromText(primary, secondary, description, kind) {
  if (kind !== "experience") return "";
  const combined = [primary, secondary, description].filter(Boolean).join(" ");
  const patterns = [
    /(?:at|@|for)\s+([A-Z][A-Za-z0-9&.\-() ]{2,80})/i,
    /([A-Z][A-Za-z0-9&.\-() ]{2,80})\s+[—\-|]\s+(?:full stack developer|software engineer|frontend developer|backend developer|developer|engineer|intern)/i
  ];
  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return "";
}

function extractLinkLabelsFromBlock(block) {
  const labels = [...block.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => cleanText(match[1]))
    .filter((label) => label && !/^(view resume|download|view|read more|learn more)$/i.test(label));
  return labels.slice(0, 4);
}
