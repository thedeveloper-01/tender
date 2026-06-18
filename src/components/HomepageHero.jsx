import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.PUBLIC_API_BASE_URL || 'http://localhost:4000';

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

function titleSlug(t) {
  return (t || 'tender').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
}

function detailPath(t) {
  return `/tenders/${t.source.toLowerCase()}-${t.bidNumber}-${titleSlug(t.title)}`;
}

function viabilityBg(score) {
  if (score == null) return 'bg-gray-100 text-gray-500';
  if (score >= 8) return 'bg-[#057A55] text-white';
  if (score >= 5) return 'bg-[#C27803] text-white';
  return 'bg-[#E02424] text-white';
}

// ── Card Skeleton ──────────────────────────────────────────────────────────────

function CardSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 h-44 animate-pulse space-y-3">
          <div className="flex gap-2">
            <div className="h-5 w-10 bg-gray-100 rounded-md" />
            <div className="h-5 w-16 bg-gray-100 rounded-md" />
            <div className="ml-auto h-5 w-14 bg-gray-100 rounded-full" />
          </div>
          <div className="h-4 bg-gray-100 rounded w-5/6" />
          <div className="h-3 bg-gray-100 rounded w-3/4" />
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="h-3 bg-gray-100 rounded" />
            <div className="h-3 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── GEM Tender Card ────────────────────────────────────────────────────────────

function GemCard({ t }) {
  const dl = daysLeft(t.endDate);
  return (
    <a
      href={detailPath(t)}
      className="group flex flex-col bg-white border border-violet-100 hover:border-violet-400 hover:shadow-md transition rounded-2xl overflow-hidden"
    >
      <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-400" />
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-violet-100 text-violet-700">
            GeM
          </span>
          <div className="flex items-center gap-1.5">
            {t.category?.slice(0, 1).map((c) => (
              <span key={c} className="text-xs bg-violet-50 text-violet-600 px-2 py-0.5 rounded-md font-medium">{c}</span>
            ))}
            {dl != null && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                dl <= 0 ? 'bg-gray-100 text-gray-500' : dl <= 2 ? 'bg-red-100 text-red-700' : dl <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
              }`}>
                {dl < 0 ? 'Closed' : dl === 0 ? 'Today' : `${dl}d`}
              </span>
            )}
          </div>
        </div>
        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-1.5 group-hover:text-violet-700 transition leading-snug flex-1">
          {t.title}
        </h3>
        {t.organization && <p className="text-xs text-gray-400 line-clamp-1 mb-3">{t.organization}</p>}
        <div className="grid grid-cols-2 gap-2 text-xs mt-auto pt-3 border-t border-violet-50">
          <div>
            <p className="text-gray-400">Bid Value</p>
            <p className="font-semibold text-gray-800">{fmt(t.bidValue)}</p>
          </div>
          <div>
            <p className="text-gray-400">EMD</p>
            <p className="font-semibold text-gray-800">{fmt(t.emdAmount)}</p>
          </div>
          <div>
            <p className="text-gray-400">Closing</p>
            <p className="font-medium text-gray-700">{fmtDate(t.endDate)}</p>
          </div>
          <div>
            <p className="text-gray-400">District</p>
            <p className="font-medium text-gray-700">{t.locationCity || 'Unspecified'}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          {t.viabilityScore != null && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${viabilityBg(t.viabilityScore)}`}>
              {t.viabilityScore}/10
            </span>
          )}
          <span className="ml-auto text-xs text-violet-600 font-medium group-hover:underline">View details →</span>
        </div>
      </div>
    </a>
  );
}

// ── CSPGCL Row ─────────────────────────────────────────────────────────────────

