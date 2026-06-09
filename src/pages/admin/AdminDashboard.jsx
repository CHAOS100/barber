import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, TrendingUp, Users, DollarSign, Clock, AlertTriangle, ChevronLeft, Scissors, BarChart3, Settings } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { BARBER_PHOTO } from '../../lib/mockData';
import { useAdminAppointmentsRealtime } from '@/hooks/useAppointmentsRealtime';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import MonthlyComparisonCard from '../../components/admin/MonthlyComparisonCard';
import BarberBreakdownCard from '../../components/admin/BarberBreakdownCard';
import DailyCalendarView from '../../components/admin/DailyCalendarView';
import WaitingListCard from '../../components/admin/WaitingListCard';
import { localDateToString } from '../../lib/slotEngine';

const weeklyData = [
  { day: 'א', appointments: 6, revenue: 420 },
  { day: 'ב', appointments: 8, revenue: 560 },
  { day: 'ג', appointments: 5, revenue: 350 },
  { day: 'ד', appointments: 9, revenue: 630 },
  { day: 'ה', appointments: 12, revenue: 840 },
  { day: 'ו', appointments: 7, revenue: 490 },
];

const monthlyRevenue = [
  { month: 'ינו', revenue: 4200 },
  { month: 'פבר', revenue: 5100 },
  { month: 'מרץ', revenue: 4800 },
  { month: 'אפר', revenue: 6200 },
  { month: 'מאי', revenue: 5800 },
  { month: 'יוני', revenue: 7100 },
];

