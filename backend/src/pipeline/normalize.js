import { resolveCityForGem, resolveCityForCspgcl } from './locationResolve.js';
import { CSPGCL_PORTAL_BASE } from './pdf.js';

function deriveStatus(endDate) {
  if (!endDate) return 'open';
  return new Date(endDate) >= new Date() ? 'open' : 'closed';
}

/** Stable hash-like key for CSPGCL records missing a tender notice number. */
function stableKey(parts) {
  const str = parts.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `CSPGCL-GEN-${Math.abs(hash)}`;
}

function cleanTitle(title, category) {
  if (!title) return 'Custom Bid / BOQ';
  // Check if title is numeric garbage (comma separated numbers, optional ... at end)
  const isNumericGarbage = /^[\d,\s]+(\.\.\.)?$/.test(title) && (title.includes(',') || title.trim().length > 10);
  if (isNumericGarbage) {
    const cat = (category || '').toLowerCase();
    if (cat.includes('services')) {
      return 'Custom Bid for Services';
    } else if (cat.includes('boq')) {
      return 'BOQ Bid for Goods';
    } else {
      return 'Custom / BOQ Bid';
    }
  }
  return title;
}

/** Map a raw GeM record into the unified Tender shape. */
export function normalizeGem(raw) {
  const endDate = raw.endDate ? new Date(raw.endDate) : null;
  const rawTitle = raw.title || '';
  const categoryId = raw.category || '';
  const title = cleanTitle(rawTitle, categoryId);

  // Location: use fetchedState (from API call context) as the authoritative state.
  // City: prefer gemCity/gemDistrict fields directly from Solr, fall back to
  // locationText-based resolution only when those fields are absent.
  // fetchedState is now set by every GEM_STATES loop iteration (see fetchers/gem.js
  // and fetchers/gem_browser.js); 'Unspecified' only hits if a record slips through
  // without one, so we never mis-bucket other states' records as Chhattisgarh.
  const locationState = raw.fetchedState || 'Unspecified';
  let locationCity = 'Unspecified';

  if (raw.gemCity) {
    // Direct city from Solr — most reliable
    locationCity = raw.gemCity;
  } else if (raw.gemDistrict) {
    locationCity = raw.gemDistrict;
  } else {
    // Fall back to text-based resolution against the full location hint string
    const searchStr = `${title} ${raw.department || ''} ${raw.organization || ''} ${raw.locationText || ''}`;
    locationCity = resolveCityForGem(searchStr, locationState);
  }

  return {
    source: 'GEM',
    bidNumber: raw.bidNumber,
    title,
    department: raw.department || null,
    organization: raw.organization || null,
    category: [], // filled in by analysis step
    locationState,
    locationCity,
    startDate: raw.startDate ? new Date(raw.startDate) : null,
    endDate,
    quantity: raw.quantity || null,
    bidValue: raw.bidValue ?? null,
    emdAmount: raw.emdAmount ?? null,
    valueExtractionStatus: raw.bidValue != null ? 'extracted' : 'not_attempted',
    viabilityScore: null,
    risks: [],
    pdfPath: null,
    bidLink: raw.bidLink,
    status: deriveStatus(endDate),
    fetchedAt: new Date(),
    sourceMeta: {
      locationTextRaw: raw.locationText || null,
      gemId: raw.gemId ?? null,
      fetchedState: raw.fetchedState || null,
      gemCity: raw.gemCity || null,
      gemDistrict: raw.gemDistrict || null,
      gemPincode: raw.gemPincode || null,
    },
    rawJson: raw,
  };
}

/** Map a raw CSPGCL record into the unified Tender shape. */
export function normalizeCspgcl(raw) {
  const endDate = raw.closingDate ? new Date(raw.closingDate) : null;
  const bidNumber =
    raw.tenderNoticeNo && raw.tenderNoticeNo.trim()
      ? raw.tenderNoticeNo.trim()
      : stableKey([raw.issuingOffice, raw.scopeRaw, raw.closingDate]);

  return {
    source: 'CSPGCL',
    bidNumber,
    title: raw.scopeRaw,
    department: null,
    organization: raw.issuingOffice || null,
    category: [],
    locationState: 'Chhattisgarh',
    locationCity: resolveCityForCspgcl(raw),
    startDate: raw.openingDate ? new Date(raw.openingDate) : null,
    endDate,
    quantity: null,
    bidValue: raw.estimatedCost ?? null,
    emdAmount: raw.emd ?? null,
    valueExtractionStatus: raw.estimatedCost != null ? 'extracted' : 'not_attempted',
    viabilityScore: null,
    risks: [],
    pdfPath: null,
    bidLink: `${CSPGCL_PORTAL_BASE}?paramflag=${raw.paramflag}`,
    status: deriveStatus(endDate),
    fetchedAt: new Date(),
    sourceMeta: {
      plantId: raw.plantId,
      plantLabel: raw.plantLabel,
      paramflag: raw.paramflag,
      rfxId: raw.rfxId,
      docEventTarget: raw.docEventTarget,
      isEbidding: !!raw.isEbidding,
    },
    rawJson: raw,
  };
}
