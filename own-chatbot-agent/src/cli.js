import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listTemplates } from "./templates.js";
import { buildChatbotProfile } from "./builder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rl = readline.createInterface({ input, output });

console.log("\nOwn Chatbot Agent");
console.log("==================\n");
console.log("Create a personalized chatbot profile for any website.\n");

const templates = listTemplates();
console.log("Choose a business type:");
templates.forEach((item, index) => {
  console.log(`  ${index + 1}. ${item.label}`);
});

const choice = await ask("Select a number", "6");
const selected = templates[Number(choice) - 1] ?? templates[templates.length - 1];
const businessType = selected.key;

const answers = {
  businessType,
  projectName: await ask("Project name", ""),
  websiteUrl: await ask("Website URL", ""),
  mainGoal: await ask("Main goal", ""),
  targetAudience: await ask("Target audience", "website visitors"),
  tone: await ask("Tone", ""),
  capturesName: await ask("Capture name? (yes/no)", "yes"),
  capturesEmail: await ask("Capture email? (yes/no)", "yes"),
  capturesPhone: await ask("Capture phone? (yes/no)", "no"),
  uploadedDocs: await ask("Docs or pages to learn from", "website pages, FAQ, policy pages"),
  allowedTopics: await ask("Allowed topics", "services, pricing, support"),
  blockedTopics: await ask("Blocked topics", "legal, medical, financial advice"),
  handoffReason: await ask("When should it hand off to a human?", "complex questions or uncertain answers")
};

const profile = buildChatbotProfile(answers);
console.log("\nGenerated chatbot profile:\n");
console.log(JSON.stringify(profile, null, 2));

const shouldSave = (await ask("\nSave config to output/chatbot-config.json? (yes/no)", "yes")).toLowerCase();
if (shouldSave.startsWith("y")) {
  const outDir = resolve(__dirname, "../output");
  const outFile = resolve(outDir, "chatbot-config.json");
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(profile, null, 2), "utf8");
  console.log(`\nSaved to ${outFile}`);
}

rl.close();

async function ask(question, fallback) {
  const answer = await rl.question(`${question}${fallback ? ` [${fallback}]` : ""}: `);
  return answer.trim() || fallback;
}
