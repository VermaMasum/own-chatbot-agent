# WhatsApp AI Marketing Agent - Project Plan

## What We're Building

A WhatsApp AI agent that acts as a **marketing assistant for small businesses** - handles customer conversations, sends promotions, follows up with leads, collects reviews, and drives sales. **100% free to run.**

---

## The Problem We Solve

Small business owners (salons, gyms, clinics, tutors, shops) spend 4-6 hours daily:
- Replying to the same questions on WhatsApp
- Forgetting to follow up with interested customers
- Never sending promotional offers
- Never asking for Google reviews
- Losing leads because they replied too late

**This AI agent does ALL of that automatically, 24/7.**

---

## Core Features (MVP)

### 1. Auto-Reply Engine
- Customer messages "Hi" or asks about services/prices -> AI replies instantly
- Handles FAQs: timings, location, pricing, services
- Works in Hindi + English (mixed code-switching supported)

### 2. Lead Follow-Up System
- Customer asks about a service but doesn't book -> AI follows up next day
- "Hi! You asked about our hair spa yesterday. We have a 20% offer today. Interested?"
- Configurable follow-up intervals (1 day, 3 days, 7 days)

### 3. Broadcast Campaigns
- Business owner says "Send Diwali offer to all customers"
- AI sends personalized messages (not bulk spam) with customer's name
- Tracks who opened, who replied, who converted

### 4. Appointment Booking
- "I want to book for tomorrow" -> AI checks availability, confirms slot
- Sends reminder 1 hour before appointment
- Handles rescheduling and cancellations

### 5. Review Collector
- After service completion, AI sends: "How was your experience? Rate us on Google!"
- If negative feedback -> alerts the business owner privately
- If positive -> sends Google review link

### 6. Smart Catalog
- Customer asks "Show me your menu" or "What services do you have?"
- AI sends formatted catalog with prices
- Can answer follow-up: "Which facial is best for oily skin?"

### 7. Owner Dashboard (WhatsApp-based)
- Owner sends "report" -> AI sends daily/weekly summary
- "Today: 23 conversations, 5 bookings, 2 complaints, 3 follow-ups sent"
- No web dashboard needed initially - everything via WhatsApp itself

---

## Tech Stack (100% FREE)

### WhatsApp Connection
- **whatsapp-web.js** (open source, free)
- Connects via WhatsApp Web protocol
- Scan QR code once, stays connected
- No Meta Business API needed (no cost)

### AI Brain (FREE options - pick one)
| Option | Free Tier | Speed | Quality |
|--------|-----------|-------|---------|
| **Google Gemini API** | 15 requests/min, 1500/day FREE | Fast | Excellent |
| **Groq API** | 30 req/min FREE (Llama 3, Mixtral) | Very Fast | Great |
| **Ollama (Local)** | Unlimited, runs on your machine | Depends on PC | Great |
| **HuggingFace Inference** | Rate limited but free | Medium | Good |

**Recommendation:** Start with **Groq API** (free, fast, good quality with Llama 3.3). Fallback to **Google Gemini** if rate limited. Use **Ollama** for development/testing.

### Backend
- **Node.js + Express** (you already know this)
- **SQLite** via **better-sqlite3** (zero setup, no server, free)
- **node-cron** for scheduled tasks (follow-ups, reminders)

### No Paid Services Needed
- No hosting cost (runs on your laptop/PC initially)
- No database cost (SQLite is a file)
- No AI API cost (free tiers are generous)
- No WhatsApp cost (whatsapp-web.js is free)
- No SMS cost (everything is WhatsApp)

---

## Project Structure

