import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchTendersFromApi,
  enrichTendersLocally,
  generateTrendSummary,
  localNlSearch,
} from '../lib/tenderAnalysis';
import { PLANTS } from '../lib/plants';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatRupee = (val) => {
  if (val == null || isNaN(val)) return 'Not specified';
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

// ─── Components ──────────────────────────────────────────────────────────────

export default function TenderDashboard() {
  // State: Data
  const [tenders, setTenders] = useState([]);
  const [enrichedData, setEnrichedData] = useState({});
  const [lastFetched, setLastFetched] = useState(null);
  const [activePlant, setActivePlant] = useState(PLANTS[0].id);

  // State: Loading / Error
  const [loadingStep, setLoadingStep] = useState(0); // 0: Idle, 1-4: Loading steps
  const [loadingText, setLoadingText] = useState("");
  const [error, setError] = useState(null);

  // State: Filters
  const [emdCapOn, setEmdCapOn] = useState(true);
  const [emdCapValue, setEmdCapValue] = useState(35000);
  const [bidCapOn, setBidCapOn] = useState(true);
  const [bidCapValue, setBidCapValue] = useState(4000000);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedOffice, setSelectedOffice] = useState('');
  const [eBiddingOnly, setEbiddingOnly] = useState(false);
  const [sortDesc, setSortDesc] = useState(false); // false = asc, true = desc

  // State: NL Search
  const [nlQuery, setNlQuery] = useState('');
  const [nlKeyword, setNlKeyword] = useState('');

  // ─── Data Loading ───

  const loadData = async () => {
    setError(null);
    setTenders([]);
    setEnrichedData({});
    
    try {
      setLoadingStep(1);
      setLoadingText("Connecting to CSPGCL portal...");
      const parsedTenders = await fetchTendersFromApi((msg) => setLoadingText(msg));
      setTenders(parsedTenders);

      setLoadingStep(3);
      setLoadingText("Analysing tenders...");
      const enrichments = enrichTendersLocally(parsedTenders);
      const enrichMap = {};
      enrichments.forEach(e => { enrichMap[e.sr_no] = e; });
      setEnrichedData(enrichMap);

      setLoadingStep(4);
      setLoadingText("Generating market overview...");
      setLastFetched(new Date());
    } catch (err) {
      setError(err.message || 'An error occurred while fetching tenders.');
    } finally {
      setLoadingStep(0);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setSelectedCategories([]);
    setSelectedOffice('');
    setNlQuery('');
    setNlKeyword('');
  }, [activePlant]);

  // ─── Derived Data ───

  const mergedTenders = useMemo(() => {
    return tenders.map(t => ({
      ...t,
      ...(enrichedData[t.sr_no] || { category: [], viability_score: null, risks: [], scope_summary: 'Pending analysis...' })
    }));
  }, [tenders, enrichedData]);

  const plantTenders = useMemo(() => {
    return mergedTenders.filter(t => t.plant_id === activePlant);
  }, [mergedTenders, activePlant]);

  const plantCounts = useMemo(() => {
    const counts = Object.fromEntries(PLANTS.map(p => [p.id, 0]));
    mergedTenders.forEach(t => {
      if (t.plant_id && counts[t.plant_id] != null) counts[t.plant_id]++;
    });
    return counts;
  }, [mergedTenders]);

  const trendSummary = useMemo(
    () => generateTrendSummary(plantTenders),
    [plantTenders]
  );

  const offices = useMemo(() => {
    return [...new Set(plantTenders.map(t => t.issuing_office).filter(Boolean))];
  }, [plantTenders]);

  const allCategories = useMemo(() => {
    const cats = new Set();
    plantTenders.forEach(t => t.category?.forEach(c => cats.add(c)));
    return [...cats].sort();
  }, [plantTenders]);

  const filteredTenders = useMemo(() => {
    let result = plantTenders.filter(t => {
      // EMD Cap filter
      if (emdCapOn && t.emd != null && t.emd > emdCapValue) return false;
      // Bid Value Cap filter
      if (bidCapOn && t.estimated_cost != null && t.estimated_cost > bidCapValue) return false;
      // Category filter
      if (selectedCategories.length > 0) {
        if (!t.category || !t.category.some(c => selectedCategories.includes(c))) return false;
      }
      // Office filter
      if (selectedOffice && t.issuing_office !== selectedOffice) return false;
      // eBidding filter
      if (eBiddingOnly && !t.is_ebidding) return false;

      // NL Search Keyword filter
      if (nlKeyword) {
        const textToSearch = `${t.scope_raw} ${t.scope_summary} ${t.issuing_office} ${t.tender_notice_no}`.toLowerCase();
        if (!textToSearch.includes(nlKeyword.toLowerCase())) return false;
      }

      return true;
    });

    // Sort by closing date
    result.sort((a, b) => {
      const dateA = a.closing_date ? new Date(a.closing_date).getTime() : 0;
      const dateB = b.closing_date ? new Date(b.closing_date).getTime() : 0;
      return sortDesc ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [plantTenders, emdCapOn, emdCapValue, bidCapOn, bidCapValue, selectedCategories, selectedOffice, eBiddingOnly, sortDesc, nlKeyword]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    filteredTenders.forEach(t => {
      t.category?.forEach(c => {
        counts[c] = (counts[c] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filteredTenders]);

  // State: Expanded cards
  const [expandedCards, setExpandedCards] = useState({});
  const toggleExpand = (id) => setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));

  // ─── Handlers ───

  const handleClearFilters = () => {
    setEmdCapOn(true);
    setEmdCapValue(35000);
    setBidCapOn(true);
    setBidCapValue(4000000);
    setSelectedCategories([]);
    setSelectedOffice('');
    setEbiddingOnly(false);
    setNlQuery('');
    setNlKeyword('');
  };

  const toggleCategory = (cat) => {
    setSelectedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleNlSearch = (e) => {
    e.preventDefault();
    if (!nlQuery.trim() || tenders.length === 0) return;

    const result = localNlSearch(nlQuery, plantTenders);
    if (result.categories?.length > 0) setSelectedCategories(result.categories);
    if (result.officeFilter) setSelectedOffice(result.officeFilter);
    if (result.maxCost != null) { setBidCapOn(true); setBidCapValue(result.maxCost); }
    if (result.maxEmd != null) { setEmdCapOn(true); setEmdCapValue(result.maxEmd); }
    if (result.keyword) setNlKeyword(result.keyword);
  };

  // ─── Render Helpers ───

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] max-w-md w-full text-center fade-in-up border border-[#E02424]">
          <div className="text-[#E02424] mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Connection Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={loadData}
            className="bg-[#1A56DB] text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition focus-ring"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (loadingStep > 0) {
    const steps = [
      "Connecting to CSPGCL portal...",
      "Reading tender table...",
      "Analysing tenders...",
      "Generating market overview..."
    ];
    // Loading step is 1-based. (Actually step 2 is skipped in code above, but we can fake it or just show progress)
    let progress = 0;
    if (loadingStep === 1) progress = 25;
    if (loadingStep === 2) progress = 50;
    if (loadingStep === 3) progress = 75;
    if (loadingStep === 4) progress = 95;

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] max-w-md w-full fade-in-up">
          <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
            <span>{loadingText || steps[loadingStep - 1] || 'Loading...'}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div 
              className="bg-[#1A56DB] h-2.5 rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="mt-6 flex justify-center space-x-1">
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
      
      {/* HEADER */}
      <header className="mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 tracking-tight mb-2">
              CSPGCL Tender Intelligence
            </h1>
            <p className="text-sm md:text-base text-gray-600 flex items-center gap-2 flex-wrap">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#057A55] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#057A55]"></span>
              </span>
              Live from CSPGCL Portal
              {lastFetched && <span className="ml-2 text-sm text-gray-400">Updated {lastFetched.toLocaleTimeString()}</span>}
            </p>
          </div>
          <button 
            onClick={loadData}
            className="flex items-center gap-2 px-3 sm:px-4 py-2.5 md:py-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-gray-700 font-medium focus-ring transition whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Plant tabs */}
        <div className="flex flex-wrap gap-1.5 md:gap-2 mb-4 md:mb-6 -mx-4 md:mx-0 px-4 md:px-0 overflow-x-auto scrollbar-hide">
          {PLANTS.map(plant => {
            const isActive = activePlant === plant.id;
            const count = plantCounts[plant.id] || 0;
            return (
              <button
                key={plant.id}
                type="button"
                onClick={() => setActivePlant(plant.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition border focus-ring ${
                  isActive
                    ? 'bg-[#1A56DB] text-white border-[#1A56DB] shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {plant.shortLabel}
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Stats & Trends */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="lg:col-span-1 flex flex-col gap-3">
            <div className="bg-white rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 flex items-center justify-between">
              <span className="text-gray-500 font-medium">Active Tenders</span>
              <span className="text-2xl font-bold text-gray-900">{plantTenders.length}</span>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 flex items-center justify-between">
              <span className="text-gray-500 font-medium">Passing Filters</span>
              <span className="text-2xl font-bold text-[#1A56DB]">{filteredTenders.length}</span>
            </div>
          </div>
          
          <div className="lg:col-span-3 bg-gradient-to-br from-[#1A56DB] to-[#1e3a8a] text-white rounded-xl p-6 shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white opacity-5 rounded-full blur-2xl"></div>
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              Market Overview
            </h2>
            <p className="text-blue-50 leading-relaxed max-w-4xl text-sm md:text-base">
              {trendSummary || 'Generating market insights...'}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-4 md:gap-5 lg:gap-6">
        
        {/* SIDEBAR - FILTERS */}
        <aside className="w-full sm:w-72 lg:w-72 flex-shrink-0 space-y-4 md:space-y-5 lg:space-y-6">
          <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100">
            
            {/* NL Search */}
            <form onSubmit={handleNlSearch} className="mb-6 relative">
              <label className="block text-sm font-semibold text-gray-900 mb-2">Quick Filter</label>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="e.g. Civil works under 20 lakh" 
                  value={nlQuery}
                  onChange={e => setNlQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:border-[#1A56DB] focus:ring-1 focus:ring-[#1A56DB] outline-none transition"
                />
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <button 
                type="submit" 
                className="mt-2 w-full bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium py-2.5 md:py-1.5 rounded-lg transition"
              >
                Filter
              </button>
            </form>

            <hr className="border-gray-100 my-4" />

            {/* Standard Filters */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Filters</h3>
              <button onClick={handleClearFilters} className="text-xs text-[#1A56DB] hover:underline">Clear all</button>
            </div>

            <div className="space-y-5">
              {/* Toggles */}
              <div>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">EMD ≤ {(emdCapValue/1000).toFixed(0)}k</span>
                  <div className="relative">
                    <input type="checkbox" className="sr-only" checked={emdCapOn} onChange={e => setEmdCapOn(e.target.checked)} />
                    <div className={`block w-10 h-6 rounded-full transition ${emdCapOn ? 'bg-[#1A56DB]' : 'bg-gray-300'}`}></div>
                    <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${emdCapOn ? 'translate-x-4' : ''}`}></div>
                  </div>
                </label>
              </div>
              
              <div>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">Cost ≤ {(bidCapValue/100000).toFixed(0)}L</span>
                  <div className="relative">
                    <input type="checkbox" className="sr-only" checked={bidCapOn} onChange={e => setBidCapOn(e.target.checked)} />
                    <div className={`block w-10 h-6 rounded-full transition ${bidCapOn ? 'bg-[#1A56DB]' : 'bg-gray-300'}`}></div>
                    <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${bidCapOn ? 'translate-x-4' : ''}`}></div>
                  </div>
                </label>
              </div>

              <div>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">e-Bidding Only</span>
                  <div className="relative">
                    <input type="checkbox" className="sr-only" checked={eBiddingOnly} onChange={e => setEbiddingOnly(e.target.checked)} />
                    <div className={`block w-10 h-6 rounded-full transition ${eBiddingOnly ? 'bg-[#1A56DB]' : 'bg-gray-300'}`}></div>
                    <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${eBiddingOnly ? 'translate-x-4' : ''}`}></div>
                  </div>
                </label>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Categories</label>
                <div className="space-y-2">
                  {allCategories.map(cat => (
                    <label key={cat} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300 text-[#1A56DB] focus:ring-[#1A56DB]"
                        checked={selectedCategories.includes(cat)}
                        onChange={() => toggleCategory(cat)}
                      />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>

              {/* Office */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Issuing Office</label>
                <select 
                  value={selectedOffice}
                  onChange={e => setSelectedOffice(e.target.value)}
                  className="w-full text-sm border-gray-300 border rounded-lg p-2 focus:ring-[#1A56DB] focus:border-[#1A56DB] outline-none"
                >
                  <option value="">All Offices</option>
                  {offices.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Sort by Closing Date</label>
                <select 
                  value={sortDesc ? 'desc' : 'asc'}
                  onChange={e => setSortDesc(e.target.value === 'desc')}
                  className="w-full text-sm border-gray-300 border rounded-lg p-2 focus:ring-[#1A56DB] focus:border-[#1A56DB] outline-none"
                >
                  <option value="asc">Earliest First</option>
                  <option value="desc">Latest First</option>
                </select>
              </div>

            </div>
          </div>

          {/* Category Stats */}
          <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">Matching Categories</h3>
            <div className="flex flex-wrap gap-2">
              {categoryCounts.map(([cat, count]) => (
                <div key={cat} className="text-xs bg-gray-50 border border-gray-200 text-gray-700 px-2 py-1 rounded-md flex items-center gap-1">
                  {cat} <span className="bg-gray-200 text-gray-600 rounded px-1.5 py-0.5 ml-1 font-medium">{count}</span>
                </div>
              ))}
              {categoryCounts.length === 0 && <span className="text-sm text-gray-500">No categories</span>}
            </div>
          </div>
        </aside>

        {/* MAIN GRID */}
        <main className="flex-1 min-w-0">
          {filteredTenders.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No tenders match — try rephrasing</h3>
              <p className="text-gray-500">Try clearing some filters or using different keywords.</p>
              <button 
                onClick={handleClearFilters}
                className="mt-6 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4 lg:gap-5">
              {filteredTenders.map((tender) => {
                return (
                  <div 
                    key={tender.sr_no} 
                    className="tender-card bg-white rounded-[10px] p-5 flex flex-col fade-in-up border border-gray-100 transition-all hover:shadow-md shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  >
                    {/* Top Row: Sr No, Score, Badges */}
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">#{tender.sr_no}</span>
                        {tender.category?.map(c => (
                          <span key={c} className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-blue-50 text-[#1A56DB] rounded-md border border-blue-100">
                            {c}
                          </span>
                        ))}
                      </div>
                      {tender.viability_score && (
                        <div className={`flex flex-col items-center justify-center w-8 h-8 rounded-md shrink-0 shadow-sm ${getViabilityColor(tender.viability_score)}`}>
                          <span className="text-sm font-bold leading-none">{tender.viability_score}</span>
                          <span className="text-[8px] uppercase font-bold opacity-80 leading-none">Score</span>
                        </div>
                      )}
                    </div>

                    <h3 className="text-sm font-semibold text-[#1A56DB] mb-0.5 line-clamp-1" title={tender.location}>
                      {tender.location || 'Unspecified'}
                    </h3>
                    <p className="text-xs text-gray-500 mb-3 line-clamp-1" title={tender.issuing_office}>
                      {tender.issuing_office}
                    </p>
                    
                    <div className="mb-4">
                      <p className={"text-gray-900 text-sm " + (expandedCards[tender.sr_no] ? '' : 'line-clamp-3')}>
                        {tender.scope_raw || tender.scope_summary}
                      </p>
                      <button
                        onClick={() => toggleExpand(tender.sr_no)}
                        className="text-[11px] text-[#1A56DB] hover:underline mt-1 font-medium"
                      >
                        {expandedCards[tender.sr_no] ? 'Show less ▲' : 'Read more ▼'}
                      </button>
                    </div>

                    {/* RFX Number */}
                    {tender.rfx_id && (
                      <div className="mb-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <svg className="w-3 h-3 text-[#1A56DB] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                          <span className="text-[9px] uppercase font-bold text-[#1A56DB] tracking-widest leading-none">RFX / Remark</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {tender.rfx_id.match(/\b81000\d{5}\b/g)?.map(n => (
                            <span key={n} className="text-xs font-bold text-gray-900 font-mono bg-white border border-blue-200 rounded px-1.5 py-0.5">{n}</span>
                          ))}
                          {!tender.rfx_id.match(/\b81000\d{5}\b/) && (
                            <span className="text-xs font-semibold text-gray-700">{tender.rfx_id}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Financials */}
                    <div className="grid grid-cols-2 gap-3 mb-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase font-semibold mb-0.5">Est. Cost</p>
                        <p className="text-sm font-bold text-gray-900">{formatRupee(tender.estimated_cost)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase font-semibold mb-0.5">EMD</p>
                        <p className="text-sm font-bold text-gray-900">{formatRupee(tender.emd)}</p>
                      </div>
                      {tender.is_ebidding && (
                        <div className="col-span-2">
                          <span className="text-xs bg-green-50 text-[#057A55] px-2 py-0.5 rounded font-medium border border-green-100">
                            e-Bidding
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3 mb-4 rounded-lg border border-gray-100 overflow-hidden">
                      {/* Opening Date */}
                      <div className="bg-blue-50 px-3 py-2.5">
                        <div className="flex items-center gap-1 mb-1">
                          <svg className="w-3 h-3 text-[#1A56DB] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-[9px] text-[#1A56DB] uppercase font-bold tracking-wider leading-none">Opening</p>
                        </div>
                        <p className="text-xs font-semibold text-gray-800 leading-snug">
                          {tender.opening_date
                            ? new Date(tender.opening_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                        </p>
                        {tender.opening_date && (
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {new Date(tender.opening_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </p>
                        )}
                      </div>

                      {/* Closing Date */}
                      {(() => {
                        const daysLeft = getDaysLeft(tender.closing_date);
                        const isExpired = daysLeft !== null && daysLeft < 0;
                        const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;
                        const bgClass = isExpired ? 'bg-red-50' : isUrgent ? 'bg-amber-50' : 'bg-gray-50';
                        const labelColor = isExpired ? 'text-[#E02424]' : isUrgent ? 'text-[#C27803]' : 'text-gray-500';
                        const iconColor = isExpired ? 'text-[#E02424]' : isUrgent ? 'text-[#C27803]' : 'text-gray-400';
                        const textColor = isExpired ? 'text-[#E02424]' : isUrgent ? 'text-[#C27803]' : 'text-gray-800';
                        return (
                          <div className={`${bgClass} px-3 py-2.5`}>
                            <div className="flex items-center gap-1 mb-1">
                              <svg className={`w-3 h-3 ${iconColor} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <p className={`text-[9px] ${labelColor} uppercase font-bold tracking-wider leading-none`}>Closing</p>
                            </div>
                            <p className={`text-xs font-semibold ${textColor} leading-snug`}>
                              {tender.closing_date
                                ? new Date(tender.closing_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                : '—'}
                            </p>
                            {daysLeft !== null && (
                              <p className={`text-[10px] mt-0.5 font-medium ${isExpired ? 'text-[#E02424]' : isUrgent ? 'text-[#C27803]' : 'text-gray-500'}`}>
                                {isExpired
                                  ? `Expired ${Math.abs(daysLeft)}d ago`
                                  : daysLeft === 0
                                    ? 'Closes today!'
                                    : `${daysLeft}d left`}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Risks */}
                    {tender.risks?.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-1.5 mt-auto">
                        {tender.risks.map((r, idx) => (
                          <span key={idx} className="text-[11px] bg-red-50 text-[#E02424] border border-red-100 px-2 py-1 rounded-md flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                    {!tender.risks?.length && <div className="mt-auto h-[26px] mb-4"></div>}

                    {/* Actions */}
                    <div className="mt-auto">
                      {tender.doc_event_target ? (
                        <a
                          href={`/api/tender-doc?paramflag=${tender.paramflag}&target=${encodeURIComponent(tender.doc_event_target)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full text-center border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 py-2.5 md:py-2 rounded-lg text-sm font-medium transition focus-ring"
                        >
                          View Doc
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="w-full border border-gray-200 text-gray-400 bg-gray-50 py-2.5 md:py-2 rounded-lg text-sm font-medium cursor-not-allowed"
                        >
                          No Doc Available
                        </button>
                      )}
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
