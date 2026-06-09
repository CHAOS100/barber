import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Search, AlertTriangle, Ban, Star, Phone, ChevronLeft } from 'lucide-react';
import { base44 } from '../../api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const MOCK_CUSTOMERS = [
  { id: 'c1', name: 'יוסי כהן', phone: '052-1234567', total_appointments: 8, warning_count: 0, reward_points: 80, is_blocked: false },
  { id: 'c2', name: 'דוד לוי', phone: '053-2345678', total_appointments: 5, warning_count: 1, reward_points: 50, is_blocked: false },
  { id: 'c3', name: 'משה אברהם', phone: '054-3456789', total_appointments: 12, warning_count: 0, reward_points: 120, is_blocked: false },
  { id: 'c4', name: 'אמיר נחמני', phone: '050-4567890', total_appointments: 3, warning_count: 2, reward_points: 30, is_blocked: false },
  { id: 'c5', name: 'רועי שפירא', phone: '058-5678901', total_appointments: 15, warning_count: 0, reward_points: 150, is_blocked: false },
  { id: 'c6', name: 'ניר כץ', phone: '052-6789012', total_appointments: 1, warning_count: 3, reward_points: 10, is_blocked: true },
];

export default function AdminCustomers() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      try {
        const r = await base44.entities.CustomerProfile.list('-total_appointments');
        return r.length > 0 ? r : MOCK_CUSTOMERS;
      } catch { return MOCK_CUSTOMERS; }
    },
  });

  const blockMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, is_blocked }) => base44.entities.CustomerProfile.update(id, { is_blocked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });

  const filtered = customers.filter(c =>
    c.name?.includes(search) || c.phone?.includes(search)
  );

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="press-scale">
          <ArrowRight className="w-6 h-6" />
        </button>
        <h1 className="font-black text-lg">לקוחות</h1>
        <span className="mr-auto text-muted-foreground text-sm">{customers.length} לקוחות</span>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חפש לקוח..."
            className="w-full bg-secondary border border-border rounded-xl px-4 py-3 pr-10 text-right text-sm focus:outline-none focus:border-primary"
            dir="rtl"
          />
        </div>
      </div>

      <div className="px-4 space-y-2">
        {filtered.map((customer, i) => (
          <motion.div
            key={customer.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`dark-card rounded-2xl p-4 cursor-pointer ${customer.is_blocked ? 'opacity-50 border border-red-500/30' : ''}`}
            onClick={() => setSelectedCustomer(customer)}
          >
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-black flex-shrink-0 ${
                customer.warning_count >= 3 ? 'bg-red-500/20 text-red-400' :
                customer.warning_count >= 1 ? 'bg-yellow-500/20 text-yellow-400' :
                'gold-gradient text-black'
              }`}>
                {customer.name?.[0] || '?'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{customer.name}</span>
                  {customer.is_blocked && <Ban className="w-3 h-3 text-red-400" />}
                  {customer.warning_count > 0 && (
                    <span className="flex items-center gap-0.5 text-yellow-400 text-xs">
                      <AlertTriangle className="w-3 h-3" />{customer.warning_count}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-muted-foreground text-xs mt-0.5">
                  <Phone className="w-3 h-3" /> {customer.phone}
                </div>
              </div>
              <div className="text-right">
                <div className="text-primary font-black text-sm">{customer.total_appointments} ביקורים</div>
                <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Star className="w-3 h-3 text-primary" /> {customer.reward_points} נקודות
                </div>
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Customer Detail Sheet */}
      <AnimatePresence>
        {selectedCustomer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center px-4 pb-8"
            onClick={() => setSelectedCustomer(null)}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              className="dark-card rounded-3xl p-5 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 gold-gradient rounded-2xl flex items-center justify-center text-black text-2xl font-black">
                  {selectedCustomer.name?.[0]}
                </div>
                <div>
                  <div className="font-black text-lg">{selectedCustomer.name}</div>
                  <div className="text-muted-foreground text-sm">{selectedCustomer.phone}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="glass rounded-xl p-3 text-center">
                  <div className="font-black text-primary">{selectedCustomer.total_appointments}</div>
                  <div className="text-muted-foreground text-xs">ביקורים</div>
                </div>
                <div className="glass rounded-xl p-3 text-center">
                  <div className={`font-black ${selectedCustomer.warning_count > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {selectedCustomer.warning_count}
                  </div>
                  <div className="text-muted-foreground text-xs">אזהרות</div>
                </div>
                <div className="glass rounded-xl p-3 text-center">
                  <div className="font-black text-primary">{selectedCustomer.reward_points}</div>
                  <div className="text-muted-foreground text-xs">נקודות</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => window.open(`tel:${selectedCustomer.phone}`)}
                  className="flex-1 flex items-center justify-center gap-2 glass py-3 rounded-xl font-bold text-sm"
                >
                  <Phone className="w-4 h-4 text-blue-400" /> התקשר
                </button>
                <button
                  onClick={() => {
                    blockMutation.mutate({ id: selectedCustomer.id, is_blocked: !selectedCustomer.is_blocked });
                    setSelectedCustomer(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm ${
                    selectedCustomer.is_blocked ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  <Ban className="w-4 h-4" />
                  {selectedCustomer.is_blocked ? 'בטל חסימה' : 'חסום'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
