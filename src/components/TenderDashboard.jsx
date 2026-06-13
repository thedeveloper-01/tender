import React, { useState, useEffect, useMemo } from 'react';
import { CITIES, cityToSlug } from '../lib/cities.js';

const CATEGORIES = [
  'Civil Works', 'Mechanical', 'Electrical', 'Manpower', 
  'Procurement', 'Environment', 'EPC', 'IT & Software', 
  'Transport', 'General'
];

const formatRupee = (val) => {
  if (val == null || isNaN(val)) return 'Not specified';
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)} Lakh`;
  return '₹' + Number(val).toLocaleString('en-IN');
};

const getDaysLeft = (dateStr) => {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  const diffMs = target - now;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const getViabilityColor = (score) => {
  if (score >= 8) return 'bg-[#057A55] text-white';
  if (score >= 5) return 'bg-[#C27803] text-white';
  return 'bg-[#E02424] text-white';
};

export default function TenderDashboard({ initialTenders = [] }) {
  // State: Data
  const [tenders, setTenders] = useState(initialTenders);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // State: Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState(''); // Empty means "All Chhattisgarh"
  const [selectedSource, setSelectedSource] = useState('All'); // "All" | "GEM" | "CSPGCL"
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [statusFilter, setStatusFilter] = useState('open'); // "open" | "closed" | "all"
  const [eBiddingOnly, setEbiddingOnly] = useState(false);
  
  // EMD and Bid Value caps
  const [emdCapOn, setEmdCapOn] = useState(false);
  const [emdCapValue, setEmdCapValue] = useState(100000); // 1 Lakh
  const [bidCapOn, setBidCapOn] = useState(false);
  const [bidCapValue, setBidCapValue] = useState(10000000); // 1 Crore

  // Sort
  const [sortBy, setSortBy] = useState('endDate'); // "endDate" | "bidValue" | "emdAmount" | "viabilityScore"
  const [sortOrder, setSortOrder] = useState('asc'); // "asc" | "desc"

  // Fetch fresh data if needed or on reload
  const refreshTenders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tenders?limit=1000');
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setTenders(data.tenders || []);
    } catch (err) {
      console.error('[TenderDashboard] Refresh failed:', err);
      setError('Failed to fetch tenders from server. Please verify the API backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialTenders.length === 0) {
      refreshTenders();
    }
  }, []);

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedCity('');
    setSelectedSource('All');
    setSelectedCategories([]);
    setStatusFilter('open');
    setEbiddingOnly(false);
    setEmdCapOn(false);
    setBidCapOn(false);
    setSortBy('endDate');
    setSortOrder('asc');
  };

  const toggleCategory = (cat) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  // Filter & Sort Logic
  const filteredTenders = useMemo(() => {
    let result = tenders.filter(t => {
      // Source filter
      if (selectedSource !== 'All' && t.source !== selectedSource) return false;
      
      // City/District filter
      if (selectedCity && t.locationCity !== selectedCity) return false;

      // Status filter
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;

      // e-Bidding toggle (CSPGCL-only indicator)
      if (eBiddingOnly && !t.sourceMeta?.is_ebidding) return false;

      // Keyword search (bid number, title, department, organization)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches = 
          t.title?.toLowerCase().includes(q) ||
          t.bidNumber?.toLowerCase().includes(q) ||
          t.department?.toLowerCase().includes(q) ||
          t.organization?.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Categories
      if (selectedCategories.length > 0) {
        if (!t.category || !t.category.some(c => selectedCategories.includes(c))) return false;
      }

      // EMD Cap
      if (emdCapOn && t.emdAmount != null && t.emdAmount > emdCapValue) return false;

      // Bid Value Cap
      if (bidCapOn && t.bidValue != null && t.bidValue > bidCapValue) return false;

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      // Handle nulls and dates
      if (sortBy === 'endDate' || sortBy === 'startDate') {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      } else {
        valA = valA ?? 0;
        valB = valB ?? 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [tenders, selectedSource, selectedCity, statusFilter, eBiddingOnly, searchQuery, selectedCategories, emdCapOn, emdCapValue, bidCapOn, bidCapValue, sortBy, sortOrder]);

  // Generate sitemap link safely
  function getTenderSlug(tender) {
    const safeBid = encodeURIComponent(tender.bidNumber);
    const safeTitle = tender.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 50);
    return `${tender.source.toLowerCase()}--${safeBid}--${safeTitle}`;
  }

  // Calculate matching category counts
  const categoryCounts = useMemo(() => {
    const counts = {};
    filteredTenders.forEach(t => {
      t.category?.forEach(c => {
        counts[c] = (counts[c] || 0) + 1;
      });
    });
    return counts;
  }, [filteredTenders]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-10">
      
      {/* Header Panel */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            AGGREGATED TENDERS
          </h1>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#057A55] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#057A55]"></span>
            </span>
            Aggregating GeM & CSPGCL opportunities
            <span className="text-gray-300">|</span>
            <span className="font-semibold">{filteredTenders.length} matching bids found</span>
          </p>
        </div>
        
        <button
          onClick={refreshTenders}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-250 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-lg shadow-sm text-sm transition focus:outline-none focus:ring-2 focus:ring-[#1A56DB]"
        >
          <svg className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Refreshing...' : 'Refresh List'}
        </button>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-[#E02424] rounded-xl p-4 mb-6 text-sm flex items-center gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          {error}
        </div>
      )}

      {/* Main Filter & Grid Container */}
      <div className="flex flex-col lg:flex-row gap-6 md:gap-8">
        
        {/* Sidebar Filters */}
        <aside className="w-full lg:w-72 shrink-0 space-y-6">
          
          <div className="bg-white rounded-2xl p-5 border border-gray-150 shadow-sm space-y-5">
            
            {/* Search Input */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Keyword Search</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Transformers, Civil..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-[#1A56DB] focus:ring-1 focus:ring-[#1A56DB] outline-none transition"
                />
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Source Tab Group */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Portal Source</label>
              <div className="grid grid-cols-3 gap-1 bg-gray-100 p-0.5 rounded-lg text-xs font-semibold">
                {['All', 'GEM', 'CSPGCL'].map(source => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => setSelectedSource(source)}
                    className={`py-1.5 rounded-md transition ${selectedSource === source ? 'bg-white text-gray-900 shadow-sm border border-gray-200/50' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    {source === 'All' ? 'All' : source}
                  </button>
                ))}
              </div>
            </div>

            {/* City / District Dropdown */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">District / City</label>
              <select
                value={selectedCity}
                onChange={e => setSelectedCity(e.target.value)}
                className="w-full text-sm border-gray-350 border rounded-lg p-2 focus:ring-[#1A56DB] focus:border-[#1A56DB] outline-none font-medium"
              >
                <option value="">All Chhattisgarh</option>
                {CITIES.sort().map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>

            {/* Status Selector */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full text-sm border-gray-350 border rounded-lg p-2 focus:ring-[#1A56DB] focus:border-[#1A56DB] outline-none font-medium"
              >
                <option value="open">Open Tenders</option>
                <option value="closed">Closed Tenders</option>
                <option value="all">All Bids</option>
              </select>
            </div>

            {/* Cost Cap */}
            <div className="pt-2 border-t border-gray-100">
              <label className="flex items-center justify-between cursor-pointer group mb-1.5">
                <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900">Cost Cap ({formatRupee(bidCapValue)})</span>
                <input 
                  type="checkbox" 
                  checked={bidCapOn} 
                  onChange={e => setBidCapOn(e.target.checked)}
                  className="rounded text-[#1A56DB] focus:ring-[#1A56DB] border-gray-300"
                />
              </label>
              {bidCapOn && (
                <input
                  type="range"
                  min={100000}
                  max={50000000}
                  step={500000}
                  value={bidCapValue}
                  onChange={e => setBidCapValue(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#1A56DB]"
                />
              )}
            </div>

            {/* EMD Cap */}
            <div className="pt-2 border-t border-gray-100">
              <label className="flex items-center justify-between cursor-pointer group mb-1.5">
                <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900">EMD Cap ({formatRupee(emdCapValue)})</span>
                <input 
                  type="checkbox" 
                  checked={emdCapOn} 
                  onChange={e => setEmdCapOn(e.target.checked)}
                  className="rounded text-[#1A56DB] focus:ring-[#1A56DB] border-gray-300"
                />
              </label>
              {emdCapOn && (
                <input
                  type="range"
                  min={5000}
                  max={1000000}
                  step={5000}
                  value={emdCapValue}
                  onChange={e => setEmdCapValue(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#1A56DB]"
                />
              )}
            </div>

            {/* e-Bidding toggle (if CSPGCL context allows) */}
            <div className="pt-2 border-t border-gray-100">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900">e-Bidding Only</span>
                <input 
                  type="checkbox" 
                  checked={eBiddingOnly} 
                  onChange={e => setEbiddingOnly(e.target.checked)}
                  className="rounded text-[#1A56DB] focus:ring-[#1A56DB] border-gray-300"
                />
              </label>
            </div>

            {/* Sorting Dropdowns */}
            <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Sort By</label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="w-full text-xs border-gray-300 border rounded-lg p-1.5 outline-none font-medium"
                >
                  <option value="endDate">Closing Date</option>
                  <option value="bidValue">Estimated Cost</option>
                  <option value="emdAmount">EMD Amount</option>
                  <option value="viabilityScore">Viability Score</option>
                </select>
              </div>
              <div className="col-span-2">
                <select
                  value={sortOrder}
                  onChange={e => setSortOrder(e.target.value)}
                  className="w-full text-xs border-gray-300 border rounded-lg p-1.5 outline-none font-medium"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleClearFilters}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold py-2 rounded-lg transition"
            >
              Clear All Filters
            </button>

          </div>

          {/* Category Checkboxes */}
          <div className="bg-white rounded-2xl p-5 border border-gray-150 shadow-sm">
            <h3 className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Categories</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {CATEGORIES.map(cat => {
                const count = categoryCounts[cat] || 0;
                return (
                  <label key={cat} className="flex items-center justify-between text-xs text-gray-650 cursor-pointer hover:text-gray-900">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-[#1A56DB] focus:ring-[#1A56DB] h-3.5 w-3.5"
                        checked={selectedCategories.includes(cat)}
                        onChange={() => toggleCategory(cat)}
                      />
                      <span>{cat}</span>
                    </div>
                    <span className="bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 text-[10px] font-bold">
                      {count}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

        </aside>

        {/* Tenders Grid */}
        <main className="flex-1 min-w-0">
          {filteredTenders.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center border border-gray-150 shadow-sm">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-xl font-bold text-gray-950 mb-2">No tenders match your filters</h3>
              <p className="text-sm text-gray-500 mb-6">Try clearing some caps, categories, or keywords to broaden your search.</p>
              <button
                onClick={handleClearFilters}
                className="px-6 py-2.5 bg-[#1A56DB] hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition shadow-sm"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredTenders.map((tender) => {
                const daysLeft = getDaysLeft(tender.endDate);
                const isExpired = daysLeft !== null && daysLeft < 0;
                const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;
                
                return (
                  <div
                    key={tender.id}
                    className={`bg-white rounded-2xl p-5 border shadow-sm flex flex-col justify-between hover:shadow-md transition group ${
                      isUrgent ? 'border-amber-350' : 'border-gray-150/80'
                    }`}
                  >
                    <div>
                      {/* Top Info Badges */}
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${
                            tender.source === 'GEM' 
                              ? 'bg-blue-50 text-blue-700 border-blue-100' 
                              : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          }`}>
                            {tender.source}
                          </span>
                          {tender.category?.slice(0, 1).map(c => (
                            <span key={c} className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 bg-gray-50 text-gray-650 border border-gray-200 rounded-md">
                              {c}
                            </span>
                          ))}
                        </div>
                        {tender.viabilityScore && (
                          <div className={`flex flex-col items-center justify-center w-7 h-7 rounded-md shrink-0 shadow-sm ${getViabilityColor(tender.viabilityScore)}`}>
                            <span className="text-[11px] font-extrabold leading-none">{tender.viabilityScore}</span>
                            <span className="text-[6px] uppercase font-bold opacity-80 leading-none mt-0.5">Score</span>
                          </div>
                        )}
                      </div>

                      <h3 className="text-xs font-bold text-[#1A56DB] mb-0.5 line-clamp-1">
                        {tender.locationCity || 'Unspecified'}
                      </h3>
                      <p className="text-[10px] text-gray-500 font-semibold mb-3 line-clamp-1">
                        {tender.organization || 'Chhattisgarh government'}
                      </p>

                      <p className="text-gray-900 text-sm font-medium line-clamp-3 mb-4 min-h-[60px]">
                        {tender.title}
                      </p>
                    </div>

                    <div className="space-y-4 mt-auto">
                      {/* e-Bidding tag */}
                      {tender.sourceMeta?.is_ebidding && (
                        <div>
                          <span className="text-[10px] bg-emerald-50 text-[#057A55] border border-emerald-150 px-2 py-0.5 rounded font-semibold">
                            e-Bidding Enabled
                          </span>
                        </div>
                      )}

                      {/* Financials Box */}
                      <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-3 border border-gray-100 text-xs">
                        <div>
                          <span className="text-[9px] text-gray-400 uppercase font-bold block">Est. Cost</span>
                          <span className="font-bold text-gray-900 mt-0.5 block">{formatRupee(tender.bidValue)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-gray-400 uppercase font-bold block">EMD Amount</span>
                          <span className="font-bold text-gray-900 mt-0.5 block">{formatRupee(tender.emdAmount)}</span>
                        </div>
                      </div>

                      {/* Timeline status & Details link */}
                      <div className="flex items-center justify-between text-xs text-gray-500 pt-2.5 border-t border-gray-100">
                        <div className="flex items-center gap-1">
                          <svg className={`w-3.5 h-3.5 ${isExpired ? 'text-red-400' : isUrgent ? 'text-amber-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className={isExpired ? 'text-[#E02424] font-medium' : isUrgent ? 'text-[#C27803] font-bold' : ''}>
                            {daysLeft === null ? 'No closing date' : isExpired ? 'Expired' : daysLeft === 0 ? 'Closes today!' : `${daysLeft} days left`}
                          </span>
                        </div>
                        
                        <a 
                          href={`/tenders/${getTenderSlug(tender)}`}
                          className="font-bold text-[#1A56DB] hover:underline flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform"
                        >
                          Details
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

    </div>
  );
}