function CspgclRow({ t }) {
  const dl = daysLeft(t.endDate);
  return (
    <a
      href={detailPath(t)}
      className="group flex flex-col md:grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] md:items-center gap-3 md:gap-4 px-5 py-4 hover:bg-amber-50/60 transition border-b border-gray-100 last:border-0"
    >
      <div>
        <div className="flex items-center gap-2 mb-1 md:mb-0.5">
          <span className="md:hidden inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-700">CSPGCL</span>
          {t.category?.slice(0, 1).map((c) => (
            <span key={c} className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-md font-medium">{c}</span>
          ))}
          {dl != null && (
            <span className={`md:hidden text-xs px-2 py-0.5 rounded-full font-medium ${
              dl <= 0 ? 'bg-gray-100 text-gray-500' : dl <= 2 ? 'bg-red-100 text-red-700' : dl <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
            }`}>
              {dl < 0 ? 'Closed' : dl === 0 ? 'Today' : `${dl}d`}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-amber-700 transition leading-snug">
          {t.title}
        </p>
        {t.organization && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{t.organization}</p>}
      </div>
      <div>
        <p className="text-xs text-gray-400 md:hidden">Bid Value</p>
        <p className="text-sm font-semibold text-gray-900">{fmt(t.bidValue)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-400 md:hidden">EMD</p>
        <p className="text-sm font-semibold text-gray-900">{fmt(t.emdAmount)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-400 md:hidden">Closing</p>
        <div>
          <p className="text-sm text-gray-700">{fmtDate(t.endDate)}</p>
          {dl != null && (
            <span className={`hidden md:inline text-xs font-medium ${
              dl <= 0 ? 'text-gray-400' : dl <= 2 ? 'text-red-600' : dl <= 7 ? 'text-amber-600' : 'text-green-600'
            }`}>
              {dl < 0 ? 'Closed' : dl === 0 ? 'Today' : `${dl}d left`}
            </span>
          )}
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-400 md:hidden">District</p>
        <p className="text-sm text-gray-700">{t.locationCity || 'Unspecified'}</p>
      </div>
      <div className="flex items-center gap-2 justify-between md:justify-end">
        {t.viabilityScore != null && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${viabilityBg(t.viabilityScore)}`}>
            {t.viabilityScore}/10
          </span>
        )}
        <svg className="w-4 h-4 text-amber-400 group-hover:text-amber-600 transition flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </a>
  );
}

// ── Main Hero ─────────────────────────────────────────────────────────────────

export default function HomepageHero() {
  const [stats, setStats] = useState({ totalOpenTenders: 0, totalEstimatedValue: 0, bySource: {}, lastFetchAt: null });
  const [gemTenders, setGemTenders] = useState([]);
  const [cspgclTenders, setCspgclTenders] = useState([]);
  const [topCities, setTopCities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, gemRes, cspgclRes, citiesRes] = await Promise.all([
          fetch(`${API_BASE}/api/stats`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
          fetch(`${API_BASE}/api/tenders?status=open&source=GEM&sort=endDate_asc&limit=6`).then(r => r.ok ? r.json() : { tenders: [] }),
          fetch(`${API_BASE}/api/tenders?status=open&source=CSPGCL&sort=endDate_asc&limit=6`).then(r => r.ok ? r.json() : { tenders: [] }),
          fetch(`${API_BASE}/api/cities`).then(r => r.ok ? r.json() : { cities: [] }),
        ]);
        setStats(statsRes);
        setGemTenders(gemRes.tenders || []);
        setCspgclTenders(cspgclRes.tenders || []);
        setTopCities(citiesRes.cities || []);
      } catch (e) {
        console.error('[HomepageHero] fetch error:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const lastUpdated = stats.lastFetchAt
    ? new Date(stats.lastFetchAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <>
      {/* ── Hero strip ─────────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-[#1A56DB] to-[#1e3a8a] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/10 border border-white/20 rounded-full text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Updated daily · GeM + CSPGCL
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight font-['Outfit']">
                Chhattisgarh Government Tenders
              </h1>
              <p className="text-blue-200 text-sm mt-1.5">
                GeM and CSPGCL open tenders in one place
                {lastUpdated && <span> · Last updated {lastUpdated}</span>}
              </p>
            </div>
            {/* Stats */}
            <div className="flex flex-wrap gap-3">
              <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-center min-w-[80px]">
                {loading
                  ? <div className="h-7 w-12 bg-white/20 rounded animate-pulse mx-auto mb-1" />
                  : <p className="text-2xl font-extrabold font-['Outfit'] leading-none">{stats.totalOpenTenders}</p>
                }
                <p className="text-xs text-blue-200 mt-0.5">Open</p>
              </div>
              <div className="bg-violet-500/30 border border-violet-400/40 rounded-xl px-4 py-2.5 text-center min-w-[80px]">
                {loading
                  ? <div className="h-7 w-10 bg-white/20 rounded animate-pulse mx-auto mb-1" />
                  : <p className="text-2xl font-extrabold font-['Outfit'] leading-none">{stats.bySource?.GEM || 0}</p>
                }
                <p className="text-xs text-violet-200 mt-0.5">GeM</p>
              </div>
              <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl px-4 py-2.5 text-center min-w-[80px]">
                {loading
                  ? <div className="h-7 w-10 bg-white/20 rounded animate-pulse mx-auto mb-1" />
                  : <p className="text-2xl font-extrabold font-['Outfit'] leading-none">{stats.bySource?.CSPGCL || 0}</p>
                }
                <p className="text-xs text-amber-200 mt-0.5">CSPGCL</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-12">

        {/* ── GeM Section ──────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 rounded-full bg-violet-500" />
              <div>
                <h2 className="text-lg md:text-xl font-bold text-gray-900 font-['Outfit']">GeM Portal Tenders</h2>
                <p className="text-xs text-gray-500">Government e-Marketplace — Chhattisgarh</p>
              </div>
              <span className="ml-1 px-2.5 py-0.5 bg-violet-100 text-violet-700 text-xs font-bold rounded-full">
                {stats.bySource?.GEM || 0} open
              </span>
            </div>
            <a href="/tenders?source=GEM" className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 hover:underline">
              View all GeM
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {loading ? (
            <CardSkeleton count={6} />
          ) : gemTenders.length === 0 ? (
            <div className="text-center py-10 bg-violet-50 rounded-2xl border border-violet-100 text-violet-400 text-sm">
              No GeM tenders loaded yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {gemTenders.map(t => <GemCard key={`${t.source}-${t.bidNumber}`} t={t} />)}
            </div>
          )}
        </section>

        {/* ── CSPGCL Section ───────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 rounded-full bg-amber-500" />
              <div>
                <h2 className="text-lg md:text-xl font-bold text-gray-900 font-['Outfit']">CSPGCL Tenders</h2>
                <p className="text-xs text-gray-500">Chhattisgarh State Power Generation Company</p>
              </div>
              <span className="ml-1 px-2.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
                {stats.bySource?.CSPGCL || 0} open
              </span>
            </div>
            <a href="/tenders?source=CSPGCL" className="inline-flex items-center gap-1 text-sm font-medium text-amber-600 hover:underline">
              View all CSPGCL
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {loading ? (
            <div className="bg-white border border-amber-100 rounded-2xl overflow-hidden">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-5 py-4 border-b border-gray-100 last:border-0 animate-pulse">
                  <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : cspgclTenders.length === 0 ? (
            <div className="text-center py-10 bg-amber-50 rounded-2xl border border-amber-100 text-amber-400 text-sm">
              No CSPGCL tenders loaded yet.
            </div>
          ) : (
            <div className="bg-white border border-amber-100 rounded-2xl overflow-hidden">
              <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 bg-amber-50 border-b border-amber-100 text-xs font-semibold text-amber-700 uppercase tracking-wide">
                <span>Tender / Organisation</span>
                <span>Bid Value</span>
                <span>EMD</span>
                <span>Closing</span>
                <span>District</span>
                <span />
              </div>
              {cspgclTenders.map(t => <CspgclRow key={`${t.source}-${t.bidNumber}`} t={t} />)}
            </div>
          )}
        </section>

        {/* ── Districts strip ────────────────────────────────────────── */}
        {!loading && topCities.filter(c => c.openCount > 0).length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 font-['Outfit']">Active Districts</h2>
              <a href="/districts" className="text-sm font-medium text-[#1A56DB] hover:underline">All 33 districts →</a>
            </div>
            <div className="flex flex-wrap gap-2">
              {topCities
                .filter(c => c.openCount > 0)
                .sort((a, b) => b.openCount - a.openCount)
                .slice(0, 18)
                .map(c => (
                  <a
                    key={c.slug}
                    href={`/tenders/${c.slug}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:border-[#1A56DB] hover:text-[#1A56DB] transition"
                  >
                    {c.name}
                    <span className="bg-blue-50 text-[#1A56DB] text-xs font-semibold px-1.5 py-0.5 rounded-full">{c.openCount}</span>
                  </a>
                ))
              }
            </div>
          </section>
        )}

      </div>
    </>
  );
}
