import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, TrendingDown, Users, DollarSign, Clock } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';

const monthlyData = [
  { month: 'ינו', revenue: 4200, appointments: 56, customers: 42 },
  { month: 'פבר', revenue: 5100, appointments: 68, customers: 51 },
  { month: 'מרץ', revenue: 4800, appointments: 64, customers: 48 },
  { month: 'אפר', revenue: 6200, appointments: 82, customers: 63 },
  { month: 'מאי', revenue: 5800, appointments: 77, customers: 58 },
  { month: 'יוני', revenue: 7100, appointments: 94, customers: 72 },
];

const peakHours = [
  { hour: '9', count: 4 }, { hour: '10', count: 8 }, { hour: '11', count: 10 },
  { hour: '12', count: 6 }, { hour: '13', count: 3 }, { hour: '14', count: 9 },
  { hour: '15', count: 12 }, { hour: '16', count: 11 }, { hour: '17', count: 8 },
  { hour: '18', count: 7 }, { hour: '19', count: 5 },
];

const servicesPie = [
  { name: 'סקין פייד', value: 38, color: '#D4AF37' },
  { name: 'תספורת + זקן', value: 27, color: '#C9A84C' },
  { name: 'עיצוב זקן', value: 21, color: '#F0D060' },
  { name: 'חבילת פרימיום', value: 14, color: '#B8960C' },
];

const GOLD_COLORS = ['#D4AF37', '#C9A84C', '#F0D060', '#B8960C'];

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('6m');

  const currentMonth = monthlyData[monthlyData.length - 1];
  const prevMonth = monthlyData[monthlyData.length - 2];
  const revenueGrowth = (((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="press-scale">
          <ArrowRight className="w-6 h-6" />
        </button>
        <h1 className="font-black text-lg">אנליטיקה</h1>
        <div className="mr-auto flex gap-1 glass rounded-xl p-1">
          {['1m', '3m', '6m'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${period === p ? 'gold-gradient text-black' : 'text-muted-foreground'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: DollarSign, label: 'הכנסות חודשיות', value: `₪${currentMonth.revenue.toLocaleString()}`, change: revenueGrowth, positive: true },
            { icon: Users, label: 'לקוחות חודשיים', value: currentMonth.customers, change: '+12%', positive: true },
            { icon: TrendingUp, label: 'תורים חודשיים', value: currentMonth.appointments, change: '+22%', positive: true },
            { icon: Clock, label: 'שיעור ביטול', value: '4.2%', change: '-1.1%', positive: true },
          ].map((kpi, i) => {
            const KpiIcon = kpi.icon;
            return (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-gold rounded-2xl p-4"
              >
                <KpiIcon className="w-5 h-5 text-primary mb-2" />
                <div className="text-xl font-black text-foreground">{kpi.value}</div>
                <div className="text-muted-foreground text-xs">{kpi.label}</div>
                <div className={`flex items-center gap-1 mt-1 text-xs font-bold ${kpi.positive ? 'text-green-400' : 'text-red-400'}`}>
                  {kpi.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {kpi.change}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Revenue Chart */}
        <div className="glass rounded-2xl p-4">
          <h3 className="font-bold mb-3">הכנסות חודשיות</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 12, color: '#fff' }}
                formatter={(v) => [`₪${v}`, 'הכנסות']}
              />
              <Area type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={2} fill="url(#goldGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Peak Hours */}
        <div className="glass rounded-2xl p-4">
          <h3 className="font-bold mb-3">שעות עומס</h3>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={peakHours} barCategoryGap="20%">
              <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 12, color: '#fff' }}
                formatter={(v) => [v, 'תורים']}
              />
              <Bar dataKey="count" fill="#D4AF37" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Services Pie */}
        <div className="glass rounded-2xl p-4">
          <h3 className="font-bold mb-3">פילוח שירותים</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={servicesPie} innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                  {servicesPie.map((entry, index) => (
                    <Cell key={index} fill={GOLD_COLORS[index % GOLD_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {servicesPie.map((service, i) => (
                <div key={service.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: GOLD_COLORS[i] }} />
                  <div className="flex-1 flex justify-between text-xs">
                    <span className="text-muted-foreground truncate">{service.name}</span>
                    <span className="font-bold text-foreground">{service.value}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Trends */}
        <div className="glass rounded-2xl p-4">
          <h3 className="font-bold mb-3">מגמות לאורך זמן</h3>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={monthlyData}>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 12, color: '#fff' }}
              />
              <Line type="monotone" dataKey="appointments" stroke="#D4AF37" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="customers" stroke="#60a5fa" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-1 rounded-full bg-primary" />
              <span className="text-muted-foreground">תורים</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-1 rounded-full bg-blue-400" />
              <span className="text-muted-foreground">לקוחות</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}