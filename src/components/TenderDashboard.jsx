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

// ─── MD3 Design Tokens ────────────────────────────────────────────────────────
const C = {
  surface: '#051424',
  surfaceLow: '#0d1c2d',
  surfaceContainer: '#122131',
  surfaceHigh: '#1c2b3c',
  surfaceHighest: '#273647',
  onSurface: '#d4e4fa',
  onSurfaceVar: '#c2c6d6',
  primary: '#adc6ff',
  primaryContainer: '#4d8eff',
  secondary: '#4edea3',
  secondaryContainer: '#00a572',
  tertiary: '#ffb786',
  outline: '#8c909f',
  outlineVariant: '#424754',
  error: '#ffb4ab',
};

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

function titleSlug(t) {
  return (t || 'tender')
    .toLowerCase()
    .replace(/\b(dated?)\s+\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}\b/gi, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/&/g, '-and-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

function detailPath(t) {
  return `/tenders/${t.source.toLowerCase()}-${t.bidNumber}-${titleSlug(t.title)}`;
}

function initials(name) {
  if (!name) return '??';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '16px' }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} style={{
          background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
          borderRadius: '2px', height: '220px', animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}

const isExempt = (val) => {
  if (val === true || val === 'true') return true;
  if (typeof val === 'string') {
    const s = val.toLowerCase().trim();
    return s.startsWith('yes') || s.startsWith('exempt') || s === 'applicable';
  }
  return false;
};

const getMseExempt = (tender) => {
  const eligibility = tender.sourceMeta?.aiExtract?.eligibility;
  if (eligibility && eligibility.mseExemption !== undefined) return eligibility.mseExemption;
  const fields = tender.sourceMeta?.pdfExtract?.fields;
  if (fields && fields.mseExemption) return fields.mseExemption.value;
  return null;
};

const getStartupExempt = (tender) => {
  const eligibility = tender.sourceMeta?.aiExtract?.eligibility;
  if (eligibility && eligibility.startupExemption !== undefined) return eligibility.startupExemption;
  const fields = tender.sourceMeta?.pdfExtract?.fields;
  if (fields && fields.startupExemption) return fields.startupExemption.value;
  return null;
};

const getYearsOfExperience = (tender) => {
  const eligibility = tender.sourceMeta?.aiExtract?.eligibility;
  if (eligibility && eligibility.yearsOfExperience !== undefined) return eligibility.yearsOfExperience;
  const fields = tender.sourceMeta?.pdfExtract?.fields;
  if (fields && fields.experienceCriteria) return fields.experienceCriteria.value;
  return null;
};

function TenderCard({ t }) {
  const dl = daysLeft(t.endDate);

  const mseExempt = getMseExempt(t);
  const startupExempt = getStartupExempt(t);
  const experience = getYearsOfExperience(t);
  const isMseYes = isExempt(mseExempt);
  const isStartupYes = isExempt(startupExempt);

  const hasValue = t.bidValue != null && !isNaN(t.bidValue) && t.bidValue > 0;
  const hasEmd = t.emdAmount != null && !isNaN(t.emdAmount) && t.emdAmount > 0;
  const isEmdExempt = t.emdAmount === 0 || (t.source === 'GEM' && t.emdAmount == null && (t.valueExtractionStatus === 'extracted' || t.valueExtractionStatus === 'not_found'));

  const dlColor = dl == null ? C.outline
    : dl < 0 ? C.outline : dl <= 2 ? C.error : dl <= 7 ? C.tertiary : C.secondary;
  const dlLabel = dl == null ? '' : dl < 0 ? 'Closed' : dl === 0 ? 'Today' : `${dl}d`;

  const orgDisplay = t.organization || t.department || null;
  const orgInit = initials(orgDisplay);

  const [hovered, setHovered] = useState(false);

  return (
    <article
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: C.surfaceContainer,
        border: `1px solid ${hovered ? 'rgba(173,198,255,0.5)' : C.outlineVariant}`,
        borderRadius: '2px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.2s,box-shadow 0.2s',
        boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.45)' : 'none',
      }}
    >
      {/* Card body */}
      <div style={{ padding: '18px 20px', flex: 1 }}>

        {/* Org header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '4px',
              background: C.surfaceHigh, border: `1px solid ${C.outlineVariant}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ fontFamily: "'JetBrains Mono','Courier New',monospace", fontWeight: 600, fontSize: '10px', color: C.primary, letterSpacing: '0.05em' }}>
                {orgInit}
              </span>
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '11px', color: C.primary, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 1px' }}>
                {orgDisplay || (t.source === 'GEM' ? 'GeM Portal' : 'CSPGCL')}
              </p>
              <p style={{ fontSize: '11px', color: C.outline, margin: 0 }}>
                {t.source === 'CSPGCL' && t.sourceMeta?.plantLabel
                  ? t.sourceMeta.plantLabel
                  : (t.locationCity && t.locationCity !== 'Unspecified' ? t.locationCity : t.source)}
              </p>
            </div>
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '2px 7px', borderRadius: '2px',
              ...(t.source === 'GEM'
                ? { background: 'rgba(173,198,255,0.12)', color: C.primary, border: '1px solid rgba(173,198,255,0.25)' }
                : { background: 'rgba(255,183,134,0.12)', color: C.tertiary, border: '1px solid rgba(255,183,134,0.25)' }),
            }}>{t.source}</span>

            {isMseYes && (
              <span style={{
                fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '2px',
                background: 'rgba(78,222,163,0.1)', color: C.secondary, border: '1px solid rgba(78,222,163,0.2)'
              }}>
                ✓ MSE
              </span>
            )}
            {isStartupYes && (
              <span style={{
                fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '2px',
                background: 'rgba(78,222,163,0.1)', color: C.secondary, border: '1px solid rgba(78,222,163,0.2)'
              }}>
                ✓ Startup
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 style={{
          fontFamily: "'Hanken Grotesk','Inter',sans-serif",
          fontWeight: 700, fontSize: '15px',
          color: hovered ? C.primary : C.onSurface,
          lineHeight: 1.4, margin: '0 0 14px',
          minHeight: '42px',
          transition: 'color 0.15s',
        }}>
          <a href={detailPath(t)} style={{ textDecoration: 'none', color: 'inherit' }}>
            {t.title}
          </a>
        </h3>

        {/* Financials table */}
        <div style={{ borderTop: `1px solid rgba(66,71,84,0.5)`, paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: C.outline }}>Tender ID:</span>
            <span style={{ fontFamily: "'JetBrains Mono','Courier New',monospace", fontSize: '11px', color: C.onSurfaceVar }}>
              {t.bidNumber.length > 26 ? t.bidNumber.slice(0, 26) + '…' : t.bidNumber}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: C.outline }}>Est. Value:</span>
            {hasValue
              ? <span style={{ fontWeight: 700, fontSize: '14px', color: C.primary }}>{fmt(t.bidValue)}</span>
              : <span style={{ fontSize: '11px', color: C.outline, fontStyle: 'italic' }}>Not available</span>
            }
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: C.outline }}>EMD:</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: hasEmd ? C.onSurfaceVar : C.secondary }}>
              {hasEmd ? fmt(t.emdAmount) : 'N/A'}
            </span>
          </div>
        </div>

        {/* Risk flags */}
        {t.risks?.length > 0 && (
          <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {t.risks.slice(0, 2).map(r => (
              <span key={r} style={{
                fontSize: '10px', fontWeight: 600,
                background: 'rgba(255,180,171,0.1)', color: C.error,
                border: '1px solid rgba(255,180,171,0.2)',
                padding: '2px 7px', borderRadius: '2px',
              }}>{r}</span>
            ))}
          </div>
        )}
      </div>

      {/* Card footer */}
      <div style={{
        background: 'rgba(39,54,71,0.5)',
        borderTop: `1px solid ${C.outlineVariant}`,
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: C.outline }}>
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>timer</span>
          Closes:&nbsp;
          <span style={{ fontWeight: 600, color: dlColor }}>{fmtDate(t.endDate)}</span>
          {dlLabel && <span style={{ fontSize: '10px', fontWeight: 700, color: dlColor, marginLeft: '2px' }}>({dlLabel})</span>}
        </span>
        <a href={detailPath(t)} style={{
          display: 'flex', alignItems: 'center', gap: '2px',
          fontSize: '12px', fontWeight: 700, color: C.primary,
          textDecoration: 'none', transition: 'color 0.15s',
        }}>
          View Details
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        </a>
      </div>
    </article>
  );
}

