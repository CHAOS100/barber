import barberPhoto from '@/assets/hero.png';

export const BARBER_PHOTO = barberPhoto;

export const BUSINESS_INFO = {
  name: "OST BARBER",
  address: "השומר 55, ראשון לציון",
  phone: "054-2244542",
  whatsapp: "+972542244542",
  rating: 4.9,
  reviews_count: 115,
  description: "ספר פרימיום המתמחה בפייד, תספורות מודרניות, עיצוב זקן ועיצוב שיער.",
  instagram: "https://instagram.com/ostbarber",
  waze: "https://waze.com/ul?q=השומר+55+ראשון+לציון",
  hours: [
    { day: "ראשון", open: "09:00", close: "20:00", is_open: true },
    { day: "שני", open: "09:00", close: "20:00", is_open: true },
    { day: "שלישי", open: "09:00", close: "20:00", is_open: true },
    { day: "רביעי", open: "09:00", close: "20:00", is_open: true },
    { day: "חמישי", open: "09:00", close: "21:00", is_open: true },
    { day: "שישי", open: "09:00", close: "15:00", is_open: true },
    { day: "שבת", open: null, close: null, is_open: false },
  ]
};

export const MOCK_SERVICES = [
  { id: "s1", name: "תספורת רגילה",              description: "תספורת קלאסית עם גימור מושלם",          price: 60,  duration: 30, is_active: true, category: "תורים" },
  { id: "s2", name: "תספורת + פנס",              description: "תספורת עם פנס מקצועי",                  price: 80,  duration: 30, is_active: true, category: "תורים" },
  { id: "s3", name: "תספורת + זקן",              description: "שילוב מנצח - תספורת ועיצוב זקן",        price: 80,  duration: 40, is_active: true, category: "תורים" },
  { id: "s4", name: "תספורת גזירות / מספריים",   description: "תספורת מקצועית עם מספריים",             price: 100, duration: 45, is_active: true, category: "תורים" },
  { id: "s5", name: "עיצוב זקן",                 description: "עיצוב ותיקון זקן מקצועי",               price: 40,  duration: 15, is_active: true, category: "תורים" },
  { id: "s6", name: "חבילת פרימיום",             description: "חוויה מלאה: תספורת + זקן + טיפול פנים", price: 150, duration: 80, is_active: true, category: "תורים" },
];

export const ADMIN_EMAIL = "admin@ostbarber.com";
export const ADMIN_PASSWORD = "Admin123!";

export const MOCK_GALLERY = [
  { id: "g1", url: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&q=80", category: "skin_fades", is_featured: true },
  { id: "g2", url: "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&q=80", category: "haircuts", is_featured: true },
  { id: "g3", url: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400&q=80", category: "beard", is_featured: false },
  { id: "g4", url: "https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=400&q=80", category: "premium_styles", is_featured: true },
  { id: "g5", url: "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400&q=80", category: "skin_fades", is_featured: false },
  { id: "g6", url: "https://images.unsplash.com/photo-1595152772835-219674b2a8a6?w=400&q=80", category: "haircuts", is_featured: false },
  { id: "g7", url: "https://images.unsplash.com/photo-1567894340315-735d7c361db0?w=400&q=80", category: "beard", is_featured: true },
  { id: "g8", url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&q=80", category: "premium_styles", is_featured: false },
];

export const MOCK_REVIEWS = [
  { id: "r1", customer_name: "יוסי כהן", rating: 5, comment: "הכי טוב שיש! פייד מדהים, שירות מעולה. ממליץ בחום לכולם", service_name: "סקין פייד", created_date: "2026-05-20", is_pinned: true },
  { id: "r2", customer_name: "דוד לוי", rating: 5, comment: "OST הוא הספר הכי מקצועי שפגשתי. כל פעם אני יוצא עם חיוך", service_name: "תספורת + זקן", created_date: "2026-05-18" },
  { id: "r3", customer_name: "משה אברהם", rating: 5, comment: "חבילת הפרימיום שווה כל שקל. חוויה ברמה אחרת לגמרי", service_name: "חבילת פרימיום", created_date: "2026-05-15", admin_reply: "תודה רבה! שמח שנהנית 🙏" },
  { id: "r4", customer_name: "אמיר נחמני", rating: 4, comment: "מקצועי ומהיר, זמינות טובה. בהחלט אחזור", service_name: "תספורת רגילה", created_date: "2026-05-10" },
  { id: "r5", customer_name: "רועי שפירא", rating: 5, comment: "הכי יפה שתספרתי! הסקין פייד יצא מושלם לחלוטין", service_name: "סקין פייד", created_date: "2026-05-08" },
];

export const MOCK_APPOINTMENTS = [
  { id: "a1", customer_name: "יוסי כהן", customer_phone: "052-1234567", service_name: "סקין פייד", service_price: 80, date: "2026-05-29", time: "10:00", status: "confirmed" },
  { id: "a2", customer_name: "דוד לוי", customer_phone: "053-2345678", service_name: "תספורת + זקן", service_price: 90, date: "2026-05-29", time: "11:00", status: "confirmed" },
  { id: "a3", customer_name: "משה אברהם", customer_phone: "054-3456789", service_name: "תספורת רגילה", service_price: 60, date: "2026-05-29", time: "12:00", status: "pending" },
  { id: "a4", customer_name: "אמיר נחמני", customer_phone: "050-4567890", service_name: "חבילת פרימיום", service_price: 150, date: "2026-05-29", time: "14:00", status: "confirmed" },
  { id: "a5", customer_name: "רועי שפירא", customer_phone: "058-5678901", service_name: "עיצוב זקן", service_price: 50, date: "2026-05-30", time: "09:00", status: "confirmed" },
  { id: "a6", customer_name: "ניר כץ", customer_phone: "052-6789012", service_name: "סקין פייד", service_price: 80, date: "2026-05-30", time: "10:30", status: "confirmed" },
];

export const MOCK_NOTIFICATIONS = [
  { id: "n1", title: "תור אושר ✅", message: "התור שלך ל-סקין פייד ב-29.05 בשעה 10:00 אושר", type: "booking_confirmed", is_read: false, created_date: "2026-05-29T08:00:00" },
  { id: "n2", title: "תזכורת לתור 📅", message: "מחר יש לך תור בשעה 11:00 לתספורת + זקן", type: "booking_reminder", is_read: false, created_date: "2026-05-28T18:00:00" },
  { id: "n3", title: "תגובה לביקורת שלך 💬", message: "OST הגיב על הביקורת שלך: תודה רבה! שמח שנהנית 🙏", type: "review_reply", is_read: true, created_date: "2026-05-25T14:00:00" },
  { id: "n4", title: "מקום פנוי! 🎉", message: "מקום פנוי ל-29.05 בשעה 15:00 - לחץ לתפוס מקום", type: "waiting_list", is_read: true, created_date: "2026-05-24T10:00:00" },
];

export const ADMIN_PHONE = "054-2244542";

export const isOpenNow = () => {
  const now = new Date();
  const day = now.getDay();
  const hours = BUSINESS_INFO.hours;
  const todayHours = hours[day];
  if (!todayHours || !todayHours.is_open) return false;
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return currentTime >= todayHours.open && currentTime <= todayHours.close;
};
