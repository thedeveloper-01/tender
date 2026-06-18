import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.PUBLIC_API_BASE_URL || 'http://localhost:4000';

export default function TendersStatsBar() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setStats(data); })
      .catch(() => {});
  }, []);

  const lastUpdated = stats?.lastFetchAt
    ? new Date(stats.lastFetchAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 font-['Outfit']">All Tenders</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              GeM and CSPGCL open tenders in Chhattisgarh
              {lastUpdated && <span className="text-gray-400"> · Updated {lastUpdated}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
              {stats
                ? <span className="text-xl font-extrabold text-[#1A56DB] font-['Outfit'] leading-none">{stats.totalOpenTenders}</span>
                : <div className="h-6 w-10 bg-blue-100 rounded animate-pulse" />
              }
              <span className="text-xs text-blue-600 font-medium leading-tight">Open<br />Tenders</span>
            </div>
            <div className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
              {stats
                ? <span className="text-xl font-extrabold text-violet-700 font-['Outfit'] leading-none">{stats.bySource?.GEM || 0}</span>
                : <div className="h-6 w-8 bg-violet-100 rounded animate-pulse" />
              }
              <span className="text-xs text-violet-600 font-medium leading-tight">GeM</span>
            </div>
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              {stats
                ? <span className="text-xl font-extrabold text-amber-700 font-['Outfit'] leading-none">{stats.bySource?.CSPGCL || 0}</span>
                : <div className="h-6 w-8 bg-amber-100 rounded animate-pulse" />
              }
              <span className="text-xs text-amber-600 font-medium leading-tight">CSPGCL</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
