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

/** @param {number | null | undefined} score */
export function viabilityColor(score) {
  if (score == null) return 'bg-gray-200 text-gray-700';
  if (score >= 8) return 'bg-[#057A55] text-white';
  if (score >= 5) return 'bg-[#C27803] text-white';
  return 'bg-[#E02424] text-white';
}

/** Build the slug used in tender detail page URLs. */
export function titleSlug(title) {
  return (title || 'tender')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

export function tenderDetailPath(tender) {
  // Do NOT encode bidNumber — GEM bids have slashes (GEM/2026/B/…) that must
  // remain as literal path separators for the [...slug] parser to work.
  return `/tenders/${tender.source.toLowerCase()}-${tender.bidNumber}-${titleSlug(tender.title)}`;
}
