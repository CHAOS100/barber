import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Store, Phone, MapPin } from 'lucide-react';
import { BUSINESS_INFO, BARBER_PHOTO } from '../../lib/mockData';
import GoldButton from '../../components/ui/GoldButton';

export default function AdminSettings() {
  const navigate = useNavigate();
  const [info, setInfo] = useState({ ...BUSINESS_INFO });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="press-scale">
          <ArrowRight className="w-6 h-6" />
        </button>
        <h1 className="font-black text-lg">הגדרות עסק</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Profile Image */}
        <div className="flex flex-col items-center glass rounded-2xl p-5">
          <img src={BARBER_PHOTO} alt="OST" className="w-24 h-24 rounded-2xl object-cover border-2 border-primary mb-3" />
          <button className="glass-gold px-4 py-2 rounded-xl text-primary text-sm font-bold">
            שנה תמונה
          </button>
        </div>

        {/* Business Details */}
        <div className="glass rounded-2xl p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <Store className="w-4 h-4 text-primary" /> פרטי העסק
          </h3>
          {[
            { key: 'name', label: 'שם העסק', icon: Store },
            { key: 'phone', label: 'טלפון', icon: Phone },
            { key: 'address', label: 'כתובת', icon: MapPin },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
              <input
                value={info[key] || ''}
                onChange={e => setInfo(prev => ({ ...prev, [key]: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-right text-sm focus:outline-none focus:border-primary"
                dir="rtl"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">תיאור</label>
            <textarea
              value={info.description || ''}
              onChange={e => setInfo(prev => ({ ...prev, description: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-right text-sm focus:outline-none focus:border-primary resize-none h-24"
              dir="rtl"
            />
          </div>
        </div>

        <GoldButton onClick={handleSave} size="lg" className="w-full">
          {saved ? '✓ נשמר!' : 'שמור שינויים'}
        </GoldButton>
      </div>
    </div>
  );
}