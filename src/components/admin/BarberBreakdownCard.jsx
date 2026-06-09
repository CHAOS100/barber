import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Scissors, TrendingUp } from 'lucide-react';
import { base44 } from '../../api/base44Client';

const AVATAR_COLORS = ['#D4AF37', '#C9A84C', '#F0D060', '#B8960C', '#E8C84A'];

export default function BarberBreakdownCard() {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const { data: barbers = [] } = useQuery({
    queryKey: ['barbers-active'],
    queryFn: () => base44.entities.Barber.filter({ is_active: true }, 'sort_order'),
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments-barber-breakdown'],
    queryFn: () => base44.entities.Appointment.list('-date', 200),
  });

  const thisMonthAppts = appointments.filter(a =>
    a.date?.startsWith(thisMonth) && a.status !== 'cancelled' && a.status !== 'no_show'
  );
  const lastMonthAppts = appointments.filter(a =>
    a.date?.startsWith(lastMonth) && a.status !== 'cancelled' && a.status !== 'no_show'
  );

  // Group by barber_name (fallback to 'ללא שיוך' if none)
  const buildStats = (appts) => {
    const map = {};
    appts.forEach(a => {
      const key = a.barber_name || 'ללא העדפה';
      if (!map[key]) map[key] = { name: key, count: 0, revenue: 0 };
      map[key].count += 1;
      map[key].revenue += a.service_price || 0;
    });
    return map;
  };

  const thisStats = buildStats(thisMonthAppts);
  const lastStats = buildStats(lastMonthAppts);

  // Merge all barber names
  const allNames = Array.from(new Set([...Object.keys(thisStats), ...Object.keys(lastStats)]));

  // Also add active barbers with no appointments yet
  barbers.forEach(b => { if (!allNames.includes(b.name)) allNames.push(b.name); });

  const rows = allNames.map((name, i) => {
    const cur = thisStats[name] || { count: 0, revenue: 0 };
    const prev = lastStats[name] || { count: 0, revenue: 0 };
    const revGrowth = prev.revenue > 0 ? Math.round(((cur.revenue - prev.revenue) / prev.revenue) * 100) : null;
    return { name, ...cur, revGrowth, color: AVATAR_COLORS[i % AVATAR_COLORS.length] };
  }).sort((a, b) => b.revenue - a.revenue);

  const maxRevenue = Math.max(...rows.map(r => r.revenue), 1);

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Scissors className="w-4 h-4 text-primary" />
        <h3 className="font-bold">ביצועי ספרים — חודש זה</h3>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-4">אין נתונים להצגה</p>
      ) : (
        <div className="space-y-4">
          {rows.map((barber, i) => (
            <motion.div
              key={barber.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <div className="flex items-center gap-3 mb-1.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-black font-black text-sm flex-shrink-0"
                  style={{ background: barber.color }}
                >
                  {barber.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm truncate">{barber.name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-primary font-black text-sm">₪{barber.revenue.toLocaleString()}</span>
                      {barber.revGrowth !== null && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${barber.revGrowth >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {barber.revGrowth >= 0 ? '+' : ''}{barber.revGrowth}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-muted-foreground text-xs">{barber.count} תורים</div>
                </div>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(barber.revenue / maxRevenue) * 100}%` }}
                  transition={{ delay: 0.2 + i * 0.07, duration: 0.7 }}
                  className="h-full rounded-full"
                  style={{ background: barber.color }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border flex justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> % שינוי מחודש שעבר
        </span>
        <span>סה"כ: ₪{rows.reduce((s, r) => s + r.revenue, 0).toLocaleString()}</span>
      </div>
    </div>
  );
}