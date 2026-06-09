import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Bell, Calendar, Star, AlertTriangle, List } from 'lucide-react';
import { MOCK_NOTIFICATIONS } from '../lib/mockData';

const TYPE_CONFIG = {
  booking_confirmed: { icon: Calendar, color: 'text-green-400', bg: 'bg-green-400/20' },
  booking_cancelled: { icon: Calendar, color: 'text-red-400', bg: 'bg-red-400/20' },
  booking_reminder: { icon: Calendar, color: 'text-blue-400', bg: 'bg-blue-400/20' },
  waiting_list: { icon: List, color: 'text-primary', bg: 'bg-primary/20' },
  review_reply: { icon: Star, color: 'text-yellow-400', bg: 'bg-yellow-400/20' },
  warning: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-400/20' },
  general: { icon: Bell, color: 'text-muted-foreground', bg: 'bg-muted' },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `לפני ${mins} דק'`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע'`;
  return `לפני ${Math.floor(hours / 24)} ימים`;
}

export default function Notifications() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="press-scale">
          <ArrowRight className="w-6 h-6" />
        </button>
        <h1 className="font-black text-lg">התראות</h1>
        <span className="mr-auto glass-gold text-primary text-xs font-bold px-2 py-1 rounded-full">
          {MOCK_NOTIFICATIONS.filter(n => !n.is_read).length} חדשות
        </span>
      </div>

      <div className="px-4 py-4 space-y-3">
        {MOCK_NOTIFICATIONS.map((notif, i) => {
          const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.general;
          const IconComp = config.icon;
          return (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`dark-card rounded-2xl p-4 flex gap-3 ${!notif.is_read ? 'border border-primary/30' : ''}`}
            >
              <div className={`w-10 h-10 ${config.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <IconComp className={`w-5 h-5 ${config.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <span className="font-bold text-sm">{notif.title}</span>
                  {!notif.is_read && <div className="w-2 h-2 rounded-full gold-gradient flex-shrink-0 mt-1" />}
                </div>
                <p className="text-muted-foreground text-sm mt-0.5 leading-relaxed">{notif.message}</p>
                <span className="text-muted-foreground text-xs mt-1 block">{timeAgo(notif.created_date)}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}