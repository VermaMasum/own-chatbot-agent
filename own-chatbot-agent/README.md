# Own Chatbot Agent

This project creates a generalized AI chatbot builder for business websites.

## What it does

- Takes a short intake from the user
- Detects the business type
- Builds a personalized chatbot profile
- Generates a system prompt and setup config
- Prepares the project for a future web dashboard and widget

## Run

```bash
node src/index.js
```

To use the browser UI:

```bash
npm start
```

Then open `http://localhost:3000`.

To enable smarter answers, add a `.env` file in the project root:

```bash
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

If `GROQ_API_KEY` is missing, the app falls back to a local simulator reply.

If you enter a public website URL, the server fetches the homepage, checks `robots.txt` and `sitemap.xml`, then follows a few same-site links and guessed routes like About, Services, FAQ, Pricing, Contact, Experience, and Portfolio. It turns those pages into summaries and topic hints so the chatbot can answer more naturally about that site.

For websites that render content in the browser, the server also tries Playwright so it can read the rendered DOM, not just the raw HTML.

To use the old terminal flow:

```bash
npm run cli
```

## Output

The CLI prints a chatbot configuration you can plug into:

- a website widget
- an AI API
- a future dashboard

The web UI shows the same config live in the browser.

## Next steps

- Add website ingestion
- Add an admin dashboard
- Add embeddable chat widget
- Add AI provider integration
- Add Playwright crawling fallback for JS-heavy websites