```
whatsapp-ai-agent/
├── src/
│   ├── index.js                 # Entry point - WhatsApp client setup
│   ├── config/
│   │   └── settings.js          # Business config (name, services, hours)
│   ├── ai/
│   │   ├── provider.js          # AI provider abstraction (Groq/Gemini/Ollama)
│   │   ├── prompts.js           # System prompts for the business
│   │   └── intent.js            # Detect customer intent (inquiry/booking/complaint)
│   ├── handlers/
│   │   ├── message.js           # Main message handler
│   │   ├── booking.js           # Appointment booking logic
│   │   ├── campaign.js          # Broadcast campaign logic
│   │   ├── followup.js          # Lead follow-up logic
│   │   └── review.js            # Review collection logic
│   ├── db/
│   │   ├── database.js          # SQLite setup and queries
│   │   ├── migrations.js        # Table creation
│   │   └── models.js            # Data access functions
│   ├── services/
│   │   ├── scheduler.js         # Cron jobs for reminders/follow-ups
│   │   ├── catalog.js           # Product/service catalog management
│   │   └── analytics.js         # Conversation and conversion tracking
│   └── utils/
│       ├── logger.js            # Logging
│       └── helpers.js           # Formatting, language detection
├── data/
│   ├── agent.db                 # SQLite database file
│   └── catalog.json             # Business catalog/menu
├── .env                         # API keys (Groq/Gemini free tier)
├── .gitignore
├── package.json
└── README.md
```

---

## Database Schema (SQLite)

### contacts
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto increment |
| phone | TEXT UNIQUE | WhatsApp number |
| name | TEXT | Customer name |
| first_contact | DATETIME | When they first messaged |
| last_contact | DATETIME | Last interaction |
| total_messages | INTEGER | Message count |
| tags | TEXT | JSON array: ["lead", "regular", "vip"] |
| notes | TEXT | AI-generated customer notes |

### conversations
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto increment |
| contact_id | INTEGER FK | Link to contact |
| role | TEXT | "customer" or "agent" |
| message | TEXT | Message content |
| intent | TEXT | inquiry/booking/complaint/general |
| timestamp | DATETIME | When sent |

### bookings
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto increment |
| contact_id | INTEGER FK | Link to contact |
| service | TEXT | What they booked |
| date | DATE | Booking date |
| time | TEXT | Booking time |
| status | TEXT | confirmed/completed/cancelled/no-show |
| reminder_sent | BOOLEAN | Was reminder sent |

### campaigns
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto increment |
| name | TEXT | Campaign name |
| message_template | TEXT | Message with {name} placeholders |
| sent_count | INTEGER | How many sent |
| reply_count | INTEGER | How many replied |
| created_at | DATETIME | When created |

### follow_ups
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto increment |
| contact_id | INTEGER FK | Link to contact |
| reason | TEXT | Why following up |
| scheduled_at | DATETIME | When to send |
| sent | BOOLEAN | Was it sent |
| response | TEXT | Did they reply |

---

## How It Works (Flow)

```
Customer sends WhatsApp message
         │
         ▼
whatsapp-web.js receives it
         │
         ▼
Save to database (contact + conversation)
         │
         ▼
Detect intent (AI classifies: inquiry / booking / complaint / general)
         │
         ├── INQUIRY ──────► AI responds with business info + catalog
         │                    Schedule follow-up for tomorrow if no booking
         │
         ├── BOOKING ─────► AI checks availability, confirms slot
         │                    Schedule reminder for 1 hour before
         │
         ├── COMPLAINT ───► AI responds with empathy + discount offer
         │                    Alert owner immediately
         │
         └── GENERAL ─────► AI has natural conversation
                             Tag as lead if showing interest

         Background Jobs (node-cron):
         ├── Every hour: Send upcoming appointment reminders
         ├── Every morning 10 AM: Send follow-ups to yesterday's leads
         ├── After service: Send review request (configurable delay)
         └── Campaign: Send scheduled broadcast messages (staggered, not bulk)
```

---

## AI Prompt Strategy

