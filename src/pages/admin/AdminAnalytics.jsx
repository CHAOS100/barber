import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, Users, Wallet, Clock } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAdminAppointmentsRealtime } from '@/hooks/useAppointmentsRealtime';
import { useCustomerProfilesRealtime } from '@/hooks/useCustomerProfilesRealtime';
import {
  buildMonthlyStats,
  buildPeakHours,
  buildServiceUsage,
  calculateAdminStats,
} from '@/lib/dashboardStats';
import { formatILS } from '@/lib/formatters';

const GOLD_COLORS = ['#93E3BD', '#78D2AA', '#C5F6DE', '#63B991', '#A9ECCA'];

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('6m');
  const { isAdmin } = useCurrentUser();
  const { appointments } = useAdminAppointmentsRealtime(isAdmin);
  const { customers } = useCustomerProfilesRealtime(isAdmin);

  const periodCount = period === '1m' ? 1 : period === '3m' ? 3 : 6;
  const monthlyData = useMemo(() => buildMonthlyStats(appointments, new Date(), periodCount), [appointments, periodCount]);
  const peakHours = useMemo(() => buildPeakHours(appointments), [appointments]);
  const servicesPie = useMemo(() => buildServiceUsage(appointments), [appointments]);
  const stats = useMemo(() => calculateAdminStats(appointments, customers, [], []), [appointments, customers]);
  const currentMonth = monthlyData[monthlyData.length - 1] || { revenue: 0, appointments: 0, totalBookings: 0, customers: 0, cancellations: 0 };
  const cancellationRate = currentMonth.totalBookings
    ? Math.round((currentMonth.cancellations / currentMonth.totalBookings) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky-top-safe z-[var(--z-sticky-nav)] glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="icon-btn press-scale -mr-2" aria-label="חזרה לניהול"><ArrowRight className="w-6 h-6" /></button>
        <h1 className="font-black text-lg">אנליטיקה</h1>
        <div className="mr-auto flex gap-1 glass rounded-xl p-1">
          {['1m', '3m', '6m'].map((value) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${period === value ? 'gold-gradient text-black' : 'text-muted-foreground'}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Wallet, label: 'הכנסות החודש', value: formatILS(currentMonth.revenue) },
            { icon: Users, label: 'לקוחות אמיתיים', value: stats.customersCount },
            { icon: TrendingUp, label: 'תורים החודש', value: currentMonth.appointments },
            { icon: Clock, label: 'שיעור ביטול', value: `${cancellationRate}%` },
          ].map((kpi, index) => {
            const Icon = kpi.icon;
            return (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="glass-gold rounded-2xl p-4"
              >
                <Icon className="w-5 h-5 text-primary mb-2" />
                <div className="text-xl font-black">{kpi.value}</div>
                <div className="text-muted-foreground text-xs">{kpi.label}</div>
              </motion.div>
            );
          })}
        </div>

        <div className="glass rounded-2xl p-4">
          <h3 className="font-bold mb-3">הכנסות חודשיות</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="goldGradAnalytics" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#93E3BD" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#93E3BD" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis hide />
              <Tooltip formatter={(value) => [formatILS(value), 'הכנסות']} />
              <Area type="monotone" dataKey="revenue" stroke="#93E3BD" strokeWidth={2} fill="url(#goldGradAnalytics)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass rounded-2xl p-4">
          <h3 className="font-bold mb-3">שעות עומס</h3>
          {peakHours.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">אין עדיין תורים לניתוח</div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={peakHours} barCategoryGap="20%">
                <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 10 }} />
                <YAxis hide />
                <Tooltip formatter={(value) => [value, 'תורים']} />
                <Bar dataKey="count" fill="#93E3BD" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass rounded-2xl p-4">
          <h3 className="font-bold mb-3">שימוש בשירותים</h3>
          {servicesPie.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">אין עדיין נתוני שימוש בשירותים</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={servicesPie} innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {servicesPie.map((entry, index) => <Cell key={entry.name} fill={GOLD_COLORS[index % GOLD_COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {servicesPie.map((service, index) => (
                  <div key={service.name} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ background: GOLD_COLORS[index % GOLD_COLORS.length] }} />
                    <span className="flex-1 text-muted-foreground truncate">{service.name}</span>
                    <span className="font-bold">{service.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-4">
          <h3 className="font-bold mb-3">מגמות לאורך זמן</h3>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={monthlyData}>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis hide />
              <Tooltip />
              <Line type="monotone" dataKey="appointments" stroke="#93E3BD" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="customers" stroke="#78D2AA" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
