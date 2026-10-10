/**
 * India Location Parser & Evidence Validator
 * 
 * Strict rules:
 * - "From India" means author is currently based/working in India.
 * - Accept clear Indian city/state or explicit India current location.
 * - Store current city and state/Union Territory separately.
 * - Keep preferred/target job location separate from current location.
 * - DO NOT infer India location from:
 *   * Candidate name or nationality
 *   * Indian employer name alone
 *   * Vacancy located in India
 *   * Desire to relocate to India ("seeking a role in India", "open to relocate to India")
 *   * India hashtags (#India, #IndiaSales) or phone country code (+91) alone
 * - If location is unknown or conflicting, return author_based_in_india = 'unknown' (Needs Review).
 * - If confirmed international (e.g. Dubai, Singapore, USA), return author_based_in_india = false (Outside Target).
 */

export interface IndiaLocationValidationResult {
  author_based_in_india: boolean | 'unknown';
  currentCity: string | null;
  currentStateOrUT: string | null;
  preferredLocation: string | null;
  location_evidence: string;
}

// Major Indian States & Union Territories
const INDIAN_STATES_AND_UTS: Record<string, string> = {
  maharashtra: 'Maharashtra',
  karnataka: 'Karnataka',
  delhi: 'Delhi',
  'new delhi': 'Delhi',
  'delhi ncr': 'Delhi NCR',
  'ncr': 'Delhi NCR',
  'tamil nadu': 'Tamil Nadu',
  telangana: 'Telangana',
  'west bengal': 'West Bengal',
  gujarat: 'Gujarat',
  'uttar pradesh': 'Uttar Pradesh',
  'up': 'Uttar Pradesh',
  rajasthan: 'Rajasthan',
  kerala: 'Kerala',
  punjab: 'Punjab',
  haryana: 'Haryana',
  'madhya pradesh': 'Madhya Pradesh',
  'mp': 'Madhya Pradesh',
  bihar: 'Bihar',
  'andhra pradesh': 'Andhra Pradesh',
  odisha: 'Odisha',
  orissa: 'Odisha',
  jharkhand: 'Jharkhand',
  assam: 'Assam',
  chhattisgarh: 'Chhattisgarh',
  uttarakhand: 'Uttarakhand',
  goa: 'Goa',
  'himachal pradesh': 'Himachal Pradesh',
  chandigarh: 'Chandigarh',
  puducherry: 'Puducherry',
  pondicherry: 'Puducherry',
  'jammu and kashmir': 'Jammu & Kashmir',
  'jammu & kashmir': 'Jammu & Kashmir',
  ladakh: 'Ladakh',
};

