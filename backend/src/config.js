import dotenv from 'dotenv';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
dotenv.config();

export const config = {
  mongoUri: process.env.MONGODB_URI,
  fetchTime: process.env.FETCH_TIME || '06:00', // HH:MM, 24h
  pdfRetentionDays: Number(process.env.PDF_RETENTION_DAYS || 2),
  autoDeleteClosedAfterDays: Number(process.env.AUTO_DELETE_CLOSED_AFTER_DAYS || 2),
  archiveMode: (process.env.ARCHIVE_MODE ?? 'true') === 'true',
  useMockGem: (process.env.USE_MOCK_GEM ?? 'false') === 'true',
  adminToken: process.env.ADMIN_TOKEN || 'admin_dev_token_123',
  siteUrl: process.env.SITE_URL || 'https://cgtenders.com/',
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  documentsDir: process.env.DOCUMENTS_DIR || 'documents',
  skipCspgcl: (process.env.SKIP_CSPGCL ?? 'false') === 'true',
  skipGem: (process.env.SKIP_GEM ?? 'false') === 'true',  // set true on Render — GEM is local-only
  skipScheduler: (process.env.SKIP_SCHEDULER ?? 'false') === 'true',
  proxyUrl: process.env.PROXY_URL || null,
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openRouterModel: process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini:free',
  aiExtractEnabled: (process.env.AI_EXTRACT_ENABLED ?? 'false') === 'true',
};

// 33 Chhattisgarh districts. "Unspecified" is used as a fallback bucket
// and is NOT part of this list.
export const CG_CITIES = [
  'Raipur', 'Bilaspur', 'Durg', 'Korba', 'Raigarh', 'Rajnandgaon',
  'Bastar', 'Surguja', 'Dhamtari', 'Mahasamund', 'Kanker', 'Kondagaon',
  'Dantewada', 'Sukma', 'Bijapur', 'Narayanpur', 'Kabirdham', 'Mungeli',
  'Janjgir-Champa', 'Korea', 'Surajpur', 'Balrampur', 'Jashpur',
  'Gariaband', 'Balod', 'Baloda Bazar', 'Bemetara', 'Mohla-Manpur',
  'Sarangarh-Bilaigarh', 'Khairagarh-Chhuikhadan-Gandai',
  'Manendragarh-Chirmiri-Bharatpur', 'Sakti', 'Gaurela-Pendra-Marwahi',
];

// Common alias / alternate-name lookups used by the GeM location resolver.
export const CITY_ALIASES = {
  koriya: 'Korea',
  kawardha: 'Kabirdham',
  jagdalpur: 'Bastar',
  ambikapur: 'Surguja',
  mcb: 'Manendragarh-Chirmiri-Bharatpur',
  gpm: 'Gaurela-Pendra-Marwahi',
  kkc: 'Khairagarh-Chhuikhadan-Gandai',
  khairagarh: 'Khairagarh-Chhuikhadan-Gandai',
  sarangarh: 'Sarangarh-Bilaigarh',
  'baloda bazar-bhatapara': 'Baloda Bazar',
  bhatapara: 'Baloda Bazar',
  janjgir: 'Janjgir-Champa',
  champa: 'Janjgir-Champa',
};

