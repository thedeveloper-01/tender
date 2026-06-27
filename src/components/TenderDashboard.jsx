import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = '';

const CATEGORIES = [
  'Civil Works', 'Mechanical', 'Electrical', 'Manpower', 'Procurement',
  'Environment', 'EPC', 'IT & Software', 'Transport', 'General',
];

const CG_CITIES = [
  'Raipur', 'Bilaspur', 'Durg', 'Korba', 'Raigarh', 'Rajnandgaon',
  'Bastar', 'Surguja', 'Dhamtari', 'Mahasamund', 'Kanker', 'Kondagaon',
  'Dantewada', 'Sukma', 'Bijapur', 'Narayanpur', 'Kabirdham', 'Mungeli',
  'Janjgir-Champa', 'Korea', 'Surajpur', 'Balrampur', 'Jashpur',
  'Gariaband', 'Balod', 'Baloda Bazar', 'Bemetara', 'Mohla-Manpur',
  'Sarangarh-Bilaigarh', 'Khairagarh-Chhuikhadan-Gandai',
  'Manendragarh-Chirmiri-Bharatpur', 'Sakti', 'Gaurela-Pendra-Marwahi',
  'Unspecified',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val) {
  if (val == null || isNaN(val)) return 'N/A';
  return '₹' + Number(val).toLocaleString('en-IN');
}

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysLeft(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d - new Date()) / 86400000);
}

function deadlineBadge(dl) {
  if (dl == null) return null;
  if (dl < 0) return { label: 'Closed', cls: 'bg-gray-100 text-gray-500' };
  if (dl === 0) return { label: 'Closes today', cls: 'bg-red-100 text-red-700 font-semibold' };
  if (dl <= 2) return { label: `${dl}d left`, cls: 'bg-red-100 text-red-700 font-semibold' };
  if (dl <= 7) return { label: `${dl}d left`, cls: 'bg-amber-100 text-amber-700' };
  return { label: `${dl}d left`, cls: 'bg-green-100 text-green-700' };
}



function titleSlug(t) {
  return (t || 'tender')
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

function detailPath(t) {
  // Do NOT encode the bidNumber — GEM bid numbers contain slashes (GEM/2026/B/…)
  // which must stay as raw path separators for the slug parser to work correctly.
  return `/tenders/${t.source.toLowerCase()}-${t.bidNumber}-${titleSlug(t.title)}`;
}

function pdfUrl(t) {
  return `${API_BASE}/api/tenders/${t.source}/${encodeURIComponent(t.bidNumber)}/document`;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-5 h-44 md:h-28"></div>
      ))}
    </div>
  );
}

// ─── Tender Card ─────────────────────────────────────────────────────────────

// --- Tender Card -------------------------------------------------------------

// --- Tender Card -------------------------------------------------------------

