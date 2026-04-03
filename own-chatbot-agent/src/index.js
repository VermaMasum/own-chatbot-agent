const mode = process.argv.includes("--cli") ? "cli" : "web";

if (mode === "cli") {
  await import("./cli.js");
} else {
  await import("./server.js");
}
