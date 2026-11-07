// October to December events. Dates are computed per year from rules, so the calendar stays correct
// in future years. Lunar/lunisolar holidays use verified date tables.
//
// rule shapes:
//   { fixed: [month, day] }                 every year on that date (month 1-12)
//   { nth: [month, weekday, n] }            nth weekday of month (weekday 0=Sun, n=-1 last)
//   { after: [eventId, days] }              offset from another event
//   { lastWeekdayBefore: [month, day, wd] } last given weekday strictly before a date
//   { table: { year: 'YYYY-MM-DD' } }       verified dates (lunar calendars)
//
// leadDays: how many days before the event a campaign should start teasing.
// impact: expected sales/attention impact for creators and sellers (high | medium | low).

import { YEAR_EVENTS } from './events-year.js';

export const REGIONS = ['global', 'US', 'UK', 'CA', 'AU', 'NG', 'IN', 'MX', 'CN', 'EU', 'ME'];

export const CATEGORIES = ['shopping', 'cultural', 'religious', 'awareness', 'seasonal', 'civic'];

const END_OF_YEAR_EVENTS = [
  // October
  { id: 'ng-independence', name: 'Nigeria Independence Day', rule: { fixed: [10, 1] }, regions: ['NG'], category: 'civic', impact: 'medium', leadDays: 7,
    angles: ['national pride collections', 'green-white-green themed products', 'celebrate local makers'], hashtags: ['#NigeriaAt{ngAge}', '#IndependenceDay', '#MadeInNigeria'] },
  { id: 'breast-cancer-awareness', name: 'Breast Cancer Awareness Month', rule: { fixed: [10, 1] }, durationDays: 31, regions: ['global'], category: 'awareness', impact: 'low', leadDays: 3,
    angles: ['donation-linked products (disclose the exact amount donated)', 'survivor stories with consent', 'screening reminders'], hashtags: ['#BreastCancerAwareness', '#PinkOctober'] },
  { id: 'ca-thanksgiving', name: 'Thanksgiving (Canada)', rule: { nth: [10, 1, 2] }, regions: ['CA'], category: 'cultural', impact: 'medium', leadDays: 10,
    angles: ['gratitude posts', 'recipes and hosting', 'harvest collections'], hashtags: ['#CanadianThanksgiving', '#Thanksgiving'] },
  { id: 'world-mental-health-day', name: 'World Mental Health Day', rule: { fixed: [10, 10] }, regions: ['global'], category: 'awareness', impact: 'low', leadDays: 3,
    angles: ['self-care routines', 'team wellbeing', 'resources and helplines'], hashtags: ['#WorldMentalHealthDay'] },
  { id: 'dhanteras', name: 'Dhanteras', rule: { table: { 2026: '2026-11-06', 2027: '2027-10-26', 2028: '2028-10-15' } }, regions: ['IN', 'global'], category: 'religious', impact: 'high', leadDays: 14,
    angles: ['gold, jewellery and home purchases', 'auspicious buying guides', 'festive gift sets'], hashtags: ['#Dhanteras', '#Diwali'] },
  { id: 'diwali', name: 'Diwali', rule: { table: { 2026: '2026-11-08', 2027: '2027-10-29', 2028: '2028-10-17' } }, regions: ['IN', 'global'], category: 'religious', impact: 'high', leadDays: 21,
    angles: ['gift guides', 'home decor and lights', 'festive outfits', 'sweets and recipes', 'family traditions'], hashtags: ['#Diwali', '#HappyDiwali', '#Deepavali', '#FestivalOfLights'] },
  { id: 'halloween', name: 'Halloween', rule: { fixed: [10, 31] }, regions: ['US', 'UK', 'CA', 'AU', 'global'], category: 'cultural', impact: 'high', leadDays: 21,
    angles: ['costume ideas', 'spooky product edits', 'trend/meme formats', 'kids and family activities'], hashtags: ['#Halloween', '#HalloweenCostume', '#SpookySeason'] },

  // November
  { id: 'dia-de-muertos', name: 'Día de Muertos', rule: { fixed: [11, 1] }, durationDays: 2, regions: ['MX', 'US'], category: 'cultural', impact: 'medium', leadDays: 10,
    angles: ['ofrenda and tradition explainers (made with the community)', 'marigold and calavera design themes', 'family remembrance stories'], hashtags: ['#DiaDeMuertos', '#DayOfTheDead'] },
  { id: 'movember', name: 'Movember', rule: { fixed: [11, 1] }, durationDays: 30, regions: ['global'], category: 'awareness', impact: 'low', leadDays: 5,
    angles: ["men's health check-ins", 'team fundraising challenges', 'grooming content'], hashtags: ['#Movember'] },
  { id: 'melbourne-cup', name: 'Melbourne Cup', rule: { nth: [11, 2, 1] }, regions: ['AU'], category: 'cultural', impact: 'medium', leadDays: 10,
    angles: ['race-day fashion', 'office party ideas', 'hospitality offers'], hashtags: ['#MelbourneCup'] },
  { id: 'bonfire-night', name: 'Bonfire Night', rule: { fixed: [11, 5] }, regions: ['UK'], category: 'cultural', impact: 'low', leadDays: 5,
    angles: ['fireworks safety', 'cosy autumn food', 'local events'], hashtags: ['#BonfireNight'] },
  { id: 'remembrance-sunday', name: 'Remembrance Sunday', rule: { nth: [11, 0, 2] }, regions: ['UK'], category: 'civic', impact: 'low', leadDays: 3,
    angles: ['respectful remembrance posts only, no sales tie-ins'], hashtags: ['#RemembranceSunday', '#LestWeForget'], noSales: true },
  { id: 'veterans-day', name: 'Veterans Day', rule: { fixed: [11, 11] }, regions: ['US'], category: 'civic', impact: 'medium', leadDays: 7,
    angles: ['veteran discounts (state verification method)', 'veteran-owned business spotlights'], hashtags: ['#VeteransDay'] },
  { id: 'remembrance-day', name: 'Remembrance Day', rule: { fixed: [11, 11] }, regions: ['UK', 'CA', 'AU'], category: 'civic', impact: 'low', leadDays: 3,
    angles: ['respectful remembrance posts only, no sales tie-ins'], hashtags: ['#RemembranceDay', '#LestWeForget'], noSales: true },
  { id: 'singles-day', name: "Singles' Day (11.11)", rule: { fixed: [11, 11] }, regions: ['CN', 'global'], category: 'shopping', impact: 'high', leadDays: 10,
    angles: ['11.11 flash deals', 'treat-yourself bundles', 'early Black Friday preview'], hashtags: ['#1111', '#SinglesDay', '#DoubleEleven'] },
  { id: 'world-kindness-day', name: 'World Kindness Day', rule: { fixed: [11, 13] }, regions: ['global'], category: 'awareness', impact: 'low', leadDays: 3,
    angles: ['community shout-outs', 'customer appreciation', 'giveaways (publish the rules)'], hashtags: ['#WorldKindnessDay'] },
  { id: 'us-thanksgiving', name: 'Thanksgiving (US)', rule: { nth: [11, 4, 4] }, regions: ['US'], category: 'cultural', impact: 'high', leadDays: 14,
    angles: ['gratitude and customer thank-yous', 'recipes and hosting', 'early-access deals for subscribers'], hashtags: ['#Thanksgiving', '#Grateful'] },
  { id: 'black-friday', name: 'Black Friday', rule: { after: ['us-thanksgiving', 1] }, regions: ['global'], category: 'shopping', impact: 'high', leadDays: 21,
    angles: ['the offer explained clearly, with real prices and terms', 'doorbuster limited stock (state real quantities)', 'gift guides by budget', 'bundles', 'waitlist/early access'], hashtags: ['#BlackFriday', '#BlackFridayDeals', '#BlackFriday{year}'] },
  { id: 'small-business-saturday', name: 'Small Business Saturday (US)', rule: { after: ['us-thanksgiving', 2] }, regions: ['US'], category: 'shopping', impact: 'medium', leadDays: 10,
    angles: ['founder story', 'behind the scenes', 'shop-local collaborations'], hashtags: ['#ShopSmall', '#SmallBusinessSaturday'] },
  { id: 'cyber-monday', name: 'Cyber Monday', rule: { after: ['us-thanksgiving', 4] }, regions: ['global'], category: 'shopping', impact: 'high', leadDays: 14,
    angles: ['online-only offers', 'digital products and courses', 'last call of Cyber Week', 'free shipping'], hashtags: ['#CyberMonday', '#CyberMondayDeals', '#CyberWeek'] },
  { id: 'giving-tuesday', name: 'Giving Tuesday', rule: { after: ['us-thanksgiving', 5] }, regions: ['global'], category: 'awareness', impact: 'medium', leadDays: 7,
    angles: ['donation match (disclose the charity and amount)', 'volunteer stories', 'impact report'], hashtags: ['#GivingTuesday'] },

  // December
  { id: 'uk-small-business-saturday', name: 'Small Business Saturday (UK)', rule: { nth: [12, 6, 1] }, regions: ['UK'], category: 'shopping', impact: 'medium', leadDays: 10,
    angles: ['founder story', 'local maker collaborations'], hashtags: ['#SmallBizSatUK', '#ShopLocal'] },
  { id: 'hanukkah', name: 'Hanukkah (begins at sundown)', rule: { table: { 2026: '2026-12-04', 2027: '2027-12-24', 2028: '2028-12-12' } }, durationDays: 8, regions: ['US', 'global'], category: 'religious', impact: 'medium', leadDays: 14,
    angles: ['eight nights of gifts', 'recipes (latkes, sufganiyot)', 'menorah and table decor'], hashtags: ['#Hanukkah', '#Chanukah', '#HappyHanukkah'] },
  { id: 'green-monday', name: 'Green Monday', rule: { nth: [12, 1, 2] }, regions: ['US'], category: 'shopping', impact: 'medium', leadDays: 5,
    angles: ['last guaranteed-shipping offers', 'gift guide refresh'], hashtags: ['#GreenMonday'] },
  { id: 'shipping-cutoff', name: 'Last standard-shipping week (check your carrier)', rule: { fixed: [12, 15] }, durationDays: 3, regions: ['global'], category: 'shopping', impact: 'high', leadDays: 5,
    angles: ['order-by-date reminders', 'digital gift cards as the late-shopper fallback', 'express shipping upsell'], hashtags: ['#LastMinuteGifts'], note: 'Approximate. Carrier cutoffs differ by carrier, service and destination; confirm before posting dates.' },
  { id: 'super-saturday', name: 'Super Saturday', rule: { lastWeekdayBefore: [12, 25, 6] }, regions: ['US', 'UK'], category: 'shopping', impact: 'high', leadDays: 7,
    angles: ['last-minute gift guides', 'in-store pickup / local delivery', 'gift cards'], hashtags: ['#SuperSaturday', '#LastMinuteGifts'] },
  { id: 'winter-solstice', name: 'Winter Solstice', rule: { fixed: [12, 21] }, regions: ['global'], category: 'seasonal', impact: 'low', leadDays: 3,
    angles: ['cosy season content', 'longest-night rituals', 'year-in-review teasers'], hashtags: ['#WinterSolstice'] },
  { id: 'christmas-eve', name: 'Christmas Eve', rule: { fixed: [12, 24] }, regions: ['global'], category: 'religious', impact: 'medium', leadDays: 3,
    angles: ['digital gift cards', 'thank-you message', 'holiday hours'], hashtags: ['#ChristmasEve'] },
  { id: 'christmas', name: 'Christmas Day', rule: { fixed: [12, 25] }, regions: ['global'], category: 'religious', impact: 'high', leadDays: 35,
    angles: ['gift guides by person and budget', '12 days of deals', 'advent calendar content', 'family traditions', 'holiday greetings'], hashtags: ['#Christmas', '#MerryChristmas', '#ChristmasGifts', '#GiftGuide'] },
  { id: 'boxing-day', name: 'Boxing Day', rule: { fixed: [12, 26] }, regions: ['UK', 'CA', 'AU', 'NG'], category: 'shopping', impact: 'high', leadDays: 7,
    angles: ['Boxing Day sale', 'clearance', 'gift-card spend offers'], hashtags: ['#BoxingDay', '#BoxingDaySale'] },
  { id: 'kwanzaa', name: 'Kwanzaa', rule: { fixed: [12, 26] }, durationDays: 7, regions: ['US'], category: 'cultural', impact: 'low', leadDays: 7,
    angles: ['the seven principles (Nguzo Saba)', 'Black-owned business spotlights'], hashtags: ['#Kwanzaa', '#HappyKwanzaa'] },
  { id: 'new-years-eve', name: "New Year's Eve", rule: { fixed: [12, 31] }, regions: ['global'], category: 'cultural', impact: 'medium', leadDays: 7,
    angles: ['year-in-review / wrapped', 'party outfits and countdowns', 'thank-you to customers'], hashtags: ['#NewYearsEve', '#NYE'] },
  { id: 'new-year', name: "New Year's Day", rule: { fixed: [1, 1] }, nextYear: true, regions: ['global'], category: 'cultural', impact: 'medium', leadDays: 10,
    angles: ['new-year goals and resolutions', 'fresh-start offers', 'January planning'], hashtags: ['#NewYear', '#HappyNewYear'] },
];

// All events, January to December.
export const EVENTS = [...YEAR_EVENTS, ...END_OF_YEAR_EVENTS];
