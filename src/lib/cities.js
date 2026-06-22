// 33 Chhattisgarh districts — kept in sync with backend/src/config.js
export const CG_CITIES = [
  'Raipur', 'Bilaspur', 'Durg', 'Korba', 'Raigarh', 'Rajnandgaon',
  'Bastar', 'Surguja', 'Dhamtari', 'Mahasamund', 'Kanker', 'Kondagaon',
  'Dantewada', 'Sukma', 'Bijapur', 'Narayanpur', 'Kabirdham', 'Mungeli',
  'Janjgir-Champa', 'Korea', 'Surajpur', 'Balrampur', 'Jashpur',
  'Gariaband', 'Balod', 'Baloda Bazar', 'Bemetara', 'Mohla-Manpur',
  'Sarangarh-Bilaigarh', 'Khairagarh-Chhuikhadan-Gandai',
  'Manendragarh-Chirmiri-Bharatpur', 'Sakti', 'Gaurela-Pendra-Marwahi',
];

export function citySlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function cityFromSlug(slug) {
  return CG_CITIES.find((c) => citySlug(c) === slug) || null;
}

export function formatRupee(val) {
  if (val == null || isNaN(val)) return 'Not available';
  return '₹' + Number(val).toLocaleString('en-IN');
}

export function formatDate(dateStr) {
  if (!dateStr) return 'Not specified';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Not specified';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function daysLeft(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return null;
  return Math.ceil((target - new Date()) / (1000 * 60 * 60 * 24));
}

/** Build the slug used in tender detail page URLs.
 * Sanitises away date strings, parentheticals, & chars that break URLs. */
export function titleSlug(title) {
  return (title || 'tender')
    .toLowerCase()
    // Remove literal date phrases like "dated 08.05.2026" or "date 01-06-2026"
    .replace(/\b(dated?)\s+\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}\b/gi, '')
    // Remove content in parentheses entirely
    .replace(/\([^)]*\)/g, '')
    // Replace & with "and"
    .replace(/&/g, '-and-')
    // Replace all non-alphanumeric chars (including . , / ( ) ) with -
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse multiple hyphens to one
    .replace(/-{2,}/g, '-')
    // Trim leading/trailing hyphens
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

export function tenderDetailPath(tender) {
  // Do NOT encode bidNumber — GEM bids have slashes (GEM/2026/B/…) that must
  // remain as literal path separators for the [...slug] parser to work.
  return `/tenders/${tender.source.toLowerCase()}-${tender.bidNumber}-${titleSlug(tender.title)}`;
}

/**
 * Sanitise an arbitrary raw slug segment (the title portion after the bid number)
 * using the same rules as titleSlug(). Used to detect and 301-redirect old broken slugs.
 *
 * @param {string} rawTitlePart - the title portion of the slug (everything after bidNumber-)
 * @returns {string} cleaned slug
 */
export function sanitiseTitlePart(rawTitlePart) {
  return titleSlug(rawTitlePart.replace(/-/g, ' '));
}
