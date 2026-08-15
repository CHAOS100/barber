import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Calendar, Wallet } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { buildMonthlyStats, isDeletedAppointment, revenueFor } from '@/lib/dashboardStats';
import { formatILS } from '@/lib/formatters';

function GrowthBadge({ current, previous, prefix = '' }) {
  const pct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
  const isUp = pct >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${isUp ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
      <Icon className="w-3 h-3" />
      {isUp ? '+' : ''}{pct}%
    </span>
  );
}

export default function MonthlyComparisonCard({ appointments = [] }) {
  const monthly = buildMonthlyStats(appointments, new Date(), 2);
  const lastMonth = monthly[0] || { key: '', revenue: 0, appointments: 0 };
  const thisMonth = monthly[1] || { key: '', revenue: 0, appointments: 0 };
  const thisMonthData = appointments
    .filter((item) => String(item.date || '').startsWith(thisMonth.key) && !isDeletedAppointment(item))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .map((item) => ({
      day: String(item.date || '').slice(-2),
      rev: revenueFor(item),
    }));
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-4 mb-4"
    >
      <h3 className="font-bold mb-3 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        חודש זה מול החודש שעבר
      </h3>

      {/* Mini sparkline */}
      <div className="h-16 mb-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={thisMonthData}>
            <defs>
              <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#93E3BD" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#93E3BD" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              contentStyle={{ background: '#161616', border: '1px solid rgba(147,227,189,0.3)', borderRadius: 8, color: '#fff', fontSize: 11 }}
              formatter={(v) => [formatILS(v), 'הכנסה']}
            />
            <Area type="monotone" dataKey="rev" stroke="#93E3BD" strokeWidth={2} fill="url(#goldGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Comparison rows */}
      <div className="grid grid-cols-2 gap-3">
        {/* Revenue */}
        <div className="dark-card rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">הכנסות</span>
          </div>
          <div className="text-xl font-black text-primary">{formatILS(thisMonth.revenue)}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">vs {formatILS(lastMonth.revenue)}</span>
            <GrowthBadge current={thisMonth.revenue} previous={lastMonth.revenue} />
          </div>
        </div>
        {/* Appointments */}
        <div className="dark-card rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">תורים</span>
          </div>
          <div className="text-xl font-black text-primary">{thisMonth.appointments}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">vs {lastMonth.appointments}</span>
            <GrowthBadge current={thisMonth.appointments} previous={lastMonth.appointments} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
