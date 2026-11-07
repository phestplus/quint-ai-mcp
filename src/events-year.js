// Events from January to September. Same shape as the October to December events in events.js.
// Moon-sighted dates (Ramadan, Eid) can shift by a day by country: they carry a note.
// Sources: Hebcal (Jewish holidays), Umm al-Qura projections and UAE announcements (Ramadan, Eid),
// public holiday listings (Lunar New Year, Holi). Unknown years are left out, never guessed.

const MOON = 'Depends on moon sighting; may shift by one day in your country.';

export const YEAR_EVENTS = [
  // January to March
  { id: 'lunar-new-year', name: 'Lunar New Year', rule: { table: { 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26' } }, durationDays: 3, regions: ['CN', 'global'], category: 'cultural', impact: 'high', leadDays: 21,
    angles: ['red and gold gift sets', 'zodiac animal themes', 'family reunion dinners', 'red envelope promotions'], hashtags: ['#LunarNewYear', '#ChineseNewYear'] },
  { id: 'valentines', name: "Valentine's Day", rule: { fixed: [2, 14] }, regions: ['global'], category: 'shopping', impact: 'high', leadDays: 21,
    angles: ['gift guides for him and her', 'Galentine\'s and self-love', 'date night ideas', 'couple bundles'], hashtags: ['#ValentinesDay', '#Valentines', '#GiftIdeas'] },
  { id: 'ramadan', name: 'Ramadan begins', rule: { table: { 2027: '2027-02-08', 2028: '2028-01-28' } }, durationDays: 29, regions: ['NG', 'ME', 'IN', 'UK', 'global'], category: 'religious', impact: 'high', leadDays: 14, note: MOON,
    angles: ['iftar and suhoor products and recipes', 'modest fashion', 'Eid gift pre-orders', 'charity and giving (state amounts)'], hashtags: ['#Ramadan', '#RamadanMubarak', '#RamadanKareem'] },
  { id: 'womens-day', name: "International Women's Day", rule: { fixed: [3, 8] }, regions: ['global'], category: 'awareness', impact: 'medium', leadDays: 7,
    angles: ['women founders and team stories', 'donation-linked products (state the amount)', 'customer spotlights'], hashtags: ['#IWD', '#InternationalWomensDay'] },
  { id: 'eid-al-fitr', name: 'Eid al-Fitr', rule: { table: { 2027: '2027-03-09', 2028: '2028-02-26' } }, durationDays: 3, regions: ['NG', 'ME', 'IN', 'UK', 'global'], category: 'religious', impact: 'high', leadDays: 21, note: MOON,
    angles: ['Eid outfits and family matching sets', 'gift boxes and sweets', 'Eid travel and hosting', 'order-by dates for Eid delivery'], hashtags: ['#EidMubarak', '#EidAlFitr', '#Eid'] },
  { id: 'mothering-sunday', name: 'Mothering Sunday (UK, Nigeria)', rule: { easter: -21 }, regions: ['UK', 'NG'], category: 'shopping', impact: 'high', leadDays: 21,
    angles: ['gifts for mum by budget', 'pamper and self-care sets', 'brunch and flowers', 'messages to mum'], hashtags: ['#MotheringSunday', '#MothersDay'] },
  { id: 'st-patricks', name: "St Patrick's Day", rule: { fixed: [3, 17] }, regions: ['US', 'UK', 'EU'], category: 'cultural', impact: 'medium', leadDays: 10,
    angles: ['green edits', 'party and pub offers', 'Irish heritage stories'], hashtags: ['#StPatricksDay'] },
  { id: 'holi', name: 'Holi', rule: { table: { 2027: '2027-03-22', 2028: '2028-03-11' } }, regions: ['IN', 'global'], category: 'religious', impact: 'high', leadDays: 14,
    angles: ['colour-safe skincare and haircare', 'white outfits', 'sweets and party packs'], hashtags: ['#Holi', '#HappyHoli', '#FestivalOfColours'] },
  // April to June
  { id: 'good-friday', name: 'Good Friday', rule: { easter: -2 }, regions: ['global'], category: 'religious', impact: 'medium', leadDays: 3, noSales: true,
    angles: ['respectful reflection posts; no sales tie-ins', 'holiday opening hours'], hashtags: ['#GoodFriday'] },
  { id: 'easter', name: 'Easter Sunday', rule: { easter: 0 }, durationDays: 2, regions: ['global'], category: 'religious', impact: 'high', leadDays: 21,
    angles: ['Easter gift baskets and chocolate', 'spring refresh edits', 'family lunch and hosting', 'Easter Monday sale'], hashtags: ['#Easter', '#HappyEaster'] },
  { id: 'passover', name: 'Passover (begins at sundown)', rule: { table: { 2027: '2027-04-21', 2028: '2028-04-10' } }, durationDays: 8, regions: ['US', 'global'], category: 'religious', impact: 'medium', leadDays: 14,
    angles: ['Seder table and hosting', 'kosher-for-Passover products', 'family recipes'], hashtags: ['#Passover', '#ChagSameach'] },
  { id: 'earth-day', name: 'Earth Day', rule: { fixed: [4, 22] }, regions: ['global'], category: 'awareness', impact: 'low', leadDays: 7,
    angles: ['sustainability steps you really take (no greenwashing)', 'refill and repair offers', 'packaging changes'], hashtags: ['#EarthDay'] },
  { id: 'mothers-day', name: "Mother's Day (US, CA, AU, IN and more)", rule: { nth: [5, 0, 2] }, regions: ['US', 'CA', 'AU', 'IN', 'global'], category: 'shopping', impact: 'high', leadDays: 21,
    angles: ['gifts for mum by budget', 'personalised gifts with order-by dates', 'brunch, flowers and experiences', 'messages to mum'], hashtags: ['#MothersDay', '#MothersDayGifts'] },
  { id: 'eid-al-adha', name: 'Eid al-Adha', rule: { table: { 2027: '2027-05-16' } }, durationDays: 3, regions: ['NG', 'ME', 'IN', 'UK', 'global'], category: 'religious', impact: 'high', leadDays: 21, note: MOON,
    angles: ['Eid outfits', 'hosting and food', 'gifts for family', 'travel'], hashtags: ['#EidAlAdha', '#EidMubarak', '#Sallah'] },
  { id: 'ng-childrens-day', name: "Children's Day (Nigeria)", rule: { fixed: [5, 27] }, regions: ['NG'], category: 'civic', impact: 'medium', leadDays: 10,
    angles: ['kids gifts and outings', 'school activities', 'family offers'], hashtags: ['#ChildrensDay'] },
  { id: 'memorial-day', name: 'Memorial Day (US)', rule: { nth: [5, 1, -1] }, regions: ['US'], category: 'shopping', impact: 'high', leadDays: 14,
    angles: ['start-of-summer sale', 'outdoor and travel gear', 'respectful acknowledgement of the fallen in the same post'], hashtags: ['#MemorialDay', '#MemorialDaySale'] },
  { id: 'graduation-season', name: 'Graduation season', rule: { fixed: [5, 15] }, durationDays: 45, regions: ['US', 'UK', 'CA', 'NG', 'global'], category: 'shopping', impact: 'medium', leadDays: 14,
    angles: ['graduation gifts by budget', 'outfits and photo shoots', 'career-start bundles'], hashtags: ['#ClassOf', '#Graduation', '#GradGifts'] },
  { id: 'pride-month', name: 'Pride Month', rule: { fixed: [6, 1] }, durationDays: 30, regions: ['US', 'UK', 'CA', 'EU', 'AU'], category: 'awareness', impact: 'medium', leadDays: 7,
    angles: ['community partnerships and donations (state amounts)', 'staff and creator stories with consent'], hashtags: ['#Pride', '#PrideMonth'] },
  { id: 'ng-democracy-day', name: 'Democracy Day (Nigeria)', rule: { fixed: [6, 12] }, regions: ['NG'], category: 'civic', impact: 'low', leadDays: 3,
    angles: ['national pride content', 'public holiday hours'], hashtags: ['#DemocracyDay'] },
  { id: 'fathers-day', name: "Father's Day", rule: { nth: [6, 0, 3] }, regions: ['US', 'UK', 'CA', 'IN', 'NG', 'global'], category: 'shopping', impact: 'high', leadDays: 21,
    angles: ['gifts for dad by budget', 'grooming and gadgets', 'experiences and outings', 'messages to dad'], hashtags: ['#FathersDay', '#FathersDayGifts'] },
  { id: 'juneteenth', name: 'Juneteenth', rule: { fixed: [6, 19] }, regions: ['US'], category: 'civic', impact: 'medium', leadDays: 7,
    angles: ['Black-owned business spotlights', 'history and education', 'community partnerships'], hashtags: ['#Juneteenth'] },
  { id: 'summer-solstice', name: 'Summer Solstice', rule: { fixed: [6, 21] }, regions: ['global'], category: 'seasonal', impact: 'low', leadDays: 3,
    angles: ['summer edits', 'longest day offers', 'outdoor content'], hashtags: ['#SummerSolstice'] },
  // July to September
  { id: 'canada-day', name: 'Canada Day', rule: { fixed: [7, 1] }, regions: ['CA'], category: 'civic', impact: 'medium', leadDays: 7,
    angles: ['red and white edits', 'local makers', 'long weekend offers'], hashtags: ['#CanadaDay'] },
  { id: 'us-independence', name: 'Independence Day (US)', rule: { fixed: [7, 4] }, regions: ['US'], category: 'shopping', impact: 'high', leadDays: 14,
    angles: ['4th of July sale', 'BBQ and party supplies', 'summer travel'], hashtags: ['#FourthOfJuly', '#July4th'] },
  { id: 'back-to-school', name: 'Back to school', rule: { fixed: [8, 1] }, durationDays: 45, regions: ['US', 'UK', 'CA', 'AU', 'NG', 'global'], category: 'shopping', impact: 'high', leadDays: 14,
    angles: ['school supply bundles', 'uniform and shoe deals', 'lunchbox and routine content', 'tech for students'], hashtags: ['#BackToSchool'] },
  { id: 'us-labor-day', name: 'Labor Day (US)', rule: { nth: [9, 1, 1] }, regions: ['US'], category: 'shopping', impact: 'medium', leadDays: 10,
    angles: ['end-of-summer sale', 'home and mattress deals', 'long weekend offers'], hashtags: ['#LaborDay', '#LaborDaySale'] },
  { id: 'rosh-hashanah', name: 'Rosh Hashanah (begins at sundown)', rule: { table: { 2027: '2027-10-01', 2028: '2028-09-20' } }, durationDays: 2, regions: ['US', 'global'], category: 'religious', impact: 'medium', leadDays: 14,
    angles: ['apples, honey and hosting', 'new year greetings', 'gift baskets'], hashtags: ['#RoshHashanah', '#ShanaTova'] },
];

// How strongly a 'global' event applies outside its home regions (0..1).
export const YEAR_GLOBAL_REACH = {
  'lunar-new-year': 0.4, valentines: 0.95, ramadan: 0.4, 'womens-day': 0.8, 'eid-al-fitr': 0.45, holi: 0.3, 'good-friday': 0.7, easter: 0.8,
  passover: 0.25, 'earth-day': 0.6, 'mothers-day': 0.6, 'eid-al-adha': 0.45, 'graduation-season': 0.5, 'fathers-day': 0.85, 'summer-solstice': 0.3,
  'back-to-school': 0.7, 'rosh-hashanah': 0.25,
};