function TenderCard({ t }) {
  const dl = daysLeft(t.endDate);
  const badge = deadlineBadge(dl);

  const fields = t.source === 'GEM' ? t.sourceMeta?.pdfExtract?.fields || {} : {};
  const mseExempt     = fields.mseExemption?.value;
  const startupExempt = fields.startupExemption?.value;
  const bidType       = fields.bidType?.value;
  const experience    = fields.experienceCriteria?.value;

  const isMseYes     = mseExempt?.toLowerCase() === 'yes';
  const isStartupYes = startupExempt?.toLowerCase() === 'yes';

  const hasValue = t.bidValue != null && !isNaN(t.bidValue) && t.bidValue > 0;
  const hasEmd   = t.emdAmount != null && !isNaN(t.emdAmount) && t.emdAmount > 0;

  return (
    <article className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 hover:border-blue-400/50 dark:hover:border-blue-500/40 hover:shadow-lg transition-all duration-200 group relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-transparent group-hover:bg-[#1A56DB] transition-all duration-200 rounded-l-2xl" />

      <div className="p-4 flex flex-col lg:grid lg:grid-cols-[1fr_210px_165px] lg:divide-x lg:divide-gray-100 dark:lg:divide-slate-800 lg:items-center gap-4">

        {/* -- Col 1: Info -- */}
        <div className="min-w-0 flex flex-col gap-1.5 pr-0 lg:pr-4">

          {/* Badges row � source, plant, location, deadline, exemptions, category */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={t.source === 'GEM'
              ? 'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold tracking-widest uppercase bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800'
              : 'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold tracking-widest uppercase bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
            }>{t.source}</span>

            {t.source === 'CSPGCL' && t.sourceMeta?.plantLabel && (
              <a href={t.bidLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800 transition"
              >
                {t.sourceMeta.plantLabel}
                <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}

            {t.locationCity && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
                <svg className="w-2.5 h-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {t.locationCity}
              </span>
            )}

            {badge && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>}

            {t.sourceMeta?.isEbidding && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">e-Bid</span>
            )}

            {/* MSE/Startup inline with badges */}
            {mseExempt && (
              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${isMseYes ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900'}`}>
                {isMseYes ? '?' : '?'} MSE
              </span>
            )}
            {startupExempt && (
              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${isStartupYes ? 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800' : 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900'}`}>
                {isStartupYes ? '?' : '?'} Startup
              </span>
            )}
            {bidType && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">{bidType}</span>
            )}

            {t.category?.slice(0, 1).map(cat => (
              <span key={cat} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50/70 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900">{cat}</span>
            ))}
          </div>

          {/* Title */}
          <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-white leading-snug group-hover:text-[#1A56DB] dark:group-hover:text-blue-400 transition-colors duration-150 line-clamp-2">
            <a href={detailPath(t)}>{t.title}</a>
          </h3>

          {/* Org + Notice No on same line */}
          <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-gray-400 dark:text-slate-500">
            {(t.organization || t.department) && (
              <span className="font-medium text-gray-500 dark:text-slate-400 truncate max-w-[260px]">{t.organization || t.department}</span>
            )}
            <span className="font-mono">
              <span className="opacity-70">No.</span>{' '}
              <strong className="text-gray-600 dark:text-slate-300 font-semibold bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-1.5 py-px rounded select-all">{t.bidNumber}</strong>
            </span>
            {t.valueExtractionStatus === 'not_found' && (
              <span className="text-amber-500 dark:text-amber-400 italic">Value not in PDF</span>
            )}
          </div>

          {/* Experience (only if present) */}
          {experience && (
            <div className="flex items-start gap-1 text-[11px]" title={experience}>
              <span className="font-extrabold text-violet-500 dark:text-violet-400 uppercase tracking-wide text-[9px] flex-shrink-0 mt-[2px]">Exp:</span>
              <span className="line-clamp-1 text-gray-500 dark:text-slate-400 font-medium flex-1">{experience}</span>
            </div>
          )}

          {/* Risk flags (compact) */}
          {t.risks?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[9px] font-extrabold text-red-400 dark:text-red-500 uppercase tracking-widest">Risks:</span>
              {t.risks.slice(0, 2).map(r => (
                <span key={r} className="text-[10px] bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/40 px-1.5 py-px rounded font-semibold">{r}</span>
              ))}
            </div>
          )}
        </div>

        {/* -- Col 2: Financials -- */}
        <div className="lg:px-5 flex flex-row lg:flex-col justify-between lg:justify-center gap-3 border-t lg:border-t-0 pt-3 lg:pt-0">
          <div>
            <p className="text-[9px] text-gray-400 dark:text-slate-500 font-extrabold uppercase tracking-widest mb-0.5">Bid Value</p>
            {hasValue
              ? <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 leading-none">{fmt(t.bidValue)}</p>
              : <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 italic">Not Available</p>
            }
          </div>
          <div>
            <p className="text-[9px] text-gray-400 dark:text-slate-500 font-extrabold uppercase tracking-widest mb-0.5">EMD Amount</p>
            {hasEmd
              ? <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{fmt(t.emdAmount)}</p>
              : <p className="text-sm font-semibold text-gray-400 dark:text-slate-500">N/A / Exempt</p>
            }
          </div>
        </div>

        {/* -- Col 3: Date + CTA -- */}
        <div className="lg:pl-5 flex flex-col justify-center items-stretch lg:items-end gap-2.5 border-t lg:border-t-0 pt-3 lg:pt-0">
          <div className="text-left lg:text-right">
            <p className="text-[9px] text-gray-400 dark:text-slate-500 font-extrabold uppercase tracking-widest mb-0.5">Closing Date</p>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{fmtDate(t.endDate)}</p>
            {dl != null && (
              <p className={`text-[10px] font-semibold mt-0.5 ${dl < 0 ? 'text-gray-400 dark:text-slate-600' : dl <= 2 ? 'text-red-500 dark:text-red-400' : dl <= 7 ? 'text-amber-500 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                {dl < 0 ? 'Closed' : dl === 0 ? 'Closes today' : `${dl} days left`}
              </p>
            )}
          </div>
          <a href={detailPath(t)}
            className="w-full text-center px-4 py-2 bg-[#1A56DB] hover:bg-blue-600 active:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all duration-150 shadow-sm hover:shadow-md hover:shadow-blue-500/20 whitespace-nowrap"
          >
            View Details
          </a>
        </div>
      </div>
    </article>
  );
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────

function FilterPanel({ filters, onChange, onReset, totalResults, loading }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const inner = (
    <div className="space-y-5">
      {/* Source */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide mb-2">Source</label>
        <div className="flex gap-2">
          {['all', 'GEM', 'CSPGCL'].map(s => (
            <button key={s} onClick={() => onChange('source', s)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${filters.source === s
                ? 'bg-[#1A56DB] text-white border-[#1A56DB]'
                : 'bg-white dark:bg-slate-950 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-800 hover:border-[#1A56DB] dark:hover:border-blue-500'
                }`}
            >{s === 'all' ? 'All' : s}</button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide mb-2">Status</label>
        <div className="flex gap-2">
          {['open', 'all', 'closed'].map(s => (
            <button key={s} onClick={() => onChange('status', s)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition ${filters.status === s
                ? 'bg-[#1A56DB] text-white border-[#1A56DB]'
                : 'bg-white dark:bg-slate-950 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-800 hover:border-[#1A56DB] dark:hover:border-blue-500'
                }`}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* District or Plant selection */}
      {filters.source === 'CSPGCL' ? (
        <div>
          <label htmlFor="filter-plant" className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide mb-2">Plant / Office</label>
          <select id="filter-plant" value={filters.plant || 'all'} onChange={e => onChange('plant', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-800 text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-500">
            <option value="all">All Plants & Offices</option>
            <option value="central">Central Offices</option>
            <option value="korba-west">Hasdeo HTPS — Korba West</option>
            <option value="dspm">Dr. Shyama Prasad Mukharjee TPS</option>
            <option value="marwa">Marwa Tendubhata TPS</option>
          </select>
        </div>
      ) : (
        <div>
          <label htmlFor="filter-district" className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide mb-2">District</label>
          <select id="filter-district" value={filters.city} onChange={e => onChange('city', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-800 text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-500">
            <option value="all">All Chhattisgarh</option>
            {CG_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* Category */}
      {filters.source !== 'CSPGCL' && (
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide mb-2">Category</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(c => {
              const cats = filters.category ? filters.category.split(',') : [];
              const active = cats.includes(c);
              return (
                <button key={c}
                  onClick={() => {
                    const next = active ? cats.filter(x => x !== c) : [...cats, c];
                    onChange('category', next.join(','));
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${active
                    ? 'bg-[#1A56DB] text-white border-[#1A56DB]'
                    : 'bg-white dark:bg-slate-950 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-800 hover:border-[#1A56DB] dark:hover:border-blue-500'
                    }`}
                >{c}</button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bid Value Range */}
      <div>
        <label id="filter-bid-value-label" className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide mb-2">Bid Value (₹)</label>
        <div className="flex gap-2">
          <input type="number" id="filter-min-bid-value" aria-labelledby="filter-bid-value-label" aria-label="Minimum Bid Value" placeholder="Min" value={filters.minValue || ''}
            onChange={e => onChange('minValue', e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-800 text-xs bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-500" />
          <input type="number" id="filter-max-bid-value" aria-labelledby="filter-bid-value-label" aria-label="Maximum Bid Value" placeholder="Max" value={filters.maxValue || ''}
            onChange={e => onChange('maxValue', e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-800 text-xs bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-500" />
        </div>
      </div>

      {/* EMD Range */}
      <div>
        <label id="filter-emd-label" className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide mb-2">EMD Amount (₹)</label>
        <div className="flex gap-2">
          <input type="number" id="filter-min-emd" aria-labelledby="filter-emd-label" aria-label="Minimum EMD" placeholder="Min" value={filters.minEmd || ''}
            onChange={e => onChange('minEmd', e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-800 text-xs bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-500" />
          <input type="number" id="filter-max-emd" aria-labelledby="filter-emd-label" aria-label="Maximum EMD" placeholder="Max" value={filters.maxEmd || ''}
            onChange={e => onChange('maxEmd', e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-800 text-xs bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-500" />
        </div>
      </div>

      <button onClick={onReset}
        className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition font-medium">
        Reset Filters
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div className="lg:hidden mb-4">
        <button onClick={() => setMobileOpen(o => !o)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-sm font-medium text-gray-700 dark:text-slate-300 hover:border-blue-500 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM3 16a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" />
          </svg>
          Filters
          <span className="bg-[#1A56DB] text-white text-xs rounded-full px-1.5 py-0.5 font-bold">
            {loading ? '...' : totalResults}
          </span>
          <svg className={`w-4 h-4 transition-transform ${mobileOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {mobileOpen && (
          <div className="mt-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-lg">
            {inner}
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 xl:w-72 flex-shrink-0">
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 sticky top-20 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Filters</h3>
            <span className="text-xs text-gray-400 dark:text-slate-500 font-semibold">
              {loading ? 'Loading...' : `${totalResults} result${totalResults !== 1 ? 's' : ''}`}
            </span>
          </div>
          {inner}
        </div>
      </aside>
    </>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const DEFAULT_FILTERS = {
  source: 'all', status: 'open', city: 'all', plant: 'all',
  category: '', minValue: '', maxValue: '', minEmd: '', maxEmd: '',
  mseStartupOnly: false,
  zeroExperienceOnly: false,
  highValueOnly: false,
  lowEmdOnly: false,
};

/**
 * @param {object} props
 * @param {string} [props.initialCity]
 * @param {string} [props.initialSource]
 * @param {any[] | null} [props.initialTenders]
 * @param {number} [props.initialTotal]
 */
export default function TenderDashboard({
  initialCity = '',
  initialSource = 'all',
  initialTenders = null,
  initialTotal = 0
}) {
  const [tenders, setTenders] = useState(initialTenders || []);
  const [total, setTotal] = useState(initialTenders ? initialTotal : 0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(initialTenders ? false : true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('endDate_asc');
  const [filters, setFilters] = useState(() => {
    let source = initialSource || 'all';
    let city = initialCity || 'all';
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('source');
      if (s === 'GEM' || s === 'CSPGCL' || s === 'all') source = s;
      const c = params.get('city');
      if (c) city = c;
    }
    return { ...DEFAULT_FILTERS, source, city };
  });
  const debounceRef = useRef(null);
  const isFirstLoad = useRef(true);

  const loadTenders = useCallback(async (currentFilters, currentQ, currentSort, currentPage) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (currentQ) params.set('q', currentQ);
      if (currentFilters.source !== 'all') params.set('source', currentFilters.source);
      if (currentFilters.status !== 'all') params.set('status', currentFilters.status);
      if (currentFilters.city !== 'all') params.set('city', currentFilters.city);
      if (currentFilters.category) params.set('category', currentFilters.category);
      let minValToUse = currentFilters.minValue;
      if (currentFilters.highValueOnly) minValToUse = '10000000';
      if (minValToUse) params.set('minValue', minValToUse);

      if (currentFilters.maxValue) params.set('maxValue', currentFilters.maxValue);
      if (currentFilters.minEmd) params.set('minEmd', currentFilters.minEmd);

      let maxEmdToUse = currentFilters.maxEmd;
      if (currentFilters.lowEmdOnly) maxEmdToUse = '10000';
      if (maxEmdToUse) params.set('maxEmd', maxEmdToUse);
      params.set('sort', currentSort);
      params.set('page', currentPage);
      params.set('limit', '100');

      const resp = await fetch(`${API_BASE}/api/tenders?${params}`);
      if (!resp.ok) throw new Error(`API error ${resp.status}`);
      const data = await resp.json();
      setTenders(data.tenders || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Fire immediately on first load — no debounce wait
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      if (initialTenders) {
        return;
      }
      loadTenders(filters, q, sort, page);
      return;
    }
    debounceRef.current = setTimeout(() => {
      loadTenders(filters, q, sort, page);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [filters, q, sort, page, loadTenders]);

  const onFilterChange = (key, value) => {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(1);
  };

  const onReset = () => {
    setFilters({ ...DEFAULT_FILTERS, city: initialCity || 'all' });
    setQ('');
    setSort('endDate_asc');
    setPage(1);
  };

  const displayedTenders = tenders.filter(t => {
    if (filters.source === 'CSPGCL' && filters.plant && filters.plant !== 'all') {
      if (t.sourceMeta?.plantId !== filters.plant) return false;
    }
    if (filters.mseStartupOnly) {
      const isMseExempt = t.sourceMeta?.pdfExtract?.fields?.mseExemption?.value?.toLowerCase() === 'yes';
      const isStartupExempt = t.sourceMeta?.pdfExtract?.fields?.startupExemption?.value?.toLowerCase() === 'yes';
      if (!isMseExempt && !isStartupExempt) return false;
    }
    if (filters.zeroExperienceOnly) {
      const exp = t.sourceMeta?.pdfExtract?.fields?.experienceCriteria?.value?.toLowerCase();
      const hasExp = exp && !exp.includes('0') && !exp.includes('no') && !exp.includes('not required') && !exp.includes('nil') && !exp.includes('exempt');
      if (hasExp) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(total / 100);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            id="search-tenders-input"
            aria-label="Search tenders by keyword, number, or organisation"
            placeholder="Search tenders by keyword, number, organisation…"
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-500 shadow-sm transition"
          />
        </div>

        {/* Sort */}
        <select
          id="sort-tenders-select"
          aria-label="Sort tenders by criteria"
          value={sort}
          onChange={e => { setSort(e.target.value); setPage(1); }}
          className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-500 shadow-sm transition"
        >
          <option value="endDate_asc">Sort by: Closing soonest</option>
          <option value="endDate_desc">Sort by: Closing latest</option>
          <option value="bidValue_desc">Sort by: Value high to low</option>
          <option value="bidValue_asc">Sort by: Value low to high</option>
          <option value="emdAmount_asc">Sort by: EMD low to high</option>
          <option value="fetchedAt_desc">Sort by: Newest first</option>
        </select>
      </div>

      {/* Quick Toggles */}
      {filters.source !== 'CSPGCL' && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mr-1">Quick Toggles:</span>
          {[
            { key: 'mseStartupOnly', label: 'Startup/MSE Exempt' },
            { key: 'zeroExperienceOnly', label: 'Zero Exp. Required' },
            { key: 'highValueOnly', label: 'High Value (> 1 Cr)' },
            { key: 'lowEmdOnly', label: 'Low EMD (< 10k)' },
          ].map(({ key, label }) => {
            const active = filters[key];
            return (
              <button
                key={key}
                onClick={() => onFilterChange(key, !active)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition duration-150 flex items-center gap-1.5 ${active
                  ? 'bg-[#1A56DB] border-[#1A56DB] text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-300 hover:border-blue-500/40 hover:text-[#1A56DB]'
                  }`}
              >
                {active && (
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
        <FilterPanel
          filters={filters}
          onChange={onFilterChange}
          onReset={onReset}
          totalResults={total}
          loading={loading}
        />

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {error && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl p-4 text-red-700 dark:text-red-400 text-sm mb-6">
              Error loading tenders: {error}
            </div>
          )}

          {loading ? (
            <Skeleton />
          ) : displayedTenders.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-8 text-center shadow-sm">
              <p className="text-gray-500 dark:text-slate-400 text-sm font-medium">No tenders match your filters</p>
              <button onClick={onReset} className="mt-3 text-sm text-[#1A56DB] hover:underline">Reset filters</button>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 dark:text-slate-400 mb-4">
                {displayedTenders.length === tenders.length
                  ? `${total.toLocaleString()} result${total !== 1 ? 's' : ''}`
                  : `Showing ${displayedTenders.length} matching of ${tenders.length} page results (${total.toLocaleString()} total)`}
              </p>
              <div className="flex flex-col gap-3">
                {displayedTenders.map(t => <TenderCard key={`${t.source}-${t.bidNumber}`} t={t} />)}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                    Previous
                  </button>
                  <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
