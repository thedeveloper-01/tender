export const CITIES = [
  'Raipur', 'Bilaspur', 'Durg', 'Korba', 'Raigarh', 'Rajnandgaon',
  'Bastar', 'Surguja', 'Dhamtari', 'Mahasamund', 'Kanker', 'Kondagaon',
  'Dantewada', 'Sukma', 'Bijapur', 'Narayanpur', 'Kabirdham', 'Mungeli',
  'Janjgir-Champa', 'Korea', 'Surajpur', 'Balrampur', 'Jashpur', 'Gariaband',
  'Balod', 'Baloda Bazar', 'Bemetara', 'Mohla-Manpur', 'Sarangarh-Bilaigarh',
  'Khairagarh-Chhuikhadan-Gandai', 'Manendragarh-Chirmiri-Bharatpur (MCB)',
  'Sakti', 'Gaurela-Pendra-Marwahi (GPM)'
];

export const CITY_ALIASES = {
  'Raipur': [/raipur/i],
  'Bilaspur': [/bilaspur/i],
  'Durg': [/durg\b/i],
  'Korba': [/korba/i],
  'Raigarh': [/raigarh/i],
  'Rajnandgaon': [/rajnandgaon/i],
  'Bastar': [/bastar/i, /jagdalpur/i],
  'Surguja': [/surguja/i, /ambikapur/i],
  'Dhamtari': [/dhamtari/i],
  'Mahasamund': [/mahasamund/i],
  'Kanker': [/kanker/i, /north bastar/i],
  'Kondagaon': [/kondagaon/i],
  'Dantewada': [/dantewada/i, /south bastar/i],
  'Sukma': [/sukma/i],
  'Bijapur': [/bijapur/i],
  'Narayanpur': [/narayanpur/i],
  'Kabirdham': [/kabirdham/i, /kawardha/i],
  'Mungeli': [/mungeli/i],
  'Janjgir-Champa': [/janjgir/i, /champa/i],
  'Korea': [/korea/i, /koriya/i],
  'Surajpur': [/surajpur/i],
  'Balrampur': [/balrampur/i],
  'Jashpur': [/jashpur/i],
  'Gariaband': [/gariaband/i],
  'Balod': [/\bbalod\b/i],
  'Baloda Bazar': [/baloda\s*bazar/i, /balodabazar/i],
  'Bemetara': [/bemetara/i],
  'Mohla-Manpur': [/mohla/i, /manpur/i, /ambagarh/i],
  'Sarangarh-Bilaigarh': [/sarangarh/i, /bilaigarh/i],
  'Khairagarh-Chhuikhadan-Gandai': [/khairagarh/i, /chhuikhadan/i, /gandai/i],
  'Manendragarh-Chirmiri-Bharatpur (MCB)': [/manendragarh/i, /chirmiri/i, /bharatpur/i, /\bmcb\b/i],
  'Sakti': [/\bsakti\b/i, /\bshakti\b/i],
  'Gaurela-Pendra-Marwahi (GPM)': [/gaurela/i, /pendra/i, /marwahi/i, /\bgpm\b/i]
};

export function resolveLocationCity(text) {
  if (!text) return 'Unspecified';
  const cleanText = text.toLowerCase();
  for (const [city, patterns] of Object.entries(CITY_ALIASES)) {
    for (const pattern of patterns) {
      if (pattern.test(cleanText)) {
        return city;
      }
    }
  }
  return 'Unspecified';
}

export function cityToSlug(city) {
  return city.toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

