/**
 * pipeline/aiExtract.js
 *
 * DEPRECATED — replaced by extractor/parser.js (fully offline, deterministic).
 *
 * This file is kept to prevent import errors in any code that still references
 * aiExtractTender(). The function returns null immediately so callers fall
 * back to 'not_found' status, which is fine since extract.js no longer calls it.
 *
 * The new extraction pipeline:
 *   pdftotext -layout → normalizePdfText → splitSections → extractFields
 *   → consigneeParser → eligibilityParser → atcParser → validators
 *
 * See: backend/src/extractor/parser.js
 */

/**
 * aiExtractTender — NO-OP stub.
 * Returns null immediately. extract.js no longer calls this.
 * Kept for import compatibility only.
 */
// eslint-disable-next-line no-unused-vars
export async function aiExtractTender(_pdfText) {
  return null;
}

// ── Legacy code below this line — kept for reference, never executed ──────────

// If the model is unavailable (404), disable AI for the rest of the run
// to avoid spamming the same error hundreds of times.
let _disabledForRun = false;
let _consecutiveFailures = 0;

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildMessages(pdfText) {
  const truncated = pdfText.slice(0, MAX_TEXT_LENGTH);

  const systemPrompt = `You are an expert procurement document analyst specializing in Government e-Marketplace (GeM) tenders in India.
You will be given raw extracted text from a GeM NIT (Notice Inviting Tender) PDF.
Your task is to extract structured data and return it as a single valid JSON object.
Respond with ONLY the JSON object — no markdown fences, no explanation, no extra text.`;

  const userPrompt = `Extract all fields from the GeM tender PDF text below and return a JSON object with this EXACT structure:

{
  "bidValue": null,
  "emdAmount": null,
  "consignees": [
    {
      "sNo": 1,
      "reportingOfficer": "Name / Designation of consignee reporting officer",
      "address": "Full delivery address including pincode",
      "quantity": "Quantity with unit (e.g. 10 Nos)",
      "deliveryDays": "Number of days allowed for delivery"
    }
  ],
  "eligibility": {
    "minAnnualTurnover": "Amount in INR (e.g. ₹50 Lakh) or 'Not specified'",
    "oemAverageTurnover": "OEM average turnover last 3 years or 'Not specified'",
    "yearsOfExperience": "Number of years required or 'Not specified'",
    "mseExemption": "Yes / No / Not specified",
    "startupExemption": "Yes / No / Not specified",
    "documentsRequired": ["Document 1", "Document 2"],
    "bidToRAEnabled": "Yes / No / Not specified",
    "typeOfBid": "Single Packet / Two Packet Bid / Not specified",
    "primaryProductCategory": "Product category name or 'Not specified'",
    "technicalClarificationTime": "e.g. 2 Days / Not specified",
    "msePurchasePreference": "Yes / No / Not specified"
  },
  "atc": [
    {
      "category": "One of: Warranty / Packing / Inspection / Sample Clause / Service Support / Certificates / Financial Criteria / Other",
      "clause": "Clause number/reference if available, else empty string",
      "summary": "Concise point-wise summary of this condition"
    }
  ]
}

FIELD RULES:
- bidValue: Estimated bid/tender value as a plain NUMBER in INR (e.g. 1500000). null if not found.
- emdAmount: EMD / Earnest Money Deposit as a plain NUMBER in INR. null if not found.
- consignees: Extract ALL consignee/delivery rows. Empty array if none found.
- eligibility: All fields are strings. Use "Not specified" when not found in text.
- documentsRequired: List ALL documents sellers must submit. Empty array if not found.
- atc: Extract ALL Additional Terms and Conditions added by the buyer. Empty array if none.
- For each ATC entry, pick the most fitting category from: Warranty, Packing, Inspection, Sample Clause, Service Support, Certificates, Financial Criteria, Other.

PDF TEXT:
---
${truncated}
---`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

// ── AI call ───────────────────────────────────────────────────────────────────

/**
 * aiExtractTender(pdfText) → {
 *   bidValue, emdAmount, consignees, eligibility, atc, model, extractedAt
 * } | null
 *
 * Returns null on any failure — callers must handle gracefully.
 */
export async function aiExtractTender(pdfText) {
  if (!config.aiExtractEnabled) {
    console.log('[aiExtract] AI extraction disabled (AI_EXTRACT_ENABLED=false)');
    return null;
  }

  if (_disabledForRun) {
    return null; // silenced — already logged the reason once this run
  }

  if (!config.openRouterApiKey || config.openRouterApiKey.includes('YOUR_KEY_HERE')) {
    console.warn('[aiExtract] OPENROUTER_API_KEY not set — skipping AI extraction');
    return null;
  }

  if (!pdfText || pdfText.trim().length < 50) {
    console.warn('[aiExtract] PDF text too short or empty — skipping AI extraction');
    return null;
  }

  const messages = buildMessages(pdfText);

  // Models to try in order of preference.
  // Verified against live OpenRouter /api/v1/models — all confirmed free (pricing=0) as of July 2026.
  // Primary: nvidia/nemotron-3-ultra-550b-a55b:free — 550B MoE, 1M context, supports structured_outputs.
  // Fallbacks cover different providers so a single provider outage doesn't kill all attempts.
  const modelsToTry = [
    config.openRouterModel,                          // from .env OPENROUTER_MODEL
    'nvidia/nemotron-3-ultra-550b-a55b:free',        // 550B MoE, very capable, confirmed free
    'tencent/hy3:free',                              // 295B MoE, 262K context, confirmed free
    'cohere/north-mini-code:free',                   // 30B MoE, 256K context, confirmed free
    'nvidia/nemotron-3.5-content-safety:free',       // 4B safety model, lightweight fallback
  ].filter(Boolean);

  // Remove duplicates while keeping order
  const uniqueModels = [...new Set(modelsToTry)];
  let lastError = null;

  for (const model of uniqueModels) {
    // ── HTTP call ──────────────────────────────────────────────────────────────
    let response;
    try {
      response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://cgtenders.com',
          'X-Title': 'CGTenders AI Extractor',
        },
        body: JSON.stringify({
          model: model,
          messages,
          temperature: 0.1,
          max_tokens: 2500,
          // Note: response_format: json_object is NOT sent here.
          // Many free models (Gemma, Qwen, Nemotron) do not support it and
          // will return an error or ignore it. We rely on the system prompt
          // + JSON.parse() + markdown-fence stripping instead.
        }),
        signal: AbortSignal.timeout(35000), // 35 seconds per model attempt
      });
    } catch (e) {
      lastError = `Network/timeout with model ${model}: ${e.message}`;
      console.warn(`[aiExtract] Model ${model} failed/timed out:`, e.message);
      continue; // Try next model
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      lastError = `HTTP ${response.status} with model ${model}: ${errText.slice(0, 150)}`;
      console.warn(`[aiExtract] Model ${model} HTTP ${response.status}:`, errText.slice(0, 150));
      continue; // Try next model
    }

    // ── Parse response ─────────────────────────────────────────────────────────
    let body;
    try {
      body = await response.json();
    } catch (e) {
      lastError = `JSON parse error with model ${model}: ${e.message}`;
      console.warn(`[aiExtract] JSON parse failed for model ${model}:`, e.message);
      continue; // Try next model
    }

    const rawContent = body?.choices?.[0]?.message?.content;
    if (!rawContent) {
      lastError = `Empty content with model ${model}`;
      console.warn(`[aiExtract] Empty content returned for model ${model}`);
      continue; // Try next model
    }

    // Strip markdown code fences if the model added them despite instructions
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      lastError = `Invalid JSON with model ${model}: ${e.message}`;
      console.warn(`[aiExtract] Invalid JSON from model ${model}:`, e.message, '\nRaw:', cleaned.slice(0, 150));
      continue; // Try next model
    }

    // ── Validate & normalise shape ─────────────────────────────────────────────
    if (!parsed || typeof parsed !== 'object') {
      lastError = `Invalid response shape with model ${model}`;
      console.warn(`[aiExtract] Unexpected response shape from model ${model}`);
      continue; // Try next model
    }

    // Success! Reset consecutive failure counter and return the parsed result
    _consecutiveFailures = 0;

    const toNum = (v) => {
      if (v == null || v === '' || v === 'null') return null;
      const n = Number(String(v).replace(/[₹,\s]/g, ''));
      return isNaN(n) ? null : n;
    };

    const result = {
      bidValue:      toNum(parsed.bidValue),
      emdAmount:     toNum(parsed.emdAmount),
      consignees:    Array.isArray(parsed.consignees)  ? parsed.consignees  : [],
      eligibility:   (parsed.eligibility && typeof parsed.eligibility === 'object') ? parsed.eligibility : {},
      atc:           Array.isArray(parsed.atc)          ? parsed.atc          : [],
      model:         model,
      extractedAt:   new Date().toISOString(),
    };

    console.log(
      `[aiExtract] ✓ bidValue=${result.bidValue} emd=${result.emdAmount} ` +
      `consignees=${result.consignees.length} atc=${result.atc.length} model=${result.model}`
    );

    return result;
  }

  // If we exhausted all fallback models and got here, it's a failure
  _consecutiveFailures++;
  console.error(`[aiExtract] All fallback models failed. Last error: ${lastError}`);

  if (_consecutiveFailures >= 5) {
    _disabledForRun = true;
    console.warn(`[aiExtract] Disabling AI extraction for this run: 5 consecutive failures across all fallback models.`);
  }

  return null;
}
