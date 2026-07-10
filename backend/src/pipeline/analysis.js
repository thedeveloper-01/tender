/**
 * pipeline/analysis.js
 *
 * Generalized, pure, rule-based analysis engine — ported from the uploaded
 * src/lib/tenderAnalysis.js so it can run on EITHER source (GeM or CSPGCL)
 * against the unified Tender shape. No network calls, no API keys.
 */

const CATEGORY_KEYWORDS = {
  'Civil Works': ['civil', 'construction', 'building', 'road', 'concrete', 'excavation', 'masonry', 'foundation', 'retaining', 'drainage', 'bridge', 'boundary', 'repair', 'renovation', 'plaster', 'rcc', 'r.c.c'],
  Mechanical: ['mechanical', 'turbine', 'boiler', 'pump', 'compressor', 'valve', 'condenser', 'fan', 'mill', 'crusher', 'conveyor', 'bearing', 'gear', 'motor', 'engine', 'shaft', 'pipe', 'piping', 'welding', 'fabrication', 'overhauling', 'overhaul'],
  Electrical: ['electrical', 'transformer', 'switchgear', 'cable', 'wiring', 'panel', 'relay', 'generator', 'battery', 'lighting', 'ht ', 'lt ', 'h.t.', 'l.t.', 'substation'],
  Manpower: ['manpower', 'labour', 'labor', 'outsourc', 'housekeep', 'security', 'guard', 'cleaning', 'sweeping', 'canteen', 'catering', 'staffing', 'personnel', 'deployment'],
  Procurement: ['supply', 'procurement', 'purchase', 'spare', 'material', 'chemical', 'lubricant', 'oil', 'fuel', 'diesel', 'coal', 'consumable', 'equipment', 'instrument'],
  Environment: ['environment', 'pollution', 'ash', 'effluent', 'emission', 'waste', 'disposal', 'plantation', 'tree', 'green', 'ecology', 'etp', 'stp'],
  EPC: ['epc', 'turnkey', 'erection', 'commissioning', 'installation'],
  'IT & Software': ['software', 'computer', 'it ', 'i.t.', 'server', 'network', 'cctv', 'camera', 'website', 'digital'],
  Transport: ['transport', 'vehicle', 'truck', 'loader', 'crane', 'dumper', 'jcb', 'excavator', 'dozer', 'tipper', 'hiring'],
};

/** categorize(title) -> string[] */
export function categorize(title) {
  const lower = (title || '').toLowerCase();
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

/**
 * scoreViability(tender) -> 1-10
 * tender: { bidValue, emdAmount, endDate, sourceMeta }
 */
export function scoreViability(tender) {
  let score = 6; // neutral baseline

  const cost = tender.bidValue;
  const emd = tender.emdAmount;
  const closingDate = tender.endDate;

  if (cost != null) {
    if (cost <= 5000000) score += 2; // <= 50L — very accessible
    else if (cost <= 20000000) score += 1; // <= 2Cr — moderate
    else score -= 1; // large project
  }

  if (emd != null && cost != null && cost > 0) {
    const emdRatio = emd / cost;
    if (emdRatio > 0.05) score -= 1; // EMD > 5% of cost
    if (emdRatio <= 0.02) score += 1; // EMD <= 2% — friendly
  }

  if (closingDate) {
    const daysLeft = Math.ceil((new Date(closingDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) score -= 2; // expired
    else if (daysLeft <= 3) score -= 1; // very tight
    else if (daysLeft >= 14) score += 1; // comfortable window
  }

  if (tender.sourceMeta?.isEbidding) score += 1;

  return Math.max(1, Math.min(10, score));
}

/** identifyRisks(tender) -> string[] (max 4) */
export function identifyRisks(tender) {
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

  if (emd != null && cost != null && cost > 0 && emd / cost > 0.05) {
    risks.push('High EMD relative to value');
  }
  if (emd != null && emd > 500000) risks.push('EMD exceeds ₹5 lakh');

  if (cost != null && cost > 50000000) risks.push('Large-scale project (₹5 Cr+)');

  if (scope.includes('specialized') || scope.includes('specialised')) risks.push('Specialised work required');
  if (scope.includes('turnkey') || scope.includes('epc')) risks.push('EPC/Turnkey complexity');
  if (scope.includes('hazardous') || scope.includes('chemical')) risks.push('Hazardous materials involved');

  return risks.slice(0, 4);
}

/** Run all three analyses and return the fields to merge onto a tender. */
export function analyzeTender(tender) {
  return {
    category: categorize(tender.title),
    viabilityScore: scoreViability(tender),
    risks: identifyRisks(tender),
  };
}
