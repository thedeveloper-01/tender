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
  return (t || 'tender').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
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
        <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 h-36"></div>
      ))}
    </div>
  );
}

// ─── Tender Card ─────────────────────────────────────────────────────────────

function TenderCard({ t }) {
  const dl = daysLeft(t.endDate);
  const badge = deadlineBadge(dl);

  return (
    <article className="bg-white rounded-2xl border border-gray-200 hover:border-[#1A56DB]/40 hover:shadow-md transition group">
      <div className="p-5">
        {/* Top row */}
        <div className="flex items-start gap-2 mb-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold flex-shrink-0 ${t.source === 'GEM' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'
            }`}>{t.source}</span>

          {t.category?.slice(0, 2).map(c => (
            <span key={c} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-blue-50 text-blue-700 font-medium">{c}</span>
          ))}

          <span className="ml-auto flex-shrink-0">
            {badge && <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-1 group-hover:text-[#1A56DB] transition leading-snug">
          {t.title}
        </h3>
        {t.organization && (
          <p className="text-xs text-gray-500 mb-3 line-clamp-1">{t.organization}</p>
        )}

        {/* Value row */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
          <div>
            <p className="text-xs text-gray-400">Bid Value</p>
            <p className="text-sm font-semibold text-gray-900">{fmt(t.bidValue)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">EMD</p>
            <p className="text-sm font-semibold text-gray-900">{fmt(t.emdAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Closing</p>
            <p className="text-sm text-gray-700">{fmtDate(t.endDate)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">District</p>
            <p className="text-sm text-gray-700">{t.locationCity || 'Unspecified'}</p>
          </div>
        </div>

        {/* GEM extracted fields strip */}
        {t.source === 'GEM' && t.sourceMeta?.pdfExtract?.fields && (() => {
          const f = t.sourceMeta.pdfExtract.fields;
          // Exact keys as stored by backend/src/pipeline/extract.js
          const FIELDS = [
            { key: 'bidOfferValidity', label: 'Validity (Days)' },
            { key: 'mseExemption', label: 'MSE Exempt' },
            { key: 'startupExemption', label: 'Startup Exempt' },
            { key: 'experienceCriteria', label: 'Exp. Criteria' },
            { key: 'bidType', label: 'Bid Type' },
          ];
          const found = FIELDS.map(({ key, label }) =>
            f[key]?.value ? { label, value: f[key].value } : null
          ).filter(Boolean);

          if (!found.length) return null;
          return (
            <div className="mb-3 bg-violet-50/60 border border-violet-100 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wide mb-1.5">From Bid Document</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {found.map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] text-gray-400 leading-tight">{label}</p>
                    <p className="text-xs font-semibold text-gray-800 leading-snug truncate" title={value}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Risks */}
        {t.risks?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {t.risks.slice(0, 2).map(r => (
              <span key={r} className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{r}</span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            {t.sourceMeta?.isEbidding && (
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md font-medium">e-Bidding</span>
            )}
            {t.valueExtractionStatus === 'not_found' && (
              <span className="text-xs text-gray-400 italic">Value not extracted</span>
            )}
          </div>
          <a
            href={detailPath(t)}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#1A56DB] hover:underline"
          >
            View details
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
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
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Source</label>
        <div className="flex gap-2">
          {['all', 'GEM', 'CSPGCL'].map(s => (
            <button key={s} onClick={() => onChange('source', s)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${filters.source === s ? 'bg-[#1A56DB] text-white border-[#1A56DB]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1A56DB]'
                }`}
            >{s === 'all' ? 'All' : s}</button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Status</label>
        <div className="flex gap-2">
          {['open', 'all', 'closed'].map(s => (
            <button key={s} onClick={() => onChange('status', s)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition ${filters.status === s ? 'bg-[#1A56DB] text-white border-[#1A56DB]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1A56DB]'
                }`}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* District */}
      <div>
        <label htmlFor="filter-district" className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">District</label>
        <select id="filter-district" value={filters.city} onChange={e => onChange('city', e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]">
          <option value="all">All Chhattisgarh</option>
          {CG_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Category */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Category</label>
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
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${active ? 'bg-[#1A56DB] text-white border-[#1A56DB]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1A56DB]'
                  }`}
              >{c}</button>
            );
          })}
        </div>
      </div>

      {/* Bid Value Range */}
      <div>
        <label id="filter-bid-value-label" className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Bid Value (₹)</label>
        <div className="flex gap-2">
          <input type="number" id="filter-min-bid-value" aria-labelledby="filter-bid-value-label" aria-label="Minimum Bid Value" placeholder="Min" value={filters.minValue || ''}
            onChange={e => onChange('minValue', e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]" />
          <input type="number" id="filter-max-bid-value" aria-labelledby="filter-bid-value-label" aria-label="Maximum Bid Value" placeholder="Max" value={filters.maxValue || ''}
            onChange={e => onChange('maxValue', e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]" />
        </div>
      </div>

      {/* EMD Range */}
      <div>
        <label id="filter-emd-label" className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">EMD Amount (₹)</label>
        <div className="flex gap-2">
          <input type="number" id="filter-min-emd" aria-labelledby="filter-emd-label" aria-label="Minimum EMD" placeholder="Min" value={filters.minEmd || ''}
            onChange={e => onChange('minEmd', e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]" />
          <input type="number" id="filter-max-emd" aria-labelledby="filter-emd-label" aria-label="Maximum EMD" placeholder="Max" value={filters.maxEmd || ''}
            onChange={e => onChange('maxEmd', e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB]" />
        </div>
      </div>

      <button onClick={onReset}
        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition font-medium">
        Reset Filters
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div className="lg:hidden mb-4">
        <button onClick={() => setMobileOpen(o => !o)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-[#1A56DB] transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM3 16a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" />
          </svg>
          Filters
          <span className="bg-[#1A56DB] text-white text-xs rounded-full px-1.5 py-0.5">{totalResults}</span>
          <svg className={`w-4 h-4 transition-transform ${mobileOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {mobileOpen && (
          <div className="mt-3 bg-white border border-gray-200 rounded-2xl p-5 shadow-lg">
            {inner}
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 xl:w-72 flex-shrink-0">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 sticky top-20">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold text-gray-900">Filters</h3>
            <span className="text-xs text-gray-400">{totalResults} results</span>
          </div>
          {inner}
        </div>
      </aside>
    </>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const DEFAULT_FILTERS = {
  source: 'all', status: 'open', city: 'all',
  category: '', minValue: '', maxValue: '', minEmd: '', maxEmd: '',
};

export default function TenderDashboard({ initialCity = '', initialSource = 'all' }) {
  const [tenders, setTenders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
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
      if (currentFilters.minValue) params.set('minValue', currentFilters.minValue);
      if (currentFilters.maxValue) params.set('maxValue', currentFilters.maxValue);
      if (currentFilters.minEmd) params.set('minEmd', currentFilters.minEmd);
      if (currentFilters.maxEmd) params.set('maxEmd', currentFilters.maxEmd);
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

  const totalPages = Math.ceil(total / 100);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] shadow-sm"
          />
        </div>

        {/* Sort */}
        <select
          id="sort-tenders-select"
          aria-label="Sort tenders by criteria"
          value={sort}
          onChange={e => { setSort(e.target.value); setPage(1); }}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30 focus:border-[#1A56DB] shadow-sm"
        >
          <option value="endDate_asc">Closing: Soonest first</option>
          <option value="endDate_desc">Closing: Latest first</option>
          <option value="bidValue_desc">Value: High to low</option>
          <option value="bidValue_asc">Value: Low to high</option>
          <option value="emdAmount_asc">EMD: Low to high</option>
          <option value="fetchedAt_desc">Newest first</option>
        </select>
      </div>

      <div className="flex gap-6 items-start">
        {/* Filter sidebar */}
        <FilterPanel
          filters={filters}
          onChange={onFilterChange}
          onReset={onReset}
          totalResults={total}
          loading={loading}
        />

        {/* Results */}
        <div className="flex-1 min-w-0">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
              Could not load tenders: {error}
            </div>
          )}

          {loading ? <Skeleton /> : tenders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
              <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-500 text-sm font-medium">No tenders match your filters</p>
              <button onClick={onReset} className="mt-3 text-sm text-[#1A56DB] hover:underline">Reset filters</button>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-4">{total.toLocaleString()} result{total !== 1 ? 's' : ''}</p>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {tenders.map(t => <TenderCard key={`${t.source}-${t.bidNumber}`} t={t} />)}
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
        </div>
      </div>
    </div>
  );
}
