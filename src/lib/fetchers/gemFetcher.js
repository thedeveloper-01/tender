import { resolveLocationCity } from '../cities.js';

/**
 * Fetch tenders from the GeM portal (bidplus.gem.gov.in).
 * Currently runs in mock mode by default until live endpoint is confirmed.
 */
export async function fetchGemTenders() {
  const useMock = process.env.USE_MOCK_GEM !== 'false'; // Default to true

  if (useMock) {
    console.log('[GeM Fetcher] Running in mock-data mode...');
    return getMockGemTenders();
  }

  console.log('[GeM Fetcher] Attempting live scrape from GeM...');
  try {
    // Isolated live fetch logic — to be patched once the exact GeM search endpoint API contract is confirmed
    const url = 'https://bidplus.gem.gov.in/all-bids';
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!resp.ok) {
      throw new Error(`GeM portal responded with status: ${resp.status}`);
    }

    console.warn('[GeM Fetcher] Live scrape is active, but parsing contract is pending live verification. Returning empty array.');
    // Real scraper parsing would go here, e.g. using Cheerio on the response HTML
    return [];
  } catch (error) {
    console.error('[GeM Fetcher] Live scrape failed:', error);
    throw error;
  }
}

/**
 * Generates structured mock data for GeM tenders in Chhattisgarh.
 */
function getMockGemTenders() {
  const today = new Date();
  
  // Helper to add days to a date
  const addDays = (d, days) => {
    const res = new Date(d);
    res.setDate(res.getDate() + days);
    return res;
  };

  const mockTenders = [
    {
      bidNumber: 'GEM/2026/B/9102410',
      title: 'Supply of Desktop Computers and Online UPS systems for Bilaspur Collectorate and Tehsil Offices',
      department: 'Department of Revenue & Land Records',
      organization: 'Bilaspur District Collectorate',
      quantity: '45 Units',
      bidValue: 2450000.0,
      emdAmount: 49000.0,
      startDate: addDays(today, -3),
      endDate: addDays(today, 5), // Closes in 5 days
      locationText: 'Bilaspur, Chhattisgarh, Pin 495001',
      bidLink: 'https://bidplus.gem.gov.in/showbiddocument/9102410',
      rawJson: { consignee: 'Bilaspur Collectorate', item_category: 'Desktops' }
    },
    {
      bidNumber: 'GEM/2026/B/9102411',
      title: 'Hiring of Commercial Utility Vehicles (SUV) for Raipur Smart City project monitoring and field inspection',
      department: 'Urban Development Department',
      organization: 'Raipur Smart City Limited',
      quantity: '5 Vehicles',
      bidValue: 1800000.0,
      emdAmount: 36000.0,
      startDate: addDays(today, -1),
      endDate: addDays(today, 12), // Closes in 12 days
      locationText: 'Smart City Office, Raipur, Chhattisgarh',
      bidLink: 'https://bidplus.gem.gov.in/showbiddocument/9102411',
      rawJson: { hiring_duration: '12 Months', vehicle_type: 'SUV' }
    },
    {
      bidNumber: 'GEM/2026/B/9102412',
      title: 'Supply and Installation of Solar Water Pumps (3HP & 5HP) under Saur Sujalam Scheme in Dantewada villages',
      department: 'Chhattisgarh State Renewable Energy Development Agency (CREDA)',
      organization: 'CREDA Dantewada Office',
      quantity: '30 Systems',
      bidValue: 8500000.0,
      emdAmount: 170000.0,
      startDate: addDays(today, -5),
      endDate: addDays(today, 2), // Closes in 2 days (Urgent!)
      locationText: 'Various Panchayats in Dantewada District, CG',
      bidLink: 'https://bidplus.gem.gov.in/showbiddocument/9102412',
      rawJson: { capacity: '3HP/5HP Solar', scheme: 'Saur Sujalam' }
    },
    {
      bidNumber: 'GEM/2026/B/9102413',
      title: 'Procurement of Medical Lab Equipment and Reagents for District Hospital, Jagdalpur',
      department: 'Department of Health & Family Welfare',
      organization: 'Bastar District Hospital',
      quantity: '1 Lot',
      bidValue: 4200000.0,
      emdAmount: 84000.0,
      startDate: addDays(today, -4),
      endDate: addDays(today, 8),
      locationText: 'District Hospital Campus, Jagdalpur, Bastar, CG',
      bidLink: 'https://bidplus.gem.gov.in/showbiddocument/9102413',
      rawJson: { hospital: 'Bastar District Hospital', equipment_list: 'Centrifuge, Incubator, Reagents' }
    },
    {
      bidNumber: 'GEM/2026/B/9102414',
      title: 'Civil Construction of Boundary Wall and Gate for Girls Hostel in Kawardha',
      department: 'Tribal Welfare Department',
      organization: 'Kawardha Division Office',
      quantity: '1 Work',
      bidValue: 3500000.0,
      emdAmount: 70000.0,
      startDate: addDays(today, -10),
      endDate: addDays(today, -1), // Expired yesterday
      locationText: 'Girls Hostel Site, Kawardha, Kabirdham District, Chhattisgarh',
      bidLink: 'https://bidplus.gem.gov.in/showbiddocument/9102414',
      rawJson: { structure: 'RCC boundary wall', length: '400 meters' }
    },
    {
      bidNumber: 'GEM/2026/B/9102415',
      title: 'Supply of Organic Vermicompost Fertilizer to Farmers in Gariaband Block',
      department: 'Department of Agriculture',
      organization: 'Krishi Vigyan Kendra Gariaband',
      quantity: '200 Metric Tons',
      bidValue: 950000.0,
      emdAmount: 19000.0,
      startDate: addDays(today, -2),
      endDate: addDays(today, 15),
      locationText: 'Gariaband Block Warehouses, CG',
      bidLink: 'https://bidplus.gem.gov.in/showbiddocument/9102415',
      rawJson: { packaging: '50kg Bags', quality_grade: 'Grade-A' }
    },
    {
      bidNumber: 'GEM/2026/B/9102416',
      title: 'Supply and Installation of CCTV Cameras and Network Video Recorders (NVR) for Durg Municipal Corporation Area',
      department: 'Urban Administration Department',
      organization: 'Durg Municipal Corporation',
      quantity: '120 Cameras',
      bidValue: 6200000.0,
      emdAmount: 124000.0,
      startDate: addDays(today, -7),
      endDate: addDays(today, 6),
      locationText: 'Durg City, Chhattisgarh',
      bidLink: 'https://bidplus.gem.gov.in/showbiddocument/9102416',
      rawJson: { type: 'IP Dome CCTV', resolution: '4MP' }
    },
    {
      bidNumber: 'GEM/2026/B/9102417',
      title: 'Deployment of Security Guards (Manpower) at Government Colleges in Surguja District',
      department: 'Higher Education Department',
      organization: 'Surguja University Ambikapur',
      quantity: '35 Guards',
      bidValue: 5400000.0,
      emdAmount: 108000.0,
      startDate: addDays(today, -3),
      endDate: addDays(today, 10),
      locationText: 'Ambikapur, Surguja, CG',
      bidLink: 'https://bidplus.gem.gov.in/showbiddocument/9102417',
      rawJson: { category: 'Manpower Services', duration: '24 Months' }
    }
  ];

  return mockTenders;
}
