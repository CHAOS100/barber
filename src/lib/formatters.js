const ilsFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const formatILS = (value) => {
  const amount = Number(value);
  return ilsFormatter.format(Number.isFinite(amount) ? amount : 0);
};
