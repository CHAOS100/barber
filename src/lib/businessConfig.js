import barberPhoto from '@/assets/barber-original.jpg';

export const BARBER_PHOTO = barberPhoto;

export const BUSINESS_INFO = {
  name: 'OST BARBER',
  address: 'השומר 55, ראשון לציון',
  phone: '054-2244542',
  whatsapp: '+972542244542',
  description: 'ספר פרימיום המתמחה בפייד, תספורות מודרניות, עיצוב זקן ועיצוב שיער.',
  instagram: 'https://instagram.com/ostbarber',
  waze: 'https://waze.com/ul?q=השומר+55+ראשון+לציון',
  hours: [
    { day: 'ראשון', open: '09:00', close: '20:00', is_open: true },
    { day: 'שני', open: '09:00', close: '20:00', is_open: true },
    { day: 'שלישי', open: '09:00', close: '20:00', is_open: true },
    { day: 'רביעי', open: '09:00', close: '20:00', is_open: true },
    { day: 'חמישי', open: '09:00', close: '21:00', is_open: true },
    { day: 'שישי', open: '09:00', close: '15:00', is_open: true },
    { day: 'שבת', open: null, close: null, is_open: false },
  ],
};

export const isOpenNow = () => {
  const now = new Date();
  const todayHours = BUSINESS_INFO.hours[now.getDay()];
  if (!todayHours?.is_open) return false;
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return currentTime >= todayHours.open && currentTime <= todayHours.close;
};
