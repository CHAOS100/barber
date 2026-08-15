export const EMPTY_BUSINESS_INFO = Object.freeze({
  name: '',
  address: '',
  phone: '',
  whatsapp: '',
  description: '',
  instagram: '',
  waze: '',
  welcomeText: '',
});

export const isOpenNow = (workingHours = [], now = new Date()) => {
  const todayHours = workingHours.find((day) => Number(day.day_of_week) === now.getDay());
  if (!todayHours?.is_open || !todayHours.open_time || !todayHours.close_time) return false;
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return currentTime >= todayHours.open_time && currentTime < todayHours.close_time;
};