const popularServices = [
  { name: 'סקין פייד', count: 45, color: '#D4AF37' },
  { name: 'תספורת + זקן', count: 32, color: '#C9A84C' },
  { name: 'חבילת פרימיום', count: 18, color: '#F0D060' },
  { name: 'עיצוב זקן', count: 25, color: '#B8960C' },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useCurrentUser();
  const { appointments, error: appointmentsError } = useAdminAppointmentsRealtime(isAdmin);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6" dir="rtl">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-2xl font-black mb-2">גישה נדחתה</h2>
          <p className="text-muted-foreground">אין לך הרשאות ניהול</p>
        </div>
      </div>
    );
  }

  const todayAppts = appointments.filter(a => a.date === localDateToString());
  const todayRevenue = todayAppts.reduce((s, a) => s + (a.service_price || 0), 0);
  const pendingAppts = appointments.filter(a => a.status === 'pending');

  const adminSections = [
    { icon: Calendar, label: 'ניהול תורים', path: '/admin/appointments', desc: `${todayAppts.length} תורים היום` },
    { icon: Scissors, label: 'שירותים', path: '/admin/services', desc: '6 שירותים פעילים' },
    { icon: Users, label: 'לקוחות', path: '/admin/customers', desc: '115+ לקוחות' },
    { icon: BarChart3, label: 'אנליטיקה', path: '/admin/analytics', desc: 'דוחות מפורטים' },
    { icon: Clock, label: 'שעות עבודה', path: '/admin/hours', desc: 'ניהול לוח זמנים' },
    { icon: Settings, label: 'הגדרות', path: '/admin/settings', desc: 'הגדרות עסק' },
  ];

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      {/* Header */}
      <div className="relative px-4 pt-12 pb-8 overflow-hidden">
        <div className="absolute inset-0 gold-gradient opacity-5" />
        <div className="relative flex items-center gap-4">
          <img src={BARBER_PHOTO} alt="OST" className="w-14 h-14 rounded-xl object-cover border border-primary" />
          <div>
            <h1 className="text-2xl font-black">לוח ניהול</h1>
            <p className="text-primary text-sm font-medium">OST BARBER</p>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {appointmentsError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
            לא ניתן לקרוא תורים מ-Firestore. ודא שהמשתמש מחובר ל-Firebase ומופיע באוסף admins.
          </div>
        )}

        {/* Today Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Calendar, label: 'תורים היום', value: todayAppts.length, color: 'text-blue-400', bg: 'bg-blue-400/20' },
            { icon: DollarSign, label: 'הכנסות היום', value: `₪${todayRevenue}`, color: 'text-primary', bg: 'bg-primary/20' },
            { icon: Users, label: 'ממתינים לאישור', value: pendingAppts.length, color: 'text-green-400', bg: 'bg-green-400/20' },
            { icon: TrendingUp, label: 'חודש זה', value: '₪7,100', color: 'text-purple-400', bg: 'bg-purple-400/20' },
          ].map((stat, i) => {
            const StatIcon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="dark-card rounded-2xl p-4"
              >
                <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center mb-2`}>
                  <StatIcon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
                <div className="text-muted-foreground text-xs mt-0.5">{stat.label}</div>
              </motion.div>
            );
          })}
        </div>

        {/* Monthly Comparison */}
        <MonthlyComparisonCard />

        {/* Weekly Chart */}
        <div className="glass rounded-2xl p-4">
          <h3 className="font-bold mb-3">תורים שבועיים</h3>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={weeklyData} barCategoryGap="30%">
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 12 }} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 12, color: '#fff' }}
                cursor={{ fill: 'rgba(212,175,55,0.1)' }}
              />
              <Bar dataKey="appointments" fill="#D4AF37" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Popular Services */}
        <div className="glass rounded-2xl p-4">
          <h3 className="font-bold mb-3">שירותים פופולריים</h3>
          <div className="space-y-3">
            {popularServices.map((service) => {
              const maxCount = Math.max(...popularServices.map(s => s.count));
              const pct = (service.count / maxCount) * 100;
              return (
                <div key={service.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{service.name}</span>
                    <span className="font-bold text-foreground">{service.count}</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.3, duration: 0.8 }}
                      className="h-full gold-gradient rounded-full"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Waiting List */}
        <WaitingListCard />

        {/* Barber Breakdown */}
        <BarberBreakdownCard />

        {/* Daily Calendar View */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold">לוח יומי</h3>
            <button onClick={() => navigate('/admin/appointments')} className="text-primary text-sm flex items-center gap-1">
              ניהול תורים <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <DailyCalendarView appointments={appointments} />
        </div>

        {/* Pending Appointments */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold">ממתינים לאישור</h3>
            <button onClick={() => navigate('/admin/appointments')} className="text-primary text-sm flex items-center gap-1">
              ניהול תורים <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          {pendingAppts.length === 0 ? (
            <div className="glass rounded-xl p-4 text-center text-muted-foreground text-sm">
              אין תורים שממתינים לאישור
            </div>
          ) : (
            <div className="space-y-2">
              {pendingAppts.slice(0, 5).map((appt, i) => (
                <motion.div
                  key={appt.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="dark-card rounded-xl p-3 flex items-center gap-3"
                >
                  <div className="w-10 h-10 bg-yellow-400/20 rounded-full flex items-center justify-center text-yellow-400 font-bold text-sm flex-shrink-0">
                    {appt.customer_name?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{appt.customer_name}</div>
                    <div className="text-muted-foreground text-xs truncate">
                      {appt.service_name} • {appt.date} • {appt.time}
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-full text-yellow-400 bg-yellow-400/20">
                    ממתין
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Today's Appointments */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold">תורים להיום</h3>
            <button onClick={() => navigate('/admin/appointments')} className="text-primary text-sm flex items-center gap-1">
              הכל <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            {todayAppts.map((appt, i) => (
              <motion.div
                key={appt.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="dark-card rounded-xl p-3 flex items-center gap-3"
              >
                <div className="w-10 h-10 gold-gradient rounded-full flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
                  {appt.customer_name[0]}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm">{appt.customer_name}</div>
                  <div className="text-muted-foreground text-xs">{appt.service_name} • {appt.time}</div>
                </div>
                <div className="text-right">
                  <div className="text-primary font-black text-sm">₪{appt.service_price}</div>
                  <div className={`text-xs ${appt.status === 'confirmed' ? 'text-green-400' : 'text-yellow-400'}`}>
                    {appt.status === 'confirmed' ? 'מאושר' : 'ממתין'}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Admin Sections */}
        <div className="grid grid-cols-2 gap-3 pb-4">
          {adminSections.map((section, i) => {
            const SectionIcon = section.icon;
            return (
              <motion.button
                key={section.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => navigate(section.path)}
                className="dark-card rounded-2xl p-4 text-right"
              >
                <div className="w-10 h-10 glass-gold rounded-xl flex items-center justify-center mb-2">
                  <SectionIcon className="w-5 h-5 text-primary" />
                </div>
                <div className="font-bold text-sm">{section.label}</div>
                <div className="text-muted-foreground text-xs mt-0.5">{section.desc}</div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