// Major Indian Cities mapped to State/UT
const INDIAN_CITIES_TO_STATE: Record<string, { city: string; state: string }> = {
  mumbai: { city: 'Mumbai', state: 'Maharashtra' },
  pune: { city: 'Pune', state: 'Maharashtra' },
  nagpur: { city: 'Nagpur', state: 'Maharashtra' },
  nashik: { city: 'Nashik', state: 'Maharashtra' },
  thane: { city: 'Thane', state: 'Maharashtra' },
  'navi mumbai': { city: 'Navi Mumbai', state: 'Maharashtra' },
  aurangabad: { city: 'Aurangabad', state: 'Maharashtra' },
  bengaluru: { city: 'Bengaluru', state: 'Karnataka' },
  bangalore: { city: 'Bengaluru', state: 'Karnataka' },
  mysuru: { city: 'Mysuru', state: 'Karnataka' },
  mysore: { city: 'Mysuru', state: 'Karnataka' },
  hubli: { city: 'Hubli', state: 'Karnataka' },
  mangalore: { city: 'Mangalore', state: 'Karnataka' },
  belgaum: { city: 'Belgaum', state: 'Karnataka' },
  delhi: { city: 'Delhi', state: 'Delhi' },
  'new delhi': { city: 'New Delhi', state: 'Delhi' },
  gurgaon: { city: 'Gurgaon', state: 'Haryana' },
  gurugram: { city: 'Gurugram', state: 'Haryana' },
  noida: { city: 'Noida', state: 'Uttar Pradesh' },
  'greater noida': { city: 'Greater Noida', state: 'Uttar Pradesh' },
  faridabad: { city: 'Faridabad', state: 'Haryana' },
  ghaziabad: { city: 'Ghaziabad', state: 'Uttar Pradesh' },
  hyderabad: { city: 'Hyderabad', state: 'Telangana' },
  secunderabad: { city: 'Secunderabad', state: 'Telangana' },
  warangal: { city: 'Warangal', state: 'Telangana' },
  chennai: { city: 'Chennai', state: 'Tamil Nadu' },
  coimbatore: { city: 'Coimbatore', state: 'Tamil Nadu' },
  madurai: { city: 'Madurai', state: 'Tamil Nadu' },
  trichy: { city: 'Tiruchirappalli', state: 'Tamil Nadu' },
  tiruchirappalli: { city: 'Tiruchirappalli', state: 'Tamil Nadu' },
  salem: { city: 'Salem', state: 'Tamil Nadu' },
  kolkata: { city: 'Kolkata', state: 'West Bengal' },
  howrah: { city: 'Howrah', state: 'West Bengal' },
  durgapur: { city: 'Durgapur', state: 'West Bengal' },
  siliguri: { city: 'Siliguri', state: 'West Bengal' },
  ahmedabad: { city: 'Ahmedabad', state: 'Gujarat' },
  surat: { city: 'Surat', state: 'Gujarat' },
  vadodara: { city: 'Vadodara', state: 'Gujarat' },
  baroda: { city: 'Vadodara', state: 'Gujarat' },
  rajkot: { city: 'Rajkot', state: 'Gujarat' },
  gandhinagar: { city: 'Gandhinagar', state: 'Gujarat' },
  jaipur: { city: 'Jaipur', state: 'Rajasthan' },
  jodhpur: { city: 'Jodhpur', state: 'Rajasthan' },
  udaipur: { city: 'Udaipur', state: 'Rajasthan' },
  kota: { city: 'Kota', state: 'Rajasthan' },
  lucknow: { city: 'Lucknow', state: 'Uttar Pradesh' },
  kanpur: { city: 'Kanpur', state: 'Uttar Pradesh' },
  varanasi: { city: 'Varanasi', state: 'Uttar Pradesh' },
  agra: { city: 'Agra', state: 'Uttar Pradesh' },
  prayagraj: { city: 'Prayagraj', state: 'Uttar Pradesh' },
  allahabad: { city: 'Prayagraj', state: 'Uttar Pradesh' },
  chandigarh: { city: 'Chandigarh', state: 'Chandigarh' },
  ludhiana: { city: 'Ludhiana', state: 'Punjab' },
  amritsar: { city: 'Amritsar', state: 'Punjab' },
  jalandhar: { city: 'Jalandhar', state: 'Punjab' },
  kochi: { city: 'Kochi', state: 'Kerala' },
  cochin: { city: 'Kochi', state: 'Kerala' },
  thiruvananthapuram: { city: 'Thiruvananthapuram', state: 'Kerala' },
  trivandrum: { city: 'Thiruvananthapuram', state: 'Kerala' },
  calicut: { city: 'Kozhikode', state: 'Kerala' },
  kozhikode: { city: 'Kozhikode', state: 'Kerala' },
  indore: { city: 'Indore', state: 'Madhya Pradesh' },
  bhopal: { city: 'Bhopal', state: 'Madhya Pradesh' },
  jabalpur: { city: 'Jabalpur', state: 'Madhya Pradesh' },
  gwalior: { city: 'Gwalior', state: 'Madhya Pradesh' },
  patna: { city: 'Patna', state: 'Bihar' },
  bhubaneswar: { city: 'Bhubaneswar', state: 'Odisha' },
  cuttack: { city: 'Cuttack', state: 'Odisha' },
  ranchi: { city: 'Ranchi', state: 'Jharkhand' },
  jamshedpur: { city: 'Jamshedpur', state: 'Jharkhand' },
  raipur: { city: 'Raipur', state: 'Chhattisgarh' },
  dehradun: { city: 'Dehradun', state: 'Uttarakhand' },
  guwahati: { city: 'Guwahati', state: 'Assam' },
  panaji: { city: 'Panaji', state: 'Goa' },
  jammu: { city: 'Jammu', state: 'Jammu & Kashmir' },
  srinagar: { city: 'Srinagar', state: 'Jammu & Kashmir' },
};

