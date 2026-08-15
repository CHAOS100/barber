const clean = (value) => String(value || '').trim();

export const getServiceCategory = (service) => clean(service?.category) || 'שירותים';

export const groupServicesByCategory = (services = []) => {
  const groups = new Map();
  services.forEach((service) => {
    const category = getServiceCategory(service);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(service);
  });

  return [...groups.entries()].map(([category, items]) => ({
    category,
    services: [...items].sort((left, right) => (
      Number(left.sort_order ?? left.sortOrder ?? 0) - Number(right.sort_order ?? right.sortOrder ?? 0)
      || clean(left.name).localeCompare(clean(right.name), 'he')
    )),
  }));
};