The AI agent has a **system prompt** that includes:
1. Business name, type, and personality
2. Services/menu with prices
3. Business hours and location
4. Booking rules (available slots, max per day)
5. Special offers currently running
6. Response guidelines (friendly, concise, in customer's language)
7. Escalation rules (when to alert owner)

Example system prompt:
```
You are the AI assistant for "Glow Beauty Salon" in Satellite, Ahmedabad.

PERSONALITY: Friendly, professional, uses the customer's name. Reply in the same
language the customer writes in (Hindi/English/Hinglish).

SERVICES:
- Haircut: Rs.300 (Men), Rs.500 (Women)
- Hair Spa: Rs.800
- Facial (Basic): Rs.600
- Facial (Gold): Rs.1,200
- Bridal Package: Rs.15,000

HOURS: 10 AM - 8 PM, Monday to Saturday. Closed Sunday.
ADDRESS: 201, Star Complex, Satellite Road, Ahmedabad

CURRENT OFFER: 20% off on Hair Spa this week.

RULES:
- Always try to convert inquiries into bookings
- If customer seems interested but doesn't book, say you'll follow up
- For complaints, apologize sincerely and offer 10% off next visit
- For pricing questions, always mention the current offer
- Never make up information. If unsure, say "Let me check with the team"
```

---

## Build Phases

### Phase 1: Core (Week 1) ✦ START HERE
- [ ] Project setup (Node.js, packages)
- [ ] WhatsApp connection via whatsapp-web.js (QR scan)
- [ ] SQLite database setup with tables
- [ ] Basic message receiving and logging
- [ ] AI integration (Groq free API)
- [ ] Auto-reply to customer messages with business context
- [ ] Owner command: send "report" to get stats

### Phase 2: Smart Features (Week 2)
- [ ] Intent detection (inquiry/booking/complaint)
- [ ] Appointment booking flow
- [ ] Appointment reminders (1 hour before)
- [ ] Lead follow-up system (next day)
- [ ] Customer tagging (lead/regular/vip)

### Phase 3: Marketing Engine (Week 3)
- [ ] Broadcast campaigns (owner sends "campaign: Diwali offer 20% off")
- [ ] Review collection after service
- [ ] Catalog sharing with images
- [ ] Smart upselling ("Add head massage for Rs.100 more?")
- [ ] Multi-language support (Hindi/English auto-detect)

### Phase 4: Polish & Scale (Week 4)
- [ ] Conversation history context (AI remembers past interactions)
- [ ] Analytics dashboard (WhatsApp-based reports)
- [ ] Owner can configure via WhatsApp ("change hours to 9 AM - 9 PM")
- [ ] Rate limiting and queue management
- [ ] Error handling and reconnection logic
- [ ] Documentation and setup guide for other businesses

---

## Packages We'll Use

```json
{
  "dependencies": {
    "whatsapp-web.js": "^1.26.0",     // WhatsApp connection (FREE)
    "qrcode-terminal": "^0.12.0",      // QR code in terminal
    "groq-sdk": "^0.8.0",             // Groq AI (FREE tier)
    "better-sqlite3": "^11.0.0",       // SQLite database (FREE)
    "node-cron": "^3.0.3",            // Scheduled tasks
    "dotenv": "^16.4.0",              // Environment variables
    "winston": "^3.14.0"              // Logging
  }
}
```

**Total cost: Rs.0**

---

## Revenue Model (When You Sell This)

| Plan | Price | Target |
|------|-------|--------|
| Free | Rs.0 | You use it yourself / demo to clients |
| Starter | Rs.999/month | Small shops, tutors (500 msgs/month) |
| Growth | Rs.2,499/month | Salons, clinics (unlimited msgs + campaigns) |
| Pro | Rs.4,999/month | Multi-branch + analytics + priority support |

**How you sell it:**
Walk into a salon. Say: "I'll get you 10 extra customers this month through WhatsApp. If it doesn't work, you pay nothing."

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| WhatsApp might block the number | Use a dedicated business number. Don't spam. Keep conversations natural. Add delays between messages. |
| Groq free tier rate limits | Implement request queuing. Fallback to Gemini free tier. Cache common responses. |
| whatsapp-web.js breaks after WhatsApp update | Library is actively maintained. Pin version. Have Baileys as backup. |
| AI gives wrong information | System prompt is strict. "Never make up info" rule. Owner can correct via WhatsApp. |

---

## Success Metrics

After 1 month of running:
- **Response time:** <30 seconds (vs 2-6 hours manual)
- **Lead follow-up rate:** 100% (vs ~10% manual)
- **Booking conversion:** 20-30% of inquiries converted
- **Review collection:** 40%+ of served customers leave a review
- **Owner time saved:** 3-4 hours/day

---

## Ready to Build?

Phase 1 starts now. First file: project setup + WhatsApp connection + basic AI reply.
