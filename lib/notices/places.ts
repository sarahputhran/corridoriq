// Devanagari spellings for the bus stops along the corridor, used in Hindi and Marathi notice headings.
// Hospital, clinic and school names are left as their owners write them.
const DEVANAGARI: Record<string, string> = {
  "Dandekar Pul": "दांडेकर पूल",
  "Dandekar Pul Shashtri Road": "दांडेकर पूल शास्त्री रोड",
  "Dandekar Pul Sinhagad Road": "दांडेकर पूल सिंहगड रोड",
  "Dattawadi Mhasoba Chowk": "दत्तवाडी म्हसोबा चौक",
  Ganeshmala: "गणेशमळा",
  "Ganeshmala Corner": "गणेशमळा कॉर्नर",
  Hingne: "हिंगणे",
  "Jaidev Nagar": "जयदेव नगर",
  "Lokmanya Nagar": "लोकमान्य नगर",
  "Madhusanchay Society": "मधुसंचय सोसायटी",
  "P.L. Deshpande Udyan": "पु. ल. देशपांडे उद्यान",
  Panmala: "पानमळा",
  "Parvati Jalshuddhikaran Kendra": "पर्वती जलशुद्धीकरण केंद्र",
  "Rajaram Pul": "राजाराम पूल",
  "Rajaram Pul Corner": "राजाराम पूल कॉर्नर",
  "Rakshalekha Society": "रक्षालेखा सोसायटी",
  "Vitthalwadi Jakat Naka": "विठ्ठलवाडी जकात नाका",
  "Vitthalwadi Sinhagad Road": "विठ्ठलवाडी सिंहगड रोड",
};

/** The Devanagari spelling when one is known, otherwise the name unchanged. */
export const devanagariPlace = (name: string): string => DEVANAGARI[name] ?? name;
