🏗️ Full Technical & Feature Plan
The Core Problem
The CSPGCL website blocks direct browser fetch (CORS). So the app will use the Claude API's web_fetch capability — Claude fetches the page server-side, parses the raw HTML table, and returns structured JSON. This solves CORS entirely.

🔄 Data Flow Architecture
User opens app
      ↓
App calls Claude API (web_fetch tool enabled)
      ↓
Claude fetches https://cspc.co.in/...Tender.aspx?paramflag=1
      ↓
Claude parses HTML → returns structured JSON array of tenders
      ↓
App stores tenders in state
      ↓
Second Claude API call → AI enrichment (summary, category, score, risks)
      ↓
App renders enriched tenders with filters/search

📦 Data Structure Per Tender
Each tender object after parsing + enrichment:
json{
  "sr_no": 1,
  "issuing_office": "C.E.(Civil: AU&PC)",
  "tender_notice_no": "EDC/AU&PC/HTPS-KW/W/2024/28",
  "scope_raw": "Annual maintenance & pollution control works...",
  "scope_summary": "Yearly upkeep of ash disposal site at Korba West plant",
  "estimated_cost": 1302000,
  "emd": 13100,
  "closing_date": "2024-10-01T15:00:00",
  "opening_date": "2024-10-03T16:00:00",
  "rfx_id": null,
  "is_ebidding": false,
  "category": ["Civil Works", "Environment"],
  "viability_score": 7,
  "risks": ["Short submission window", "Pollution compliance required"],
  "passes_filter": true
}

🖥️ App Layout — 4 Sections
Section 1 — Header Bar

App name + logo
Refresh Data button (re-fetches live)
Last fetched timestamp
Loading spinner during fetch

Section 2 — AI Trend Summary Banner

Full-width card at top
Claude's paragraph overview of all current tenders
Refreshes with data

Section 3 — Filter & Search Bar
ControlTypeNatural Language SearchText input → AI parsedEMD Cap (≤ ₹35,000)Toggle switch (ON by default)Bid Value Cap (≤ ₹40L)Toggle switch (ON by default)CategoryMulti-select dropdownIssuing OfficeDropdowne-Bidding onlyToggleSort by Closing DateAsc / Desc toggleClear all filtersButton
Section 4 — Tender Cards Grid
Each card contains:
┌─────────────────────────────────────────┐
│ #1  [Civil Works] [Environment]  Score: 7/10 │
│ C.E.(Civil: AU&PC)                      │
│ ─────────────────────────────────────── │
│ 📋 Yearly upkeep of ash disposal site   │
│    at Korba West plant                  │
│ ─────────────────────────────────────── │
│ 💰 Est. Cost: ₹13,02,000                │
│ 🏦 EMD: ₹13,100                         │
│ 📅 Closes: 01 Oct 2024 · 2 days left   │
│ ─────────────────────────────────────── │
│ ⚠️ Short window  ⚠️ Pollution compliance │
│ ─────────────────────────────────────── │
│ [View Document]  [Ask AI ▾]             │
└─────────────────────────────────────────┘

🤖 AI Calls Breakdown
CallWhenWhat Claude doesCall 1: Fetch + ParseOn page load / refreshFetches URL, parses table → JSONCall 2: Bulk EnrichAfter parseSummarises + categorises + scores + risks for ALL tenders in one callCall 3: Trend SummaryAfter enrichGenerates the overview paragraphCall 4: NL SearchOn search inputInterprets query → returns filter params

⚙️ Tech Stack
LayerChoiceWhyFrameworkReact (JSX artifact)Runs in browser, rich stateStylingTailwind + custom CSSClean professional lookFontsOutfit (headings) + DM Sans (body)Professional, not genericAIClaude API (claude-sonnet-4-20250514)Fetch, parse, enrichStateuseState + useReducerFilter/search stateNo backendClaude API called from artifactCORS solved by Claude

🎨 Design System
ElementStyleBackground#F8F9FC (off-white)CardsWhite with subtle shadowPrimary#1A56DB (government blue)Success/Low risk#057A55 greenWarning#C27803 amberDanger/Expired#E02424 redScore high (8-10)Green badgeScore mid (5-7)Amber badgeScore low (1-4)Red badgeClosing soon (<3 days)Pulsing orange borderExpiredGreyed out card

📱 Responsive Behaviour

Desktop → 3-column card grid
Tablet → 2-column
Mobile → 1-column stacked


🚦 Loading States

Fetching page → "Connecting to CSPGCL portal..."
Parsing tenders → "Reading tender table..."
AI enrichment → "Analysing tenders with AI..."
Trend summary → "Generating market overview..."


⚠️ Edge Cases Handled

CSPGCL site down → friendly error + retry button
Tender with no EMD listed → excluded from EMD filter
Expired tenders → shown but greyed, sorted to bottom
Missing cost data → shown as "Not specified"
NL search returns no match → "No tenders match your query, try rephrasing"


🗓️ Build Order

App shell + design system
Claude API fetch + parse (Call 1)
Render raw cards with basic filters
AI enrichment layer (Call 2)
Trend summary banner (Call 3)
Natural language search (Call 4)
Polish + loading states + edge cases