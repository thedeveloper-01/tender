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

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman & Nicobar Islands', 'Chandigarh', 'Dadra & Nagar Haveli', 'Daman & Diu',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

// Key districts for each state (major procurement hubs)
const DISTRICTS_BY_STATE = {
  'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Tirupati', 'Rajahmundry', 'Kakinada', 'Anantapur', 'Kadapa'],
  'Arunachal Pradesh': ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang', 'Ziro', 'Bomdila'],
  'Assam': ['Guwahati', 'Dibrugarh', 'Silchar', 'Jorhat', 'Nagaon', 'Tinsukia', 'Sivasagar', 'Tezpur', 'Bongaigaon', 'Karimganj'],
  'Bihar': ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga', 'Ara', 'Begusarai', 'Purnia', 'Katihar', 'Bihar Sharif'],
  'Chhattisgarh': CG_CITIES.filter(c => c !== 'Unspecified'),
  'Goa': ['Panaji', 'Margao', 'Vasco', 'Mapusa', 'Ponda', 'Bicholim'],
  'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Junagadh', 'Gandhinagar', 'Anand', 'Bharuch', 'Mehsana', 'Navsari'],
  'Haryana': ['Gurugram', 'Faridabad', 'Ambala', 'Hisar', 'Rohtak', 'Karnal', 'Panipat', 'Sonipat', 'Panchkula', 'Yamunanagar'],
  'Himachal Pradesh': ['Shimla', 'Dharamshala', 'Solan', 'Mandi', 'Kullu', 'Hamirpur', 'Nahan', 'Bilaspur', 'Chamba', 'Kinnaur'],
  'Jharkhand': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Hazaribagh', 'Deoghar', 'Dumka', 'Giridih', 'Chaibasa', 'Ramgarh'],
  'Karnataka': ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Dharwad', 'Belagavi', 'Davangere', 'Ballari', 'Tumakuru', 'Shivamogga', 'Kalaburagi', 'Vijayapura'],
  'Kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Malappuram', 'Palakkad', 'Kannur', 'Alappuzha', 'Kottayam'],
  'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas', 'Satna', 'Ratlam', 'Rewa', 'Murwara', 'Singrauli'],
  'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Solapur', 'Amravati', 'Kolhapur', 'Nanded', 'Latur', 'Satara', 'Navi Mumbai'],
  'Manipur': ['Imphal', 'Thoubal', 'Bishnupur', 'Churachandpur', 'Ukhrul'],
  'Meghalaya': ['Shillong', 'Tura', 'Jowai', 'Nongstoin', 'Williamnagar'],
  'Mizoram': ['Aizawl', 'Lunglei', 'Champhai', 'Serchhip'],
  'Nagaland': ['Kohima', 'Dimapur', 'Mokokchung', 'Tuensang', 'Wokha'],
  'Odisha': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri', 'Balasore', 'Brahmapur', 'Jharsuguda', 'Baripada'],
  'Punjab': ['Chandigarh', 'Amritsar', 'Ludhiana', 'Jalandhar', 'Patiala', 'Bathinda', 'Hoshiarpur', 'Mohali', 'Firozpur', 'Gurdaspur'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Bikaner', 'Ajmer', 'Bhilwara', 'Alwar', 'Bharatpur', 'Sikar', 'Barmer', 'Pali'],
  'Sikkim': ['Gangtok', 'Namchi', 'Mangan', 'Gyalshing'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Tiruppur', 'Vellore', 'Erode', 'Thoothukudi', 'Thanjavur', 'Dindigul'],
  'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Ramagundam', 'Secunderabad', 'Mahbubnagar'],
  'Tripura': ['Agartala', 'Dharmanagar', 'Udaipur', 'Kailasahar', 'Belonia'],
  'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Allahabad', 'Meerut', 'Noida', 'Ghaziabad', 'Gorakhpur', 'Bareilly', 'Aligarh', 'Moradabad', 'Saharanpur', 'Mathura'],
  'Uttarakhand': ['Dehradun', 'Haridwar', 'Nainital', 'Roorkee', 'Rishikesh', 'Haldwani', 'Rudrapur', 'Kashipur', 'Kotdwar'],
  'West Bengal': ['Kolkata', 'Asansol', 'Siliguri', 'Durgapur', 'Bardhaman', 'Malda', 'Baharampur', 'Howrah', 'Jalpaiguri', 'Kharagpur'],
  'Delhi': ['New Delhi', 'Central Delhi', 'North Delhi', 'South Delhi', 'East Delhi', 'West Delhi', 'Noida Extension'],
  'Chandigarh': ['Chandigarh'],
  'Jammu & Kashmir': ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Pulwama', 'Sopore', 'Kathua'],
  'Ladakh': ['Leh', 'Kargil'],
  'Puducherry': ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'],
  'Andaman & Nicobar Islands': ['Port Blair'],
  'Dadra & Nagar Haveli': ['Silvassa'],
  'Daman & Diu': ['Daman', 'Diu'],
  'Lakshadweep': ['Kavaratti'],
};

// ─── MD3 Design Tokens ────────────────────────────────────────────────────────
const C = {
  surface: 'var(--surface)',
  surfaceLow: 'var(--surface-dim)',
  surfaceContainer: 'var(--surface-container)',
  surfaceHigh: 'var(--surface-container-high)',
  surfaceHighest: 'var(--surface-container-highest)',
  onSurface: 'var(--on-surface)',
  onSurfaceVar: 'var(--on-surface-variant)',
  primary: 'var(--primary)',
  primaryContainer: 'var(--primary-container)',
  onPrimary: 'var(--on-primary)',
  onPrimaryContainer: 'var(--on-primary-container)',
  secondary: 'var(--secondary)',
  secondaryContainer: 'var(--secondary-container)',
  onSecondaryContainer: 'var(--on-secondary-container)',
  tertiary: 'var(--tertiary)',
  outline: 'var(--outline)',
  outlineVariant: 'var(--outline-variant)',
  error: 'var(--error)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val) {
  if (val == null || isNaN(val)) return 'N/A';
  return '₹' + Number(val).toLocaleString('en-IN');
}

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dateStr} ${timeStr}`;
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
  if (tender.mseExemption !== undefined && tender.mseExemption !== null) return tender.mseExemption;
  const eligibility = tender.sourceMeta?.aiExtract?.eligibility;
  if (eligibility && eligibility.mseExemption !== undefined) return eligibility.mseExemption;
  const fields = tender.sourceMeta?.pdfExtract?.fields;
  if (fields && fields.mseExemption) return fields.mseExemption.value;
  return null;
};

const getStartupExempt = (tender) => {
  if (tender.startupExemption !== undefined && tender.startupExemption !== null) return tender.startupExemption;
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
        border: `1px solid ${hovered ? 'color-mix(in srgb, var(--primary) 50%, transparent)' : C.outlineVariant}`,
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
                ? { background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: C.primary, border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }
                : { background: 'color-mix(in srgb, var(--tertiary) 12%, transparent)', color: C.tertiary, border: '1px solid color-mix(in srgb, var(--tertiary) 25%, transparent)' }),
            }}>{t.source}</span>

            {isMseYes && (
              <span style={{
                fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '2px',
                background: 'color-mix(in srgb, var(--secondary) 10%, transparent)', color: C.secondary, border: '1px solid color-mix(in srgb, var(--secondary) 20%, transparent)'
              }}>
                ✓ MSE
              </span>
            )}
            {isStartupYes && (
              <span style={{
                fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '2px',
                background: 'color-mix(in srgb, var(--secondary) 10%, transparent)', color: C.secondary, border: '1px solid color-mix(in srgb, var(--secondary) 20%, transparent)'
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
        <div style={{ borderTop: `1px solid color-mix(in srgb, var(--outline-variant) 50%, transparent)`, paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
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
                background: 'color-mix(in srgb, var(--error) 10%, transparent)', color: C.error,
                border: '1px solid color-mix(in srgb, var(--error) 20%, transparent)',
                padding: '2px 7px', borderRadius: '2px',
              }}>{r}</span>
            ))}
          </div>
        )}
      </div>

      {/* Card footer */}
      <div style={{
        background: 'color-mix(in srgb, var(--surface-container-highest) 50%, transparent)',
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

  const isIndia = filters.gemScope === 'india';
  const selectedState = filters.gemState || 'all';
  const districtOptions = isIndia && selectedState !== 'all'
    ? (DISTRICTS_BY_STATE[selectedState] || [])
    : [];

  function handleScopeToggle(scope) {
    onChange('gemScope', scope);
    onChange('gemState', 'all');
    onChange('city', 'all');
  }

  // Shared select style
  const selectStyle = {
    width: '100%', padding: '8px 12px',
    background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
    borderRadius: '2px', color: C.onSurface, fontSize: '13px',
    outline: 'none', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%238c909f' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
  };

  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Scope Toggle: Chhattisgarh / All India ── */}
      <div>
        <FilterLabel>Location Scope</FilterLabel>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          border: `1px solid ${C.outlineVariant}`, borderRadius: '4px', overflow: 'hidden',
        }}>
          {[{ key: 'cg', label: 'Chhattisgarh' }, { key: 'india', label: '🇮🇳 All India' }].map(({ key, label }) => {
            const active = (filters.gemScope || 'cg') === key;
            return (
              <button
                key={key}
                onClick={() => handleScopeToggle(key)}
                style={{
                  padding: '8px 4px',
                  background: active ? C.primaryContainer : 'transparent',
                  color: active ? C.onPrimaryContainer : C.onSurfaceVar,
                  border: 'none',
                  borderRight: key === 'cg' ? `1px solid ${C.outlineVariant}` : 'none',
                  fontSize: '11px', fontWeight: active ? 700 : 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s', letterSpacing: '0.01em',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Chhattisgarh District Filter ── */}
      {!isIndia && (
        <div>
          <FilterLabel>District</FilterLabel>
          <select
            value={filters.city}
            onChange={e => onChange('city', e.target.value)}
            style={selectStyle}
          >
            <option value="all">All Chhattisgarh</option>
            {CG_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* ── All India: State + District Cascade ── */}
      {isIndia && (
        <>
          <div>
            <FilterLabel>State</FilterLabel>
            <select
              value={selectedState}
              onChange={e => {
                onChange('gemState', e.target.value);
                onChange('city', 'all'); // reset district when state changes
              }}
              style={selectStyle}
            >
              <option value="all">All States</option>
              {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <FilterLabel>District</FilterLabel>
            <select
              value={filters.city}
              onChange={e => onChange('city', e.target.value)}
              disabled={selectedState === 'all' || districtOptions.length === 0}
              style={{
                ...selectStyle,
                opacity: selectedState === 'all' ? 0.5 : 1,
                cursor: selectedState === 'all' ? 'not-allowed' : 'pointer',
              }}
            >
              <option value="all">
                {selectedState === 'all' ? 'Select a state first' : `All ${selectedState}`}
              </option>
              {districtOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </>
      )}

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
              flex: 1, width: '100%', minWidth: '0', padding: '7px 10px',
              background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
              borderRadius: '2px', color: C.onSurface, fontSize: '13px', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = C.primary}
            onBlur={e => e.target.style.borderColor = C.outlineVariant}
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.maxEmd || ''}
            onChange={e => onChange('maxEmd', e.target.value)}
            style={{
              flex: 1, width: '100%', minWidth: '0', padding: '7px 10px',
              background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
              borderRadius: '2px', color: C.onSurface, fontSize: '13px', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = C.primary}
            onBlur={e => e.target.style.borderColor = C.outlineVariant}
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
                  {active && <span className="material-symbols-outlined" style={{ fontSize: '11px', color: C.onSecondaryContainer }}>check</span>}
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
          className="mobile-filter-btn"
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
            background: C.primaryContainer, color: C.onPrimaryContainer,
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
      <div className="cspgcl-filter-row">

        {/* Plant dropdown */}
        <div className="cspgcl-filter-field">
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
        <div className="cspgcl-filter-field emd-field">
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.outline, marginBottom: '6px' }}>EMD Amount Range (INR)</div>
          <div className="cspgcl-emd-input-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="cspgcl-emd-input-container" style={{ position: 'relative' }}>
              <input
                type="number"
                value={local.minEmd}
                onChange={e => setLocal(l => ({ ...l, minEmd: e.target.value }))}
                placeholder="0"
                className="cspgcl-emd-input"
                style={{
                  padding: '9px 28px 9px 10px',
                  background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
                  borderRadius: '2px', color: C.onSurface, fontSize: '13px', outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = C.primary}
                onBlur={e => e.target.style.borderColor = C.outlineVariant}
              />
              <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: C.outline, fontWeight: 700 }}>MIN</span>
            </div>
            <span style={{ color: C.outline, fontWeight: 700 }}>to</span>
            <div className="cspgcl-emd-input-container" style={{ position: 'relative' }}>
              <input
                type="number"
                value={local.maxEmd}
                onChange={e => setLocal(l => ({ ...l, maxEmd: e.target.value }))}
                placeholder="10000"
                className="cspgcl-emd-input"
                style={{
                  padding: '9px 28px 9px 10px',
                  background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
                  borderRadius: '2px', color: C.onSurface, fontSize: '13px', outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = C.primary}
                onBlur={e => e.target.style.borderColor = C.outlineVariant}
              />
              <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: C.outline, fontWeight: 700 }}>MAX</span>
            </div>
          </div>
        </div>

        {/* Apply button */}
        <button
          onClick={() => onApply(local)}
          className="cspgcl-apply-btn"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '9px 20px',
            background: C.primary, color: C.onPrimary,
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
  gemScope: 'cg', gemState: 'all',
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
      // Pass state filter when All India scope is active with a specific state selected
      if (currentFilters.source === 'GEM' && currentFilters.gemScope === 'india' && currentFilters.gemState && currentFilters.gemState !== 'all') {
        params.set('state', currentFilters.gemState);
      }
      if (currentFilters.source === 'CSPGCL' && currentFilters.plant && currentFilters.plant !== 'all') {
        params.set('plant', currentFilters.plant);
      }
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
    setFilters(f => ({ ...DEFAULT_FILTERS, source: tab, city: 'all', gemScope: 'cg', gemState: 'all' }));
    setQ('');
    setSort('endDate_asc');
    setPage(1);
  };

  // Client-side plant filter fallback (other filters handled server-side)
  const displayedTenders = tenders.filter(t => {
    if (filters.source === 'CSPGCL' && filters.plant && filters.plant !== 'all') {
      if (t.plantId !== filters.plant && t.sourceMeta?.plantId !== filters.plant) return false;
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
        <div className="container-pad" style={{ maxWidth: '1440px', margin: '0 auto' }}>
          {/* Tabs row */}
          <div style={{ display: 'flex', alignItems: 'center', height: '48px', borderBottom: `1px solid color-mix(in srgb, var(--outline-variant) 30%, transparent)`, gap: 0 }}>
            <button className="dashboard-tab-btn" style={tabStyle('GEM')} onClick={() => switchTab('GEM')}>GeM Tenders</button>
            <button className="dashboard-tab-btn" style={tabStyle('CSPGCL')} onClick={() => switchTab('CSPGCL')}>CSPGCL Tenders</button>
          </div>
          {/* All India breadcrumb indicator under tab bar — only for GEM scope india */}
          {isGem && filters.gemScope === 'india' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 0 5px', borderTop: `1px solid color-mix(in srgb, var(--outline-variant) 20%, transparent)`,
              fontSize: '11px', color: C.outline,
            }}>
              <span style={{ color: C.primary, fontWeight: 700 }}>🇮🇳 All India</span>
              {filters.gemState && filters.gemState !== 'all' && (
                <><span style={{ color: C.outlineVariant }}>›</span><span style={{ color: C.onSurfaceVar, fontWeight: 600 }}>{filters.gemState}</span></>
              )}
              {filters.city && filters.city !== 'all' && (
                <><span style={{ color: C.outlineVariant }}>›</span><span style={{ color: C.onSurfaceVar }}>{filters.city}</span></>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── CSPGCL horizontal filter bar ── */}
      {!isGem && (
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.outlineVariant}` }}>
          <div className="bar-pad" style={{ maxWidth: '1440px', margin: '0 auto' }}>
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
      <div className="main-content-pad" style={{ maxWidth: '1440px', margin: '0 auto' }}>

        {/* Toolbar: search + sort */}
        <div className="dashboard-toolbar">
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
        <div className="dashboard-content-area">

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
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px', borderBottom: `1px solid color-mix(in srgb, var(--outline-variant) 30%, transparent)`, paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h1 style={{
                  fontFamily: "'Hanken Grotesk','Inter',sans-serif",
                  fontWeight: 700, fontSize: '26px', color: C.onSurface,
                  margin: '0 0 4px', letterSpacing: '-0.01em',
                }}>
                  {isGem
                    ? (filters.gemScope === 'india'
                        ? (filters.gemState !== 'all' ? `GeM Tenders — ${filters.gemState}` : 'GeM Tenders — All India')
                        : 'GeM Tenders')
                    : 'CSPGCL Tenders'}
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
                background: 'color-mix(in srgb, var(--error) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)',
                borderRadius: '2px', padding: '12px 16px', color: 'var(--error)',
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
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
                  gap: '16px',
                }}>
                  {displayedTenders.map(t => (
                    <TenderCard key={`${t.source}-${t.bidNumber}`} t={t} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="pagination-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '32px' }}>
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(p => p - 1)}
                      className="pagination-btn-prev-next"
                      style={{
                        padding: '8px 16px',
                        background: 'transparent', border: `1px solid ${C.outlineVariant}`,
                        borderRadius: '2px', color: page === 1 ? C.outline : C.onSurfaceVar,
                        fontSize: '13px', cursor: page === 1 ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit', opacity: page === 1 ? 0.4 : 1,
                      }}
                    >← Previous</button>

                    <div className="pagination-numbers-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {(() => {
                        const maxButtons = 5;
                        let startPage = Math.max(1, page - 2);
                        let endPage = Math.min(totalPages, startPage + maxButtons - 1);
                        if (endPage - startPage < maxButtons - 1) {
                          startPage = Math.max(1, endPage - maxButtons + 1);
                        }
                        
                        const pages = [];
                        for (let p = startPage; p <= endPage; p++) {
                          pages.push(p);
                        }

                        return (
                          <>
                            {startPage > 1 && (
                              <>
                                <button
                                  onClick={() => setPage(1)}
                                  style={{
                                    width: '36px', height: '36px',
                                    border: `1px solid ${C.outlineVariant}`,
                                    borderRadius: '2px',
                                    background: 'transparent',
                                    color: C.onSurfaceVar,
                                    fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                                  }}
                                >1</button>
                                {startPage > 2 && <span style={{ color: C.outline }}>…</span>}
                              </>
                            )}
                            {pages.map(p => (
                              <button
                                key={p}
                                onClick={() => setPage(p)}
                                style={{
                                  width: '36px', height: '36px',
                                  border: `1px solid ${page === p ? C.primary : C.outlineVariant}`,
                                  borderRadius: '2px',
                                  background: page === p ? C.primaryContainer : 'transparent',
                                  color: page === p ? C.onPrimaryContainer : C.onSurfaceVar,
                                  fontSize: '13px', fontWeight: page === p ? 700 : 400,
                                  cursor: 'pointer', fontFamily: 'inherit',
                                }}
                              >{p}</button>
                            ))}
                            {endPage < totalPages && (
                              <>
                                {endPage < totalPages - 1 && <span style={{ color: C.outline }}>…</span>}
                                <button
                                  onClick={() => setPage(totalPages)}
                                  style={{
                                    width: '36px', height: '36px',
                                    border: `1px solid ${C.outlineVariant}`,
                                    borderRadius: '2px',
                                    background: 'transparent',
                                    color: C.onSurfaceVar,
                                    fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                                  }}
                                >{totalPages}</button>
                              </>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <span className="pagination-mobile-label" style={{ display: 'none', fontSize: '13px', color: C.onSurfaceVar, fontWeight: 600, padding: '0 8px' }}>
                      Page {page} of {totalPages}
                    </span>

                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => p + 1)}
                      className="pagination-btn-prev-next"
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
        /* Core Dashboard Layout & Tabs */
        .dashboard-content-area {
          display: flex;
          gap: 24px;
          align-items: flex-start;
        }
        .dashboard-tab-btn {
          flex: 1;
          justify-content: center;
          text-align: center;
        }
        @media (max-width: 767px) {
          .dashboard-tab-btn {
            padding: 0 8px !important;
            font-size: 13px !important;
          }
        }

        /* Desktop/Mobile toggles */
        @media (max-width: 1023px) {
          .dashboard-content-area {
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }
          .gem-sidebar-desktop { display: none !important; }
          .mobile-filter-toggle {
            display: block !important;
            width: 100%;
          }
          .mobile-filter-btn {
            width: 100% !important;
            justify-content: center;
          }
        }

        /* CSPGCL Filter Bar layout */
        .cspgcl-filter-row {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 20px;
        }
        .cspgcl-filter-field {
          flex: 1;
          min-width: 240px;
        }
        .cspgcl-filter-field.emd-field {
          flex: none;
        }
        .cspgcl-emd-input {
          width: 100px;
        }

        /* Toolbar styles */
        .dashboard-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
          align-items: center;
        }

        @media (max-width: 767px) {
          /* Toolbar Mobile Stacking */
          .dashboard-toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .dashboard-toolbar > div,
          .dashboard-toolbar > select {
            width: 100% !important;
          }

          /* CSPGCL Filter Mobile Stacking */
          .cspgcl-filter-row {
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }
          .cspgcl-filter-field {
            width: 100% !important;
            min-width: 0 !important;
          }
          .cspgcl-filter-field.emd-field {
            flex: 1;
          }
          .cspgcl-emd-input-wrap {
            width: 100% !important;
          }
          .cspgcl-emd-input-container {
            flex: 1;
          }
          .cspgcl-emd-input {
            width: 100% !important;
          }
          .cspgcl-apply-btn {
            width: 100% !important;
            justify-content: center;
          }

          /* Pagination Mobile Simplification */
          .pagination-container {
            width: 100%;
            justify-content: space-between !important;
          }
          .pagination-numbers-wrap {
            display: none !important;
          }
          .pagination-mobile-label {
            display: inline-block !important;
          }
          .pagination-btn-prev-next {
            flex: 1;
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
}
