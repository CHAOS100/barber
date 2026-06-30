export const isBarberBookable = (barber) =>
  barber?.archived !== true
  && barber?.active !== false
  && barber?.is_active !== false;
