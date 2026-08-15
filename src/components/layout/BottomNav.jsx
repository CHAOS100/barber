import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Calendar,
  Home,
  Image,
  LayoutDashboard,
  Scissors,
  Settings,
  User,
  Users,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useCurrentUser } from '../../hooks/useCurrentUser';

const customerTabs = [
  { path: '/', icon: Home, label: 'בית' },
  { path: '/appointments', icon: Calendar, label: 'תורים' },
  { path: '/gallery', icon: Image, label: 'גלריה' },
  { path: '/profile', icon: User, label: 'פרופיל' },
];

const adminTabs = [
  { path: '/admin', icon: LayoutDashboard, label: 'ניהול' },
  { path: '/admin/appointments', icon: Calendar, label: 'תורים' },
  { path: '/admin/customers', icon: Users, label: 'לקוחות' },
  { path: '/admin/services', icon: Scissors, label: 'שירותים' },
  { path: '/admin/settings', icon: Settings, label: 'הגדרות' },
];

export default function BottomNav() {
  const location = useLocation();
  const { isAdmin, adminPreview } = useCurrentUser();
  const tabs = isAdmin && !adminPreview ? adminTabs : customerTabs;

  return (
    <div className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[var(--z-bottom-nav)] glass border-t border-white/10">
      <div className="flex items-center justify-around px-2 pt-2 pb-1">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path
            || (tab.path !== '/' && location.pathname.startsWith(tab.path));
          return (
            <Link key={tab.path} to={tab.path} className="flex flex-col items-center gap-1 min-w-[50px] press-scale">
              <div className={`relative p-2 rounded-xl transition-all duration-300 ${isActive ? 'bg-primary/20' : ''}`}>
                {isActive && (
                  <motion.div
                    layoutId="navIndicator"
                    className="absolute inset-0 rounded-xl gold-gradient opacity-20"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <tab.icon
                  className={`w-5 h-5 transition-colors duration-300 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                />
              </div>
              <span className={`text-[10px] font-medium transition-colors duration-300 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
