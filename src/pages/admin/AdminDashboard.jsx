import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, TrendingUp, Users, Wallet, Clock, AlertTriangle, Ban, Bell, ChevronLeft, CreditCard, Scissors, BarChart3, Settings, UserRoundCog, Star, Image, Eye, MessageSquareText, ListChecks } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useAdminAppointmentsRealtime } from '@/hooks/useAppointmentsRealtime';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import MonthlyComparisonCard from '../../components/admin/MonthlyComparisonCard';
import BarberBreakdownCard from '../../components/admin/BarberBreakdownCard';
import DailyCalendarView from '../../components/admin/DailyCalendarView';
import { updateAdminAppointment } from '@/lib/appointmentsFirestore';
import { toast } from '@/components/ui/use-toast';
import { DATA_LOAD_ERROR_MESSAGE, getUserFacingErrorMessage } from '@/lib/userFacingErrors';
import { useAllServicesRealtime } from '@/hooks/useBookingData';
import { useAdminReviewsRealtime } from '@/hooks/useReviewsRealtime';
import { useCustomerProfilesRealtime } from '@/hooks/useCustomerProfilesRealtime';
import { buildServiceUsage, buildWeeklyAppointments, calculateAdminStats } from '@/lib/dashboardStats';
import { isCriticalCustomerNotification, subscribeToAdminCustomerNotifications } from '@/lib/customerNotificationsFirestore';
import { BUSINESS_BRAND_IMAGE_SRC } from '@/lib/brandAssets';
import {
  getEffectiveAppointmentStatus,
  isAppointmentActiveForSchedule,
  localDateToString,
} from '@/lib/appointmentStatus';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin, enterAdminPreview } = useCurrentUser();
  const { appointments, error: appointmentsError } = useAdminAppointmentsRealtime(isAdmin);
  const { data: services } = useAllServicesRealtime();
  const { reviews } = useAdminReviewsRealtime(isAdmin);
  const { customers } = useCustomerProfilesRealtime(isAdmin);
  const [moveError, setMoveError] = React.useState('');
  const [customerNotifications, setCustomerNotifications] = React.useState([]);
  const stats = React.useMemo(
    () => calculateAdminStats(appointments, customers, services, reviews),
    [appointments, customers, services, reviews],
  );
  const weeklyData = React.useMemo(() => buildWeeklyAppointments(appointments), [appointments]);
  const popularServices = React.useMemo(() => buildServiceUsage(appointments), [appointments]);
  const unreadCriticalNotificationsCount = React.useMemo(() => (
    customerNotifications.filter((notification) => (
      !notification.isRead && isCriticalCustomerNotification(notification)
    )).length
  ), [customerNotifications]);

  React.useEffect(() => {
    if (!isAdmin) {
      setCustomerNotifications([]);
      return undefined;
    }

    return subscribeToAdminCustomerNotifications(
      setCustomerNotifications,
      (error) => {
        console.warn('[Firestore] Admin customer notification stats listener failed', JSON.stringify({
          code: error?.code || 'unknown',
          message: error?.message || 'Unknown notification stats listener error',
        }));
        setCustomerNotifications([]);
      },
    );
  }, [isAdmin]);

  const moveAppointment = async (appointment, startTime) => {
    setMoveError('');
    try {
      await updateAdminAppointment(appointment.id, { startTime });
      toast({ title: 'התור הוזז', description: `השעה החדשה: ${startTime}` });
    } catch (error) {
      setMoveError(error?.code === 'functions/already-exists'
        ? 'לא ניתן להזיז את התור: השעה החדשה חופפת לתור אחר.'
        : 'הזזת התור נכשלה.');
      toast({ variant: 'destructive', title: 'הזזת התור נכשלה', description: getUserFacingErrorMessage(error) });
    }
  };

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

  const now = new Date();
  const today = localDateToString(now);
  const activeAppointments = appointments.filter((appointment) =>
    isAppointmentActiveForSchedule(appointment, now));
  const todayAppts = activeAppointments.filter((appointment) => appointment.date === today);
  const pendingAppts = activeAppointments.filter((appointment) =>
    getEffectiveAppointmentStatus(appointment, now) === 'pending');

  const adminSections = [
    { icon: Calendar, label: 'ניהול תורים', path: '/admin/appointments', desc: `${todayAppts.length} תורים היום` },
    { icon: Scissors, label: 'שירותים', path: '/admin/services', desc: `${services.length} שירותים` },
    { icon: UserRoundCog, label: 'ספרים / צוות', path: '/admin/barbers', desc: 'הוספה וניהול ספרים' },
    { icon: Users, label: 'לקוחות', path: '/admin/customers', desc: `${customers.length} לקוחות` },
    { icon: Star, label: 'ביקורות', path: '/admin/reviews', desc: `${reviews.length} ביקורות` },
    { icon: ListChecks, label: 'רשימת המתנה', path: '/admin/waiting-list', desc: 'לקוחות שמחכים לתור שהתפנה' },
    { icon: MessageSquareText, label: 'הודעות', path: '/admin/messages', desc: 'מעקב אחרי הודעות Push' },
    { icon: Image, label: 'ניהול תמונות', path: '/admin/gallery', desc: 'גלריה, עסק, צוות ושירותים' },
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
          <img
            src={BUSINESS_BRAND_IMAGE_SRC}
            alt="OST BARBER"
            className="w-14 h-14 rounded-xl border border-primary object-cover flex-shrink-0"
          />
          <div>
            <h1 className="text-2xl font-black">לוח ניהול</h1>
            <p className="text-primary text-sm font-medium">OST BARBER</p>
          </div>
          <button
            onClick={() => {
              enterAdminPreview();
              navigate('/');
            }}
            className="mr-auto glass-gold px-3 py-2 rounded-xl text-primary text-xs font-bold flex items-center gap-1"
          >
            <Eye className="w-4 h-4" />
            צפייה כצד לקוח
          </button>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {appointmentsError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
            {DATA_LOAD_ERROR_MESSAGE}
          </div>
        )}
        {moveError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
            {moveError}
          </div>
        )}

        {/* Today Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Calendar, label: 'תורים היום', value: stats.todayAppointments, color: 'text-primary', bg: 'bg-primary/20' },
            { icon: Wallet, label: 'הכנסות היום', value: `₪${stats.todayRevenue.toLocaleString()}`, color: 'text-primary', bg: 'bg-primary/20' },
            { icon: Users, label: 'ממתינים לאישור', value: stats.pendingAppointments, color: 'text-yellow-400', bg: 'bg-yellow-400/20' },
            { icon: TrendingUp, label: 'הכנסות החודש', value: `₪${stats.monthRevenue.toLocaleString()}`, color: 'text-purple-400', bg: 'bg-purple-400/20' },
            { icon: Calendar, label: 'מאושרים', value: stats.approvedAppointments, color: 'text-green-400', bg: 'bg-green-400/20' },
            { icon: Calendar, label: 'הושלמו', value: stats.completedAppointments, color: 'text-primary', bg: 'bg-primary/20' },
            { icon: Calendar, label: 'בוטלו', value: stats.cancelledAppointments, color: 'text-red-400', bg: 'bg-red-400/20' },
            { icon: AlertTriangle, label: 'לא הגיעו', value: stats.noShowAppointments, color: 'text-orange-400', bg: 'bg-orange-400/20' },
            { icon: AlertTriangle, label: 'אזהרות לקוחות', value: stats.warningCount, color: 'text-yellow-400', bg: 'bg-yellow-400/20', filter: 'warning' },
            { icon: Ban, label: 'לקוחות חסומים', value: stats.blockedCustomersCount, color: 'text-red-400', bg: 'bg-red-400/20', filter: 'blocked' },
            { icon: CreditCard, label: 'דרישות תשלום פעילות', value: stats.paymentRequiredCustomersCount, color: 'text-yellow-300', bg: 'bg-yellow-400/20', filter: 'payment' },
            { icon: AlertTriangle, label: 'אי־הגעות לקוחות', value: stats.customerNoShowCount, color: 'text-orange-300', bg: 'bg-orange-400/20', filter: 'no_show' },
            { icon: Bell, label: 'קריטיות שלא נקראו', value: unreadCriticalNotificationsCount, color: 'text-primary', bg: 'bg-primary/20' },
          ].map((stat, i) => {
            const StatIcon = stat.icon;
            return (
              <motion.button
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => stat.filter && navigate('/admin/customers', { state: { filter: stat.filter } })}
                className={`dark-card rounded-2xl p-4 text-right ${stat.filter ? 'press-scale cursor-pointer' : 'cursor-default'}`}
              >
                <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center mb-2`}>
                  <StatIcon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
                <div className="text-muted-foreground text-xs mt-0.5">{stat.label}</div>
              </motion.button>
            );
          })}
        </div>

        {/* Monthly Comparison */}
        <MonthlyComparisonCard appointments={appointments} />

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
              <Bar dataKey="appointments" fill="#93E3BD" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Popular Services */}
        <div className="glass rounded-2xl p-4">
          <h3 className="font-bold mb-3">שירותים פופולריים</h3>
          <div className="space-y-3">
            {popularServices.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-4">אין עדיין נתוני שימוש בשירותים</div>
            ) : popularServices.map((service) => {
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

        {/* Barber Breakdown */}
        <BarberBreakdownCard appointments={appointments} />

        {/* Daily Calendar View */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold">לוח יומי</h3>
            <button onClick={() => navigate('/admin/appointments')} className="text-primary text-sm flex items-center gap-1">
              ניהול תורים <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <DailyCalendarView appointments={activeAppointments} onMove={moveAppointment} />
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
            {todayAppts.length === 0 ? (
              <div className="glass rounded-xl p-4 text-center text-muted-foreground text-sm">
                אין תורים להיום
              </div>
            ) : todayAppts.map((appt, i) => (
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
