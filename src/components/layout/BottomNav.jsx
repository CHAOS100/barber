import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Calendar, Image, User, LayoutDashboard } from 'lucide-react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { motion } from 'framer-motion';

const tabs = [
  { path: '/', icon: Home, label: 'בית' },
  { path: '/appointments', icon: Calendar, label: 'תורים' },
  { path: '/gallery', icon: Image, label: 'גלריה' },
  { path: '/profile', icon: User, label: 'פרופיל' },
];

export default function BottomNav() {
  const location = useLocation();
  const { isAdmin } = useCurrentUser();

  const allTabs = isAdmin
    ? [...tabs, { path: '/admin', icon: LayoutDashboard, label: 'ניהול' }]
    : tabs;

  return (
    <div className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/10" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
      <div className="flex items-center justify-around px-2 pt-2 pb-1">
        {allTabs.map((tab) => {
          const isActive = location.pathname === tab.path || (tab.path !== '/' && location.pathname.startsWith(tab.path));
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