// Known International locations
const INTERNATIONAL_KEYWORDS = [
  'dubai',
  'uae',
  'united arab emirates',
  'abu dhabi',
  'sharjah',
  'qatar',
  'doha',
  'saudi arabia',
  'riyadh',
  'jeddah',
  'kuwait',
  'bahrain',
  'oman',
  'muscat',
  'singapore',
  'malaysia',
  'kuala lumpur',
  'thailand',
  'bangkok',
  'philippines',
  'manila',
  'usa',
  'united states',
  'america',
  'california',
  'new york',
  'texas',
  'florida',
  'chicago',
  'san francisco',
  'seattle',
  'uk',
  'united kingdom',
  'london',
  'manchester',
  'birmingham',
  'canada',
  'toronto',
  'vancouver',
  'montreal',
  'australia',
  'sydney',
  'melbourne',
  'brisbane',
  'germany',
  'berlin',
  'munich',
  'france',
  'paris',
  'netherlands',
  'amsterdam',
  'ireland',
  'dublin',
  'europe',
];

/**
 * Extracts preferred/target job location statements from the post text.
 * Examples: "seeking a sales role in India", "open to relocate to Pune", "looking for roles in Mumbai"
 */
function extractPreferredLocation(postText: string): string | null {
  const lower = postText.toLowerCase();

  // Patterns indicating desired/target destination
  const prefPatterns = [
    /(?:seeking|looking for|open to|exploring)\s+(?:a\s+)?(?:new\s+)?(?:sales\s+)?(?:role|roles|job|jobs|position|positions|opportunities)\s+in\s+([a-zA-Z\s,]+?)(?:\.|\!|\?|$|\n|feel free|contact|reach me)/i,
    /(?:open to relocate|willing to relocate|relocating|open for relocation)\s+to\s+([a-zA-Z\s,]+?)(?:\.|\!|\?|$|\n)/i,
    /(?:preferred location|target location|desired location)[:\s]+([a-zA-Z\s,]+?)(?:\.|\!|\?|$|\n)/i,
    /(?:based in\s+[a-zA-Z\s]+?\s+and\s+seeking\s+(?:a\s+)?(?:sales\s+)?role\s+in)\s+([a-zA-Z\s,]+?)(?:\.|\!|\?|$|\n)/i,
  ];

  for (const regex of prefPatterns) {
    const match = postText.match(regex);
    if (match && match[1]) {
      const loc = match[1].trim().replace(/^(a\s+|new\s+|sales\s+)/i, '');
      if (loc.length > 2 && loc.length < 50) {
        return loc;
      }
    }
  }

  return null;
}

/**
 * Evaluates author's current location from profile location and post content.
 */
