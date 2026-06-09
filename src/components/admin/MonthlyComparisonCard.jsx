import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Calendar, DollarSign } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

const thisMonthData = [
  { day: '1', rev: 350 }, { day: '5', rev: 520 }, { day: '10', rev: 680 },
  { day: '15', rev: 890 }, { day: '20', rev: 1100 }, { day: '25', rev: 1380 },
  { day: '29', rev: 1600 },
];

const THIS_MONTH = { revenue: 7100, appointments: 94 };
const LAST_MONTH = { revenue: 5800, appointments: 78 };

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

export default function MonthlyComparisonCard() {
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
                <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 8, color: '#fff', fontSize: 11 }}
              formatter={(v) => [`₪${v}`, 'הכנסה']}
            />
            <Area type="monotone" dataKey="rev" stroke="#D4AF37" strokeWidth={2} fill="url(#goldGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Comparison rows */}
      <div className="grid grid-cols-2 gap-3">
        {/* Revenue */}
        <div className="dark-card rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">הכנסות</span>
          </div>
          <div className="text-xl font-black text-primary">₪{THIS_MONTH.revenue.toLocaleString()}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">vs ₪{LAST_MONTH.revenue.toLocaleString()}</span>
            <GrowthBadge current={THIS_MONTH.revenue} previous={LAST_MONTH.revenue} />
          </div>
        </div>
        {/* Appointments */}
        <div className="dark-card rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-muted-foreground">תורים</span>
          </div>
          <div className="text-xl font-black text-blue-400">{THIS_MONTH.appointments}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">vs {LAST_MONTH.appointments}</span>
            <GrowthBadge current={THIS_MONTH.appointments} previous={LAST_MONTH.appointments} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}