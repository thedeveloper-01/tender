/**
 * tenderAnalysis.js — Free, local analysis engine (no API key needed)
 *
 * Replaces all Claude/OpenAI calls with rule-based, keyword-driven logic.
 *
 * Functions exported:
 *   fetchTendersFromApi()              → tenders[]
 *   enrichTendersLocally(tenders)      → enrichments[]
 *   generateTrendSummary(tenders)      → string
 *   localNlSearch(query, tenders)      → filterObject
 *   generateTenderAnswer(q, tender)    → string
 *
 * Accepts tenders in either CSPGCL raw format or API camelCase format.
 * Internally normalizes to camelCase: title, bidValue, emdAmount, endDate, organization, bidNumber.
 */

// ─── Normalization ──────────────────────────────────────────────────────────

/** Normalize a tender object to camelCase API format. */
function normalize(t) {
  return {
    bidNumber:    t.bidNumber    || t.tender_notice_no || t.sr_no || '',
    title:        t.title        || t.scope_raw        || '',
    organization: t.organization || t.issuing_office   || '',
    bidValue:     t.bidValue     ?? t.estimated_cost   ?? null,
    emdAmount:    t.emdAmount    ?? t.emd              ?? null,
    endDate:      t.endDate      || t.closing_date     || null,
    startDate:    t.startDate    || t.opening_date     || null,
    category:     t.category     || [],
    source:       t.source       || 'CSPGCL',
    isEbidding:   t.sourceMeta?.isEbidding ?? t.is_ebidding ?? false,
    locationCity: t.locationCity || null,
    risks:        t.risks        || [],
    // Keep raw fields for backward compat
    _raw: t,
  };
}

// ─── 1. Fetch from local API route ──────────────────────────────────────────

export async function fetchTendersFromApi(onProgress) {
  if (onProgress) onProgress('Connecting to API...');

  const resp = await fetch('/api/tenders.json');

  if (!resp.ok) {
    throw new Error(`Server error: ${resp.status} — ${resp.statusText}`);
  }

  const data = await resp.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No tenders found. The portal may be temporarily down.');
  }

  if (onProgress) onProgress(`Fetched ${data.length} tenders.`);
  return data;
}

// ─── 2. Local Enrichment ─────────────────────────────────────────────────────

const CATEGORY_KEYWORDS = {
  'Civil Works':  ['civil', 'construction', 'building', 'road', 'concrete', 'excavation', 'masonry', 'foundation', 'retaining', 'drainage', 'bridge', 'boundary', 'repair', 'renovation', 'plaster', 'rcc', 'r.c.c'],
  'Mechanical':   ['mechanical', 'turbine', 'boiler', 'pump', 'compressor', 'valve', 'condenser', 'fan', 'mill', 'crusher', 'conveyor', 'bearing', 'gear', 'motor', 'engine', 'shaft', 'pipe', 'piping', 'welding', 'fabrication', 'overhauling', 'overhaul'],
  'Electrical':   ['electrical', 'transformer', 'switchgear', 'cable', 'wiring', 'panel', 'relay', 'generator', 'battery', 'lighting', 'ht ', 'lt ', 'h.t.', 'l.t.', 'substation'],
  'Manpower':     ['manpower', 'labour', 'labor', 'outsourc', 'housekeep', 'security', 'guard', 'cleaning', 'sweeping', 'canteen', 'catering', 'staffing', 'personnel', 'deployment'],
  'Procurement':  ['supply', 'procurement', 'purchase', 'spare', 'material', 'chemical', 'lubricant', 'oil', 'fuel', 'diesel', 'coal', 'consumable', 'equipment', 'instrument'],
  'Environment':  ['environment', 'pollution', 'ash', 'effluent', 'emission', 'waste', 'disposal', 'plantation', 'tree', 'green', 'ecology', 'etp', 'stp'],
  'EPC':          ['epc', 'turnkey', 'erection', 'commissioning', 'installation', 'design.*build', 'complete.*package'],
  'IT & Software':['software', 'computer', 'it ', 'i.t.', 'server', 'network', 'cctv', 'camera', 'website', 'digital'],
  'Transport':    ['transport', 'vehicle', 'truck', 'loader', 'crane', 'dumper', 'jcb', 'excavator', 'dozer', 'tipper', 'hiring']
};

function categorize(scope) {
  const lower = (scope || '').toLowerCase();
  const matched = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matched.push(category);
        break;
      }
    }
  }

  return matched.length > 0 ? matched : ['General'];
}

function summarizeScope(scope) {
  if (!scope) return 'No scope description available.';

  let text = scope
    .replace(/\s+/g, ' ')
    .replace(/["""]/g, '"')
    .trim();

  if (text.length > 200) {
    const cutoff = text.lastIndexOf(' ', 200);
    text = text.slice(0, cutoff > 100 ? cutoff : 200) + '…';
  }

  return text;
}

function scoreViability(t) {
  const tender = normalize(t);
  let score = 6;

  const cost = tender.bidValue;
  const emd = tender.emdAmount;
  const closingDate = tender.endDate;

  if (cost != null) {
    if (cost <= 5000000) score += 2;
    else if (cost <= 20000000) score += 1;
    else score -= 1;
  }

  if (emd != null && cost != null && cost > 0) {
    const emdRatio = emd / cost;
    if (emdRatio > 0.05) score -= 1;
    if (emdRatio <= 0.02) score += 1;
  }

  if (closingDate) {
    const daysLeft = Math.ceil((new Date(closingDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) score -= 2;
    else if (daysLeft <= 3) score -= 1;
    else if (daysLeft >= 14) score += 1;
  }

  if (tender.isEbidding) score += 1;

  return Math.max(1, Math.min(10, score));
}

function identifyRisks(t) {
  const tender = normalize(t);
  const risks = [];
  const cost = tender.bidValue;
  const emd = tender.emdAmount;
  const scope = (tender.title || '').toLowerCase();

  if (tender.endDate) {
    const daysLeft = Math.ceil((new Date(tender.endDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) risks.push('Tender expired');
    else if (daysLeft <= 2) risks.push('Closing in < 48 hours');
    else if (daysLeft <= 5) risks.push('Short submission window');
  }

  if (emd != null && cost != null && cost > 0) {
    if (emd / cost > 0.05) risks.push('High EMD relative to value');
  }
  if (emd != null && emd > 500000) risks.push('EMD exceeds ₹5 lakh');

  if (cost != null && cost > 50000000) risks.push('Large-scale project (₹5 Cr+)');

  if (scope.includes('specialized') || scope.includes('specialised')) risks.push('Specialised work required');
  if (scope.includes('turnkey') || scope.includes('epc')) risks.push('EPC/Turnkey complexity');
  if (scope.includes('hazardous') || scope.includes('chemical')) risks.push('Hazardous materials involved');

  return risks.slice(0, 4);
}

export function enrichTendersLocally(tenders) {
  return tenders.map(t => {
    const n = normalize(t);
    return {
      bidNumber:       n.bidNumber,
      scope_summary:   summarizeScope(n.title),
      category:        n.category.length > 0 ? n.category : categorize(n.title),
      viability_score: scoreViability(t),
      risks:           identifyRisks(t),
    };
  });
}

// ─── 3. Trend Summary ────────────────────────────────────────────────────────

export function generateTrendSummary(tenders) {
  if (!tenders.length) return 'No tenders available for analysis.';

  const normalized = tenders.map(normalize);

  const catCounts = {};
  normalized.forEach(t => {
    const cats = t.category.length > 0 ? t.category : categorize(t.title);
    cats.forEach(c => { catCounts[c] = (catCounts[c] || 0) + 1; });
  });

  const sorted = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const topCat = sorted[0];
  const secondCat = sorted[1];

  const now = new Date();
  let closingSoon = 0;
  let expired = 0;
  let totalCost = 0;
  let costCount = 0;

  normalized.forEach(t => {
    if (t.endDate) {
      const days = Math.ceil((new Date(t.endDate) - now) / (1000 * 60 * 60 * 24));
      if (days < 0) expired++;
      else if (days <= 7) closingSoon++;
    }
    if (t.bidValue != null) {
      totalCost += t.bidValue;
      costCount++;
    }
  });

  const avgCost = costCount > 0 ? totalCost / costCount : 0;
  const formatLakh = (v) => (v / 100000).toFixed(1) + ' lakh';

  let summary = `The current batch of ${tenders.length} tenders is dominated by ${topCat[0]} (${topCat[1]} tenders)`;
  if (secondCat) summary += ` followed by ${secondCat[0]} (${secondCat[1]} tenders)`;
  summary += '. ';

  if (closingSoon > 0) {
    summary += `${closingSoon} tender${closingSoon > 1 ? 's are' : ' is'} closing within the next 7 days, requiring immediate attention. `;
  }

  if (expired > 0) {
    summary += `${expired} tender${expired > 1 ? 's have' : ' has'} already passed the closing date. `;
  }

  if (costCount > 0) {
    summary += `The average estimated cost across tenders with disclosed values is ₹${formatLakh(avgCost)}, `;
    summary += avgCost < 2000000
      ? 'indicating primarily small-to-medium scale opportunities suitable for SMEs.'
      : avgCost < 10000000
        ? 'suggesting a mix of moderate-scale works.'
        : 'reflecting several high-value projects that may require significant capacity.';
  }

  return summary;
}

// ─── 4. Natural Language Search ──────────────────────────────────────────────

export function localNlSearch(query, tenders = []) {
  const lower = query.toLowerCase();
  const result = {
    categories: [],
    maxCost: null,
    maxEmd: null,
    keyword: null,
    organizationFilter: null
  };

  if (tenders.length > 0) {
    const orgs = [...new Set(tenders.map(t => (t.organization || t.issuing_office || '')).filter(Boolean))];
    const matchedOrg = orgs.find(o => lower.includes(o.toLowerCase()));
    if (matchedOrg) result.organizationFilter = matchedOrg;
  }

  for (const [category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(category.toLowerCase())) {
      result.categories.push(category);
    }
  }

  if (lower.includes('civil') || lower.includes('construction') || lower.includes('building')) {
    if (!result.categories.includes('Civil Works')) result.categories.push('Civil Works');
  }
  if (lower.includes('manpower') || lower.includes('labour') || lower.includes('outsourc')) {
    if (!result.categories.includes('Manpower')) result.categories.push('Manpower');
  }

  const lakhMatch = lower.match(/(?:under|below|less than|max|upto|up to|within)\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(?:lakh|lac|l\b)/i);
  if (lakhMatch) result.maxCost = parseFloat(lakhMatch[1]) * 100000;

  const croreMatch = lower.match(/(?:under|below|less than|max|upto|up to|within)\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(?:crore|cr\b)/i);
  if (croreMatch) result.maxCost = parseFloat(croreMatch[1]) * 10000000;

  const plainMatch = lower.match(/(?:under|below|less than|max)\s*(?:₹|rs\.?|inr)?\s*([\d,]+)/);
  if (!result.maxCost && plainMatch) {
    const val = parseInt(plainMatch[1].replace(/,/g, ''));
    if (val > 1000) result.maxCost = val;
  }

  const emdMatch = lower.match(/emd\s*(?:under|below|less than|max|upto|up to|within)?\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(?:k|thousand)?/i);
  if (emdMatch) {
    let val = parseFloat(emdMatch[1]);
    if (lower.includes('k') || lower.includes('thousand')) val *= 1000;
    result.maxEmd = val;
  }

  const stopWords = ['find', 'show', 'get', 'search', 'tender', 'tenders', 'me', 'all', 'the', 'with', 'for', 'and', 'or', 'in', 'at', 'of', 'under', 'below', 'above', 'less', 'than', 'more', 'lakh', 'crore', 'lac', 'rupees', 'rs', 'inr', 'cost', 'emd', 'works', 'work'];
  const words = lower.split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));

  const catLower = result.categories.map(c => c.toLowerCase().split(' ')).flat();
  const remainingWords = words.filter(w => !catLower.includes(w));
  if (remainingWords.length > 0) {
    result.keyword = remainingWords[0];
  }

  return result;
}

// ─── 5. Tender Q&A ───────────────────────────────────────────────────────────

export function generateTenderAnswer(question, tender) {
  const t = normalize(tender);
  const q = question.toLowerCase();
  const fmt = (v) =>
    v != null && !isNaN(v)
      ? '₹' + Number(v).toLocaleString('en-IN')
      : 'Not specified';

  if (q.includes('cost') || q.includes('price') || q.includes('value') || q.includes('budget')) {
    return `The estimated cost of this tender is ${fmt(t.bidValue)}. The EMD (Earnest Money Deposit) required is ${fmt(t.emdAmount)}.`;
  }

  if (q.includes('deadline') || q.includes('closing') || q.includes('last date') || q.includes('when')) {
    const closing = t.endDate || 'Not specified';
    const opening = t.startDate || 'Not specified';
    let response = `The closing date for this tender is ${closing}.`;
    if (t.endDate) {
      const days = Math.ceil((new Date(t.endDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (days < 0) response += ` This tender has already expired (${Math.abs(days)} days ago).`;
      else if (days === 0) response += ' This tender closes today!';
      else response += ` That's ${days} day${days > 1 ? 's' : ''} from now.`;
    }
    response += ` The opening date is ${opening}.`;
    return response;
  }

  if (q.includes('emd') || q.includes('earnest') || q.includes('deposit')) {
    return `The EMD (Earnest Money Deposit) for this tender is ${fmt(t.emdAmount)}. ${
      t.bidValue && t.emdAmount
        ? `This is ${((t.emdAmount / t.bidValue) * 100).toFixed(2)}% of the estimated cost.`
        : ''
    }`;
  }

  if (q.includes('scope') || q.includes('work') || q.includes('description') || q.includes('about') || q.includes('what')) {
    return `This tender (${t.bidNumber || 'N/A'}) from ${t.organization || 'N/A'} involves: ${t.title || 'No description available.'}`;
  }

  if (q.includes('office') || q.includes('department') || q.includes('who') || q.includes('issued')) {
    return `This tender was issued by: ${t.organization || 'Not specified'}.`;
  }

  if (q.includes('ebid') || q.includes('e-bid') || q.includes('online') || q.includes('electronic')) {
    return t.isEbidding
      ? 'Yes, this tender supports e-Bidding / e-Procurement. You can submit your bid online through the portal.'
      : 'This tender does not appear to be listed for e-Bidding. You may need to submit a physical bid.';
  }

  if (q.includes('eligible') || q.includes('qualification') || q.includes('criteria') || q.includes('can i')) {
    return `To determine eligibility, you should review the full tender document for qualification criteria. Key details: Cost — ${fmt(t.bidValue)}, EMD — ${fmt(t.emdAmount)}, Office — ${t.organization || 'N/A'}. Check the tender document for specific experience, turnover, and registration requirements.`;
  }

  if (q.includes('risk') || q.includes('concern') || q.includes('challenge')) {
    const risks = identifyRisks(tender);
    if (risks.length === 0) return 'No significant risks identified for this tender based on available data.';
    return `Key risks identified:\n${risks.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
  }

  return `Here's a summary of Tender #${t.bidNumber}:
• Office: ${t.organization || 'N/A'}
• Scope: ${(t.title || 'N/A').slice(0, 150)}${(t.title || '').length > 150 ? '…' : ''}
• Estimated Cost: ${fmt(t.bidValue)}
• EMD: ${fmt(t.emdAmount)}
• Closing: ${t.endDate || 'N/A'}
• e-Bidding: ${t.isEbidding ? 'Yes' : 'No'}

Feel free to ask about specific aspects like cost, deadline, scope, or eligibility.`;
}