// ─── Filter Section Heading ────────────────────────────────────────────────────

function FilterLabel({ children }) {
  return (
    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.outline, marginBottom: '8px' }}>
      {children}
    </div>
  );
}

// ─── GeM Left Sidebar ─────────────────────────────────────────────────────────

function GemSidebar({ filters, onChange, onReset, total, loading }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const valueBrackets = [
    { label: 'Under ₹5 Lakhs', min: '', max: '500000' },
    { label: '₹5L – ₹25 Lakhs', min: '500000', max: '2500000' },
    { label: '₹25L – ₹1 Crore', min: '2500000', max: '10000000' },
    { label: 'Above ₹1 Crore', min: '10000000', max: '' },
  ];

  function isBracketActive(b) {
    return filters.minValue === b.min && filters.maxValue === b.max;
  }

  function toggleBracket(b) {
    if (isBracketActive(b)) {
      onChange('minValue', '');
      onChange('maxValue', '');
    } else {
      onChange('minValue', b.min);
      onChange('maxValue', b.max);
    }
  }

  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* District */}
      <div>
        <FilterLabel>District</FilterLabel>
        <select
          value={filters.city}
          onChange={e => onChange('city', e.target.value)}
          style={{
            width: '100%', padding: '8px 12px',
            background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
            borderRadius: '2px', color: C.onSurface, fontSize: '13px',
            outline: 'none', appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%238c909f' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
          }}
        >
          <option value="all">All Chhattisgarh</option>
          {CG_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Category */}
      <div>
        <FilterLabel>Category</FilterLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {CATEGORIES.map(c => {
            const cats = filters.category ? filters.category.split(',') : [];
            const active = cats.includes(c);
            return (
              <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <div
                  onClick={() => {
                    const next = active ? cats.filter(x => x !== c) : [...cats, c];
                    onChange('category', next.join(','));
                  }}
                  style={{
                    width: '14px', height: '14px', borderRadius: '2px', flexShrink: 0,
                    border: `1px solid ${active ? C.primary : C.outlineVariant}`,
                    background: active ? C.primaryContainer : 'transparent',
                    cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {active && <span className="material-symbols-outlined" style={{ fontSize: '11px', color: C.onSurface }}>check</span>}
                </div>
                <span style={{ fontSize: '13px', color: active ? C.onSurface : C.onSurfaceVar, cursor: 'pointer' }} onClick={() => {
                  const cats2 = filters.category ? filters.category.split(',') : [];
                  const next = cats2.includes(c) ? cats2.filter(x => x !== c) : [...cats2, c];
                  onChange('category', next.join(','));
                }}>{c}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Tender Value */}
      <div>
        <FilterLabel>Tender Value</FilterLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {valueBrackets.map(b => {
            const active = isBracketActive(b);
            return (
              <label key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <div
                  onClick={() => toggleBracket(b)}
                  style={{
                    width: '14px', height: '14px', borderRadius: '2px', flexShrink: 0,
                    border: `1px solid ${active ? C.primary : C.outlineVariant}`,
                    background: active ? C.primaryContainer : 'transparent',
                    cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {active && <span className="material-symbols-outlined" style={{ fontSize: '11px', color: C.onSurface }}>check</span>}
                </div>
                <span style={{ fontSize: '13px', color: active ? C.onSurface : C.onSurfaceVar, cursor: 'pointer' }} onClick={() => toggleBracket(b)}>{b.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* EMD Amount */}
      <div>
        <FilterLabel>EMD Amount (₹)</FilterLabel>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="number"
            placeholder="Min"
            value={filters.minEmd || ''}
            onChange={e => onChange('minEmd', e.target.value)}
            style={{
              flex: 1, padding: '7px 10px',
              background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
              borderRadius: '2px', color: C.onSurface, fontSize: '13px', outline: 'none',
            }}
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.maxEmd || ''}
            onChange={e => onChange('maxEmd', e.target.value)}
            style={{
              flex: 1, padding: '7px 10px',
              background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
              borderRadius: '2px', color: C.onSurface, fontSize: '13px', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Quick toggles */}
      <div>
        <FilterLabel>Quick Filters</FilterLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { key: 'mseStartupOnly', label: 'MSE/Startup Exempt' },
            { key: 'zeroExperienceOnly', label: 'Zero Exp. Required' },
            { key: 'highValueOnly', label: 'High Value (>1 Cr)' },
            { key: 'lowEmdOnly', label: 'Low EMD (<10k)' },
          ].map(({ key, label }) => {
            const active = filters[key];
            return (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <div
                  onClick={() => onChange(key, !active)}
                  style={{
                    width: '14px', height: '14px', borderRadius: '2px', flexShrink: 0,
                    border: `1px solid ${active ? C.secondary : C.outlineVariant}`,
                    background: active ? C.secondaryContainer : 'transparent',
                    cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {active && <span className="material-symbols-outlined" style={{ fontSize: '11px', color: '#003824' }}>check</span>}
                </div>
                <span style={{ fontSize: '13px', color: active ? C.onSurface : C.onSurfaceVar, cursor: 'pointer' }} onClick={() => onChange(key, !active)}>{label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={onReset}
        style={{
          padding: '8px 16px', border: `1px solid ${C.outlineVariant}`,
          borderRadius: '2px', background: 'transparent',
          color: C.onSurfaceVar, fontSize: '13px', cursor: 'pointer',
          fontFamily: 'inherit', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.color = C.primary; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.outlineVariant; e.currentTarget.style.color = C.onSurfaceVar; }}
      >
        Clear all filters
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div style={{ display: 'none' }} className="mobile-filter-toggle">
        <button
          onClick={() => setMobileOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 16px',
            background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
            borderRadius: '2px', color: C.onSurfaceVar, fontSize: '13px', cursor: 'pointer',
            fontFamily: 'inherit', marginBottom: '12px',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>filter_alt</span>
          Filters
          <span style={{
            background: C.primaryContainer, color: C.onPrimary || '#002e6a',
            fontSize: '10px', fontWeight: 700, borderRadius: '10px', padding: '1px 7px',
          }}>{loading ? '…' : total}</span>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', transform: mobileOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>expand_more</span>
        </button>
        {mobileOpen && (
          <div style={{
            background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
            borderRadius: '2px', padding: '20px', marginBottom: '16px',
          }}>
            {sidebarContent}
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="gem-sidebar-desktop" style={{ width: '240px', flexShrink: 0 }}>
        <div style={{
          background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
          borderRadius: '2px', padding: '20px', position: 'sticky', top: '72px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <span style={{ fontFamily: "'Hanken Grotesk','Inter',sans-serif", fontWeight: 700, fontSize: '13px', color: C.onSurface }}>Filters</span>
            <span style={{ fontSize: '11px', color: C.outline }}>{loading ? 'Loading…' : `${total} result${total !== 1 ? 's' : ''}`}</span>
          </div>
          {sidebarContent}
        </div>
      </aside>
    </>
  );
}

// ─── CSPGCL Horizontal Filter Bar ─────────────────────────────────────────────

function CspgclFilterBar({ filters, onChange, onApply }) {
  const [local, setLocal] = useState({ plant: filters.plant || 'all', minEmd: filters.minEmd || '', maxEmd: filters.maxEmd || '' });

  return (
    <div style={{
      background: C.surfaceLow, border: `1px solid ${C.outlineVariant}`,
      borderRadius: '2px', padding: '16px 24px', marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '20px' }}>

        {/* Plant dropdown */}
        <div style={{ flex: 1, minWidth: '240px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.outline, marginBottom: '6px' }}>Organization &amp; Plant</div>
          <div style={{ position: 'relative' }}>
            <select
              value={local.plant}
              onChange={e => setLocal(l => ({ ...l, plant: e.target.value }))}
              style={{
                width: '100%', padding: '9px 36px 9px 12px',
                background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
                borderRadius: '2px', color: C.onSurface, fontSize: '14px',
                outline: 'none', appearance: 'none',
              }}
            >
              <option value="all">CSPGCL — All Plants</option>
              <option value="central">Central Offices</option>
              <option value="korba-west">Hasdeo HTPS — Korba West</option>
              <option value="dspm">Dr. Shyama Prasad Mukharjee TPS</option>
              <option value="marwa">Marwa Tendubhata TPS</option>
            </select>
            <span className="material-symbols-outlined" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: C.outline, fontSize: '20px', pointerEvents: 'none' }}>expand_more</span>
          </div>
        </div>

        {/* EMD range */}
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.outline, marginBottom: '6px' }}>EMD Amount Range (INR)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                value={local.minEmd}
                onChange={e => setLocal(l => ({ ...l, minEmd: e.target.value }))}
                placeholder="0"
                style={{
                  width: '100px', padding: '9px 28px 9px 10px',
                  background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
                  borderRadius: '2px', color: C.onSurface, fontSize: '13px', outline: 'none',
                }}
              />
              <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: C.outline, fontWeight: 700 }}>MIN</span>
            </div>
            <span style={{ color: C.outline, fontWeight: 700 }}>to</span>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                value={local.maxEmd}
                onChange={e => setLocal(l => ({ ...l, maxEmd: e.target.value }))}
                placeholder="10000"
                style={{
                  width: '100px', padding: '9px 28px 9px 10px',
                  background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
                  borderRadius: '2px', color: C.onSurface, fontSize: '13px', outline: 'none',
                }}
              />
              <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: C.outline, fontWeight: 700 }}>MAX</span>
            </div>
          </div>
        </div>

        {/* Apply button */}
        <button
          onClick={() => onApply(local)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '9px 20px',
            background: C.primary, color: '#002e6a',
            border: 'none', borderRadius: '2px',
            fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', transition: 'filter 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>filter_alt</span>
          Apply Filters
        </button>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const DEFAULT_FILTERS = {
  source: 'GEM', status: 'open', city: 'all', plant: 'all',
  category: '', minValue: '', maxValue: '', minEmd: '', maxEmd: '',
  mseStartupOnly: false,
  zeroExperienceOnly: false,
  highValueOnly: false,
  lowEmdOnly: false,
};

export default function TenderDashboard({
  initialCity = '',
  initialSource = 'GEM',
  initialTenders = null,
  initialTotal = 0,
}) {
  const [activeTab, setActiveTab] = useState(initialSource === 'CSPGCL' ? 'CSPGCL' : 'GEM');
  const [tenders, setTenders] = useState(initialTenders || []);
  const [total, setTotal] = useState(initialTenders ? initialTotal : 0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(initialTenders ? false : true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('endDate_asc');
  const [filters, setFilters] = useState(() => {
    let city = initialCity || 'all';
    let source = initialSource || 'GEM';
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('source');
      if (s === 'GEM' || s === 'CSPGCL') source = s;
      const c = params.get('city');
      if (c) city = c;
      const qp = params.get('q');
      if (qp) setQ(qp);
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
      if (currentFilters.maxValue && !currentFilters.highValueOnly) params.set('maxValue', currentFilters.maxValue);
      if (currentFilters.minEmd) params.set('minEmd', currentFilters.minEmd);
      let maxEmdToUse = currentFilters.maxEmd;
      if (currentFilters.lowEmdOnly) maxEmdToUse = '10000';
      if (maxEmdToUse) params.set('maxEmd', maxEmdToUse);
      if (currentFilters.mseStartupOnly) params.set('mseStartupOnly', 'true');
      if (currentFilters.zeroExperienceOnly) params.set('zeroExperienceOnly', 'true');
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
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      if (initialTenders) return;
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
    setFilters({ ...DEFAULT_FILTERS, source: activeTab, city: initialCity || 'all' });
    setQ('');
    setSort('endDate_asc');
    setPage(1);
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setFilters(f => ({ ...DEFAULT_FILTERS, source: tab, city: 'all' }));
    setQ('');
    setSort('endDate_asc');
    setPage(1);
  };

  // Client-side plant filter + MSE/experience filters
  const displayedTenders = tenders.filter(t => {
    if (filters.source === 'CSPGCL' && filters.plant && filters.plant !== 'all') {
      if (t.sourceMeta?.plantId !== filters.plant) return false;
    }
    if (filters.mseStartupOnly) {
      const isMseExempt = isExempt(getMseExempt(t));
      if (!isMseExempt) return false;
    }
    if (filters.zeroExperienceOnly) {
      const hasExperience = (val) => {
        if (val == null) return false;
        if (typeof val === 'number') return val > 0;
        if (typeof val === 'string') {
          const s = val.toLowerCase().trim();
          if (s === 'not specified' || s === 'not required' || s === 'nil' || s === 'exempt' || s === 'no' || s === '0' || s.includes('0 year')) {
            return false;
          }
          const match = s.match(/(\d+)/);
          if (match) {
            return parseInt(match[1], 10) > 0;
          }
          return false;
        }
        if (typeof val === 'boolean') return val;
        return false;
      };
      if (hasExperience(getYearsOfExperience(t))) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(total / 100);
  const isGem = activeTab === 'GEM';

  // Tab underline style
  const tabStyle = (tab) => ({
    padding: '0 24px',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
    fontWeight: activeTab === tab ? 700 : 500,
    color: activeTab === tab ? C.primary : C.onSurfaceVar,
    borderBottom: activeTab === tab ? `2px solid ${C.primary}` : '2px solid transparent',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: activeTab === tab ? C.primary : 'transparent',
    transition: 'color 0.15s,border-color 0.15s',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.onSurface }}>

      {/* ── Tab navigation bar ── */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.outlineVariant}`,
        position: 'sticky', top: '64px', zIndex: 40,
      }}>
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '0 32px' }}>
          {/* Tabs row */}
          <div style={{ display: 'flex', alignItems: 'center', height: '48px', borderBottom: `1px solid rgba(66,71,84,0.3)`, gap: 0 }}>
            <button style={tabStyle('GEM')} onClick={() => switchTab('GEM')}>GeM Tenders</button>
            <button style={tabStyle('CSPGCL')} onClick={() => switchTab('CSPGCL')}>CSPGCL Tenders</button>
          </div>
        </div>
      </div>

      {/* ── CSPGCL horizontal filter bar ── */}
      {!isGem && (
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.outlineVariant}` }}>
          <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px 32px' }}>
            <CspgclFilterBar
              filters={filters}
              onChange={onFilterChange}
              onApply={(local) => {
                onFilterChange('plant', local.plant);
                onFilterChange('minEmd', local.minEmd);
                onFilterChange('maxEmd', local.maxEmd);
              }}
            />
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 32px' }}>

        {/* Toolbar: search + sort */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: C.outline, fontSize: '18px' }}>search</span>
            <input
              type="search"
              id="search-tenders-input"
              aria-label="Search tenders by keyword, number, or organisation"
              placeholder="Search by Tender ID, keyword, organisation…"
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1); }}
              style={{
                width: '100%', padding: '9px 16px 9px 40px',
                background: C.surfaceLow, border: `1px solid ${C.outlineVariant}`,
                borderRadius: '2px', color: C.onSurface, fontSize: '14px',
                outline: 'none', fontFamily: 'inherit',
              }}
              onFocus={e => e.target.style.borderColor = C.primary}
              onBlur={e => e.target.style.borderColor = C.outlineVariant}
            />
          </div>

          {/* Sort */}
          <select
            id="sort-tenders-select"
            aria-label="Sort tenders"
            value={sort}
            onChange={e => { setSort(e.target.value); setPage(1); }}
            style={{
              padding: '9px 36px 9px 12px',
              background: C.surfaceLow, border: `1px solid ${C.outlineVariant}`,
              borderRadius: '2px', color: C.onSurface, fontSize: '13px',
              outline: 'none', fontFamily: 'inherit', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%238c909f' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
            }}
          >
            <option value="endDate_asc">Closing soonest</option>
            <option value="endDate_desc">Closing latest</option>
            <option value="bidValue_desc">Value: high to low</option>
            <option value="bidValue_asc">Value: low to high</option>
            <option value="emdAmount_asc">EMD: low to high</option>
            <option value="fetchedAt_desc">Newest first</option>
          </select>
        </div>

        {/* Content area */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

          {/* GeM sidebar */}
          {isGem && (
            <GemSidebar
              filters={filters}
              onChange={onFilterChange}
              onReset={onReset}
              total={total}
              loading={loading}
            />
          )}

          {/* Results */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Dashboard header */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px', borderBottom: `1px solid rgba(66,71,84,0.3)`, paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h1 style={{
                  fontFamily: "'Hanken Grotesk','Inter',sans-serif",
                  fontWeight: 700, fontSize: '26px', color: C.onSurface,
                  margin: '0 0 4px', letterSpacing: '-0.01em',
                }}>
                  {isGem ? 'GeM Tenders' : 'CSPGCL Tenders'}
                </h1>
                <p style={{ fontSize: '13px', color: C.onSurfaceVar, margin: 0 }}>
                  {loading ? 'Loading tenders…'
                    : `Showing ${displayedTenders.length.toLocaleString()} of ${total.toLocaleString()} active ${isGem ? 'GeM opportunities' : 'CSPGCL tenders'}`}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: C.outline, fontWeight: 700 }}>Sorted by:</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: C.primary }}>
                  {sort === 'endDate_asc' ? 'Closing Date' : sort === 'endDate_desc' ? 'Latest Close' : sort === 'bidValue_desc' ? 'Value ↓' : sort === 'bidValue_asc' ? 'Value ↑' : sort === 'fetchedAt_desc' ? 'Newest' : 'EMD ↑'}
                </span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: 'rgba(147,0,10,0.1)', border: '1px solid rgba(255,180,171,0.3)',
                borderRadius: '2px', padding: '12px 16px', color: C.error,
                fontSize: '13px', marginBottom: '16px',
              }}>
                ⚠ Error loading tenders: {error}
              </div>
            )}

            {/* Results */}
            {loading ? (
              <Skeleton />
            ) : displayedTenders.length === 0 ? (
              <div style={{
                background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
                borderRadius: '2px', padding: '48px', textAlign: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '48px', color: C.outlineVariant, display: 'block', marginBottom: '16px' }}>search_off</span>
                <p style={{ color: C.onSurfaceVar, fontSize: '14px', fontWeight: 500, margin: '0 0 12px' }}>No tenders match your filters</p>
                <button onClick={onReset} style={{ fontSize: '13px', color: C.primary, background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                  Reset all filters
                </button>
              </div>
            ) : (
              <>
                {/* Card grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',
                  gap: '16px',
                }}>
                  {displayedTenders.map(t => (
                    <TenderCard key={`${t.source}-${t.bidNumber}`} t={t} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '32px' }}>
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(p => p - 1)}
                      style={{
                        padding: '8px 16px',
                        background: 'transparent', border: `1px solid ${C.outlineVariant}`,
                        borderRadius: '2px', color: page === 1 ? C.outline : C.onSurfaceVar,
                        fontSize: '13px', cursor: page === 1 ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit', opacity: page === 1 ? 0.4 : 1,
                      }}
                    >← Previous</button>

                    {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                      const p = i + 1;
                      return (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          style={{
                            width: '36px', height: '36px',
                            border: `1px solid ${page === p ? C.primary : C.outlineVariant}`,
                            borderRadius: '2px',
                            background: page === p ? C.primaryContainer : 'transparent',
                            color: page === p ? '#002e6a' : C.onSurfaceVar,
                            fontSize: '13px', fontWeight: page === p ? 700 : 400,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >{p}</button>
                      );
                    })}

                    {totalPages > 5 && <span style={{ color: C.outline }}>…</span>}

                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => p + 1)}
                      style={{
                        padding: '8px 16px',
                        background: 'transparent', border: `1px solid ${C.outlineVariant}`,
                        borderRadius: '2px', color: page >= totalPages ? C.outline : C.onSurfaceVar,
                        fontSize: '13px', cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit', opacity: page >= totalPages ? 0.4 : 1,
                      }}
                    >Next →</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 1023px) {
          .gem-sidebar-desktop { display: none !important; }
          .mobile-filter-toggle { display: block !important; }
        }
        @media (max-width: 767px) {
          div[style*="padding:24px 32px"] { padding: 16px !important; }
          div[style*="padding:0 32px"] { padding: 0 16px !important; }
          div[style*="padding:16px 32px"] { padding: 12px 16px !important; }
        }
      `}</style>
    </div>
  );
}
