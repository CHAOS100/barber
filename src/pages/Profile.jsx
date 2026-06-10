import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, AlertTriangle, Bell, LogOut, ChevronLeft, Phone, Edit3, History, Star, Heart, Settings } from 'lucide-react';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useQuery } from '@tanstack/react-query';
import { MOCK_NOTIFICATIONS } from '../lib/mockData';
import AppointmentHistory from '../components/profile/AppointmentHistory';
import GoldButton from '../components/ui/GoldButton';
import SettingsTab from '../components/profile/SettingsTab';

const TABS = [
  { key: 'info', label: 'פרופיל', icon: User },
  { key: 'history', label: 'היסטוריה', icon: History },
  { key: 'settings', label: 'הגדרות', icon: Settings },
];

export default function Profile() {
  const navigate = useNavigate();
  const { currentUser, logoutUser, isAdmin } = useCurrentUser();
  const [activeTab, setActiveTab] = useState('info');
  const [personalEditRequest, setPersonalEditRequest] = useState(0);

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', currentUser?.phone],
    queryFn: () => MOCK_NOTIFICATIONS,
    enabled: !!currentUser,
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const visits = currentUser?.total_appointments || 8;

  const openPersonalSettings = () => {
    setActiveTab('settings');
    setPersonalEditRequest(request => request + 1);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 page-transition" dir="rtl">
        <div className="w-24 h-24 glass-gold rounded-full flex items-center justify-center mb-6">
          <User className="w-12 h-12 text-primary" />
        </div>
        <h2 className="text-2xl font-black mb-2">הפרופיל שלי</h2>
        <p className="text-muted-foreground text-center mb-6">יש להתחבר לצפייה בפרופיל</p>
        <GoldButton onClick={() => navigate('/login')} size="lg" className="w-full max-w-xs">
          כניסה / הרשמה
        </GoldButton>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      {/* Header */}
      <div className="relative px-4 pt-12 pb-4">
        <div className="absolute inset-0 h-32 gold-gradient opacity-10" />
        <div className="relative flex items-center gap-4">
          <div className="w-20 h-20 gold-gradient rounded-2xl flex items-center justify-center text-black text-3xl font-black">
            {currentUser.name?.[0] || 'U'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black">{currentUser.name}</h1>
              {isAdmin && <span className="gold-gradient text-black text-xs font-bold px-2 py-0.5 rounded-full">ניהול</span>}
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-sm mt-0.5">
              <Phone className="w-3 h-3" />
              {currentUser.phone || currentUser.email}
            </div>
          </div>
          {!isAdmin && (
            <button
              onClick={openPersonalSettings}
              className="glass p-2.5 rounded-xl press-scale"
              aria-label="עריכת חשבון"
            >
              <Edit3 className="w-4 h-4 text-primary" />
            </button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 px-4 mb-4">
        {[
          { icon: AlertTriangle, label: 'אזהרות', value: currentUser?.warning_count || 0, color: 'text-yellow-400' },
          { icon: History, label: 'ביקורים', value: visits, color: 'text-blue-400' },
        ].map((stat) => {
          const StatIcon = stat.icon;
          return (
            <div key={stat.label} className="glass-gold rounded-2xl p-3 text-center">
              <StatIcon className={`w-5 h-5 ${stat.color} mx-auto mb-1`} />
              <div className={`text-xl font-black ${stat.color}`}>{stat.value}</div>
              <div className="text-muted-foreground text-xs">{stat.label}</div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex glass mx-4 rounded-2xl p-1 mb-4">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeTab === tab.key ? 'gold-gradient text-black' : 'text-muted-foreground'
              }`}
            >
              <TabIcon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="px-4">
        {/* INFO TAB */}
        {activeTab === 'info' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Notifications */}
            <button
              onClick={() => navigate('/notifications')}
              className="w-full glass rounded-2xl p-4 flex items-center justify-between press-scale mb-2"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Bell className="w-5 h-5 text-primary" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 gold-gradient rounded-full text-black text-[10px] font-black flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <span className="font-bold">התראות</span>
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>

            <div className="space-y-2">
              {[
                { icon: Star, label: 'ביקורות שלי', path: '/reviews', desc: 'כתוב ביקורת' },
                { icon: Heart, label: 'קבע תור', path: '/booking', desc: 'שירותים פופולריים' },
                ...(isAdmin ? [{ icon: User, label: 'לוח ניהול', path: '/admin', desc: 'ניהול העסק' }] : []),
              ].map((item) => {
                const ItemIcon = item.icon;
                return (
                  <motion.button
                    key={item.label}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate(item.path)}
                    className="w-full dark-card rounded-2xl p-4 flex items-center gap-3"
                  >
                    <div className="w-10 h-10 glass-gold rounded-xl flex items-center justify-center">
                      <ItemIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 text-right">
                      <div className="font-bold text-sm">{item.label}</div>
                      <div className="text-muted-foreground text-xs">{item.desc}</div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                  </motion.button>
                );
              })}
            </div>

            <button
              onClick={() => { logoutUser(); navigate('/'); }}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-red-500/10 text-red-400 font-bold press-scale mt-4"
            >
              <LogOut className="w-5 h-5" />
              התנתק
            </button>
          </motion.div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p className="text-muted-foreground text-sm mb-3">לחץ על <span className="text-primary">↺</span> לקביעה מחדש</p>
            <AppointmentHistory currentUser={currentUser} />
          </motion.div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SettingsTab currentUser={currentUser} openPersonalRequest={personalEditRequest} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
