import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

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
          0 חדשות
        </span>
      </div>

      <div className="px-4 py-4 space-y-3">
        <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">
          אין התראות להצגה.
        </div>
      </div>
    </div>
  );
}