export function validateAuthorIndiaLocation(
  postContent: string,
  profileLocation?: string | null,
  headline?: string | null
): IndiaLocationValidationResult {
  const postLower = String(postContent || '').toLowerCase();
  const profileLoc = String(profileLocation || '').trim();
  const profileLower = profileLoc.toLowerCase();
  const headlineLower = String(headline || '').toLowerCase();

  const preferredLocation = extractPreferredLocation(postContent);

  // 1. Check for CURRENT international location
  // Check profile location first: if profile is clearly international
  for (const intl of INTERNATIONAL_KEYWORDS) {
    const intlRegex = new RegExp(`\\b${intl}\\b`, 'i');
    if (profileLower && intlRegex.test(profileLower)) {
      return {
        author_based_in_india: false,
        currentCity: null,
        currentStateOrUT: null,
        preferredLocation,
        location_evidence: `Author is currently based outside India according to profile location: "${profileLoc}".`,
      };
    }
  }

  // Check post text for CURRENT international location (e.g. "I am based in Dubai", "Currently working in Singapore")
  const currentIntlPatterns = [
    /\bi\s+(?:am\s+)?based\s+in\s+([a-zA-Z\s]+)/i,
    /\bcurrently\s+(?:based|working|living|located)\s+in\s+([a-zA-Z\s]+)/i,
    /\bworking\s+out\s+of\s+([a-zA-Z\s]+)/i,
    /\bfrom\s+my\s+office\s+in\s+([a-zA-Z\s]+)/i,
  ];

  for (const pattern of currentIntlPatterns) {
    const match = postContent.match(pattern);
    if (match && match[1]) {
      const stated = match[1].toLowerCase().trim();
      for (const intl of INTERNATIONAL_KEYWORDS) {
        if (stated.includes(intl)) {
          return {
            author_based_in_india: false,
            currentCity: null,
            currentStateOrUT: null,
            preferredLocation: preferredLocation || (stated.includes('india') ? 'India' : null),
            location_evidence: `Author explicitly states current residence outside India: "${match[0]}".`,
          };
        }
      }
    }
  }

  // 2. Check for CURRENT Indian City / State in Profile Location
  if (profileLoc && profileLoc !== 'Not Stated' && profileLoc.length > 2) {
    // Check Indian cities in profile location
    for (const [key, mapping] of Object.entries(INDIAN_CITIES_TO_STATE)) {
      const cityRegex = new RegExp(`\\b${key}\\b`, 'i');
      if (cityRegex.test(profileLower)) {
        return {
          author_based_in_india: true,
          currentCity: mapping.city,
          currentStateOrUT: mapping.state,
          preferredLocation,
          location_evidence: `Profile location confirmed in India: "${profileLoc}" (City: ${mapping.city}, State/UT: ${mapping.state}).`,
        };
      }
    }

    // Check Indian states/UTs in profile location
    for (const [key, stateName] of Object.entries(INDIAN_STATES_AND_UTS)) {
      const stateRegex = new RegExp(`\\b${key}\\b`, 'i');
      if (stateRegex.test(profileLower)) {
        return {
          author_based_in_india: true,
          currentCity: null,
          currentStateOrUT: stateName,
          preferredLocation,
          location_evidence: `Profile location confirmed in India: "${profileLoc}" (State/UT: ${stateName}).`,
        };
      }
    }

    // Explicit "India" in profile location (and not an international false-positive)
    if (/\bindia\b/i.test(profileLower)) {
      return {
        author_based_in_india: true,
        currentCity: null,
        currentStateOrUT: null,
        preferredLocation,
        location_evidence: `Profile location explicitly states India: "${profileLoc}".`,
      };
    }
  }

  // 3. Check for CURRENT Indian City / State stated in Post Content
  // Look for first-person current employment or residence: "I work in Pune", "I am based in Mumbai", "Working in Delhi"
  const currentIndiaWorkPatterns = [
    /\b(?:i\s+work|working|i'm\s+working|employed|based)\s+in\s+([a-zA-Z\s]+?)(?:,|;|\.|\!|\?|$|\n|\s+in\s+|\s+as\s+|\s+at\s+|\s+and\s+)/i,
    /\b(?:currently\s+in|located\s+in|living\s+in)\s+([a-zA-Z\s]+?)(?:,|;|\.|\!|\?|$|\n)/i,
  ];

  for (const pattern of currentIndiaWorkPatterns) {
    const match = postContent.match(pattern);
    if (match && match[1]) {
      const candLoc = match[1].toLowerCase().trim();
      // Check city
      for (const [key, mapping] of Object.entries(INDIAN_CITIES_TO_STATE)) {
        if (candLoc === key || candLoc.includes(key)) {
          return {
            author_based_in_india: true,
            currentCity: mapping.city,
            currentStateOrUT: mapping.state,
            preferredLocation,
            location_evidence: `Author explicitly states current work location in India: "${match[0].trim()}" (City: ${mapping.city}, State/UT: ${mapping.state}).`,
          };
        }
      }
      // Check state
      for (const [key, stateName] of Object.entries(INDIAN_STATES_AND_UTS)) {
        if (candLoc === key || candLoc.includes(key)) {
          return {
            author_based_in_india: true,
            currentCity: null,
            currentStateOrUT: stateName,
            preferredLocation,
            location_evidence: `Author explicitly states current location in India: "${match[0].trim()}" (State/UT: ${stateName}).`,
          };
        }
      }
    }
  }

  // Check headline for location
  if (headlineLower) {
    for (const [key, mapping] of Object.entries(INDIAN_CITIES_TO_STATE)) {
      const cityRegex = new RegExp(`\\b${key}\\b`, 'i');
      if (cityRegex.test(headlineLower)) {
        return {
          author_based_in_india: true,
          currentCity: mapping.city,
          currentStateOrUT: mapping.state,
          preferredLocation,
          location_evidence: `Author headline indicates location in India: "${headline}" (City: ${mapping.city}, State/UT: ${mapping.state}).`,
        };
      }
    }
  }

  // If author only mentions seeking role in India or relocate to India, but current location is unstated:
  if (preferredLocation) {
    return {
      author_based_in_india: 'unknown',
      currentCity: null,
      currentStateOrUT: null,
      preferredLocation,
      location_evidence: `Author expresses preference to work in "${preferredLocation}", but current residence/work location is unstated (Needs Review).`,
    };
  }

  // 4. Default to 'unknown': DO NOT GUESS OR INFER FROM NAME, COMPANY OR VACANCY
  return {
    author_based_in_india: 'unknown',
    currentCity: null,
    currentStateOrUT: null,
    preferredLocation: null,
    location_evidence: 'Current location is unstated in post and profile. Cannot verify current residence in India (Needs Review).',
  };
}