// ─────────────────────────────────────────────────────────────────────────
// All-India state -> major districts/cities map.
// Used by locationResolve.resolveCityForGem() to resolve a tender's city
// once we know which state it was fetched under (GeM PDFs themselves
// rarely carry reliable location data, so this text-match against the
// PDF body + address fields is the main signal outside Chhattisgarh,
// which keeps its own dedicated CG_CITIES/PIN-code logic above).
// Keys are lower-cased state names for case-insensitive lookup.
// ─────────────────────────────────────────────────────────────────────────
export const STATE_DISTRICTS = {
  'andhra pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Kadapa', 'Kakinada', 'Rajahmundry', 'Tirupati', 'Anantapur', 'Chittoor', 'Srikakulam', 'Vizianagaram', 'Eluru', 'Ongole', 'Machilipatnam', 'Prakasam', 'East Godavari', 'West Godavari'],
  'arunachal pradesh': ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang', 'Ziro', 'Bomdila', 'Along', 'Tezu', 'Changlang'],
  'assam': ['Guwahati', 'Dibrugarh', 'Silchar', 'Jorhat', 'Nagaon', 'Tinsukia', 'Tezpur', 'Bongaigaon', 'Karimganj', 'Sivasagar', 'Barpeta', 'Dhubri', 'Golaghat', 'Kokrajhar'],
  'bihar': ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga', 'Purnia', 'Ara', 'Begusarai', 'Katihar', 'Munger', 'Chapra', 'Sasaram', 'Hajipur', 'Siwan', 'Nalanda', 'Nawada', 'Buxar', 'Bettiah', 'Motihari', 'Samastipur'],
  'goa': ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda', 'North Goa', 'South Goa'],
  'gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Junagadh', 'Anand', 'Nadiad', 'Mehsana', 'Bharuch', 'Vapi', 'Navsari', 'Porbandar', 'Morbi', 'Valsad', 'Kutch', 'Patan', 'Amreli'],
  'haryana': ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Karnal', 'Hisar', 'Rohtak', 'Sonipat', 'Yamunanagar', 'Panchkula', 'Bhiwani', 'Sirsa', 'Rewari', 'Kurukshetra', 'Kaithal', 'Jind', 'Fatehabad', 'Palwal', 'Mahendragarh'],
  'himachal pradesh': ['Shimla', 'Solan', 'Mandi', 'Kullu', 'Dharamshala', 'Kangra', 'Una', 'Bilaspur', 'Hamirpur', 'Chamba', 'Sirmaur', 'Kinnaur', 'Lahaul and Spiti'],
  'jharkhand': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar', 'Hazaribagh', 'Giridih', 'Ramgarh', 'Dumka', 'Chaibasa', 'Palamu', 'Gumla', 'Godda', 'Sahibganj', 'Koderma'],
  'karnataka': ['Bengaluru', 'Mysuru', 'Hubballi', 'Mangaluru', 'Belagavi', 'Kalaburagi', 'Davanagere', 'Ballari', 'Shivamogga', 'Tumakuru', 'Udupi', 'Bidar', 'Raichur', 'Hassan', 'Chikkamagaluru', 'Bagalkot', 'Vijayapura', 'Dharwad', 'Kolar', 'Mandya', 'Chitradurga'],
  'kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Alappuzha', 'Palakkad', 'Malappuram', 'Kottayam', 'Kasaragod', 'Pathanamthitta', 'Idukki', 'Ernakulam', 'Wayanad'],
  'madhya pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Rewa', 'Satna', 'Ratlam', 'Dewas', 'Khandwa', 'Chhindwara', 'Vidisha', 'Sehore', 'Hoshangabad', 'Betul', 'Shivpuri', 'Damoh', 'Mandsaur', 'Neemuch', 'Katni', 'Singrauli', 'Balaghat', 'Seoni'],
  'maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Thane', 'Aurangabad', 'Solapur', 'Kolhapur', 'Amravati', 'Nanded', 'Sangli', 'Akola', 'Latur', 'Ahmednagar', 'Jalgaon', 'Dhule', 'Chandrapur', 'Satara', 'Wardha', 'Yavatmal', 'Raigad', 'Ratnagiri', 'Palghar', 'Beed', 'Osmanabad', 'Nandurbar', 'Gondia', 'Bhandara'],
  'manipur': ['Imphal', 'Thoubal', 'Bishnupur', 'Churachandpur', 'Ukhrul', 'Senapati', 'Chandel', 'Tamenglong'],
  'meghalaya': ['Shillong', 'Tura', 'Jowai', 'Nongpoh', 'Williamnagar', 'Baghmara'],
  'mizoram': ['Aizawl', 'Lunglei', 'Champhai', 'Kolasib', 'Serchhip', 'Saiha', 'Mamit'],
  'nagaland': ['Kohima', 'Dimapur', 'Mokokchung', 'Tuensang', 'Wokha', 'Zunheboto', 'Phek', 'Mon'],
  'odisha': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Puri', 'Sambalpur', 'Berhampur', 'Balasore', 'Baripada', 'Bhadrak', 'Angul', 'Jharsuguda', 'Koraput', 'Bolangir', 'Kalahandi', 'Ganjam', 'Mayurbhanj', 'Keonjhar', 'Dhenkanal', 'Nayagarh'],
  'punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Hoshiarpur', 'Moga', 'Firozpur', 'Sangrur', 'Kapurthala', 'Pathankot', 'Gurdaspur', 'Faridkot', 'Muktsar', 'Fatehgarh Sahib', 'Rupnagar', 'Barnala', 'Mansa'],
  'rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Bikaner', 'Ajmer', 'Bhilwara', 'Alwar', 'Bharatpur', 'Sikar', 'Pali', 'Sri Ganganagar', 'Churu', 'Jhunjhunu', 'Nagaur', 'Barmer', 'Jaisalmer', 'Tonk', 'Sawai Madhopur', 'Dholpur', 'Karauli', 'Banswara', 'Chittorgarh', 'Baran', 'Jhalawar', 'Dausa'],
  'sikkim': ['Gangtok', 'Namchi', 'Gyalshing', 'Mangan'],
  'tamil nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore', 'Thoothukudi', 'Thanjavur', 'Dindigul', 'Kanchipuram', 'Cuddalore', 'Karur', 'Namakkal', 'Sivaganga', 'Nagercoil', 'Kanyakumari', 'Krishnagiri', 'Villupuram', 'Tiruppur', 'Nagapattinam', 'Ramanathapuram', 'Virudhunagar'],
  'telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Ramagundam', 'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Siddipet', 'Medak', 'Sangareddy', 'Suryapet', 'Miryalaguda'],
  'tripura': ['Agartala', 'Udaipur', 'Dharmanagar', 'Kailasahar', 'Belonia', 'Khowai', 'Ambassa'],
  'uttar pradesh': ['Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Varanasi', 'Meerut', 'Prayagraj', 'Bareilly', 'Aligarh', 'Moradabad', 'Saharanpur', 'Gorakhpur', 'Noida', 'Firozabad', 'Jhansi', 'Muzaffarnagar', 'Mathura', 'Rampur', 'Shahjahanpur', 'Farrukhabad', 'Ayodhya', 'Faizabad', 'Sitapur', 'Hardoi', 'Unnao', 'Raebareli', 'Etawah', 'Mainpuri', 'Budaun', 'Bulandshahr', 'Amroha', 'Sultanpur', 'Azamgarh', 'Ballia', 'Basti', 'Gonda', 'Deoria', 'Mau', 'Jaunpur', 'Ghazipur'],
  'uttarakhand': ['Dehradun', 'Haridwar', 'Nainital', 'Haldwani', 'Rishikesh', 'Roorkee', 'Rudrapur', 'Kashipur', 'Pithoragarh', 'Almora', 'Bageshwar', 'Chamoli', 'Champawat', 'Pauri', 'Tehri', 'Udham Singh Nagar', 'Uttarkashi'],
  'west bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Bardhaman', 'Malda', 'Kharagpur', 'Haldia', 'Nadia', 'Murshidabad', 'Purulia', 'Bankura', 'Birbhum', 'Hooghly', 'North 24 Parganas', 'South 24 Parganas', 'Jalpaiguri', 'Darjeeling', 'Cooch Behar', 'Alipurduar'],
  'andaman and nicobar islands': ['Port Blair', 'Nicobar'],
  'chandigarh': ['Chandigarh'],
  'dadra and nagar haveli and daman and diu': ['Silvassa', 'Daman', 'Diu'],
  'delhi': ['New Delhi', 'North Delhi', 'South Delhi', 'East Delhi', 'West Delhi', 'Central Delhi', 'Dwarka', 'Rohini', 'Saket'],
  'jammu and kashmir': ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Udhampur', 'Kathua', 'Kupwara', 'Pulwama', 'Rajouri', 'Poonch', 'Doda', 'Budgam'],
  'ladakh': ['Leh', 'Kargil'],
  'lakshadweep': ['Kavaratti', 'Agatti', 'Minicoy'],
  'puducherry': ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'],
};

if (config.proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(config.proxyUrl));
  console.log('[proxy] Global HTTP/HTTPS proxy dispatcher configured:', config.proxyUrl);
}
