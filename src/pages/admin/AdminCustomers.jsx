import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Search, AlertTriangle, Ban, Phone, ChevronLeft, Save, X } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import {
  subscribeToAllCustomerProfiles,
  updateCustomerByAdmin,
} from '@/lib/customerProfilesFirestore';
import { toast } from '@/components/ui/use-toast';

export default function AdminCustomers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [blockedReason, setBlockedReason] = useState('');

  useEffect(() => subscribeToAllCustomerProfiles(setCustomers, setLoadError), []);

  const updateMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, changes }) => updateCustomerByAdmin(id, changes),
    onSuccess: () => {
      toast({ title: 'פרטי הלקוח עודכנו' });
      setSelectedCustomer(null);
    },
    onError: (error) => toast({
      variant: 'destructive',
      title: 'עדכון הלקוח נכשל',
      description: error?.message || 'יש לנסות שוב.',
    }),
  });

  const filtered = useMemo(() => customers.filter(customer =>
    customer.name?.includes(search) || customer.phoneNumber?.includes(search)
  ), [customers, search]);

  const openCustomer = (customer) => {
    setSelectedCustomer(customer);
    setFirstName(customer.firstName || '');
    setLastName(customer.lastName || '');
    setBlockedReason(customer.blocked_reason || '');
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="press-scale">
          <ArrowRight className="w-6 h-6" />
        </button>
        <h1 className="font-black text-lg">לקוחות</h1>
        <span className="mr-auto text-muted-foreground text-sm">{customers.length} לקוחות</span>
      </div>

      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="חפש לקוח..."
            className="w-full bg-secondary border border-border rounded-xl px-4 py-3 pr-10 text-right text-sm focus:outline-none focus:border-primary"
            dir="rtl"
          />
        </div>
      </div>

      {loadError && (
        <div className="mx-4 mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-sm">
          טעינת הלקוחות מ-Firestore נכשלה: {loadError.message}
        </div>
      )}

      <div className="px-4 space-y-2 pb-6">
        {filtered.map((customer, index) => (
          <motion.button
            key={customer.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className={`w-full dark-card rounded-2xl p-4 text-right ${customer.is_blocked ? 'opacity-50 border border-red-500/30' : ''}`}
            onClick={() => openCustomer(customer)}
          >
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-black ${
                customer.warning_count > 0 ? 'bg-yellow-500/20 text-yellow-400' : 'gold-gradient text-black'
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
                <div className="flex items-center gap-1 text-muted-foreground text-xs mt-0.5" dir="ltr">
                  <Phone className="w-3 h-3" /> {customer.phoneNumber}
                </div>
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {selectedCustomer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-end justify-center px-4 pb-8"
            onClick={() => setSelectedCustomer(null)}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              className="keyboard-safe-modal dark-card rounded-3xl p-5 w-full max-w-sm overflow-y-auto"
              onClick={event => event.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-black text-lg">עריכת לקוח</h2>
                  <p className="text-muted-foreground text-xs" dir="ltr">{selectedCustomer.phoneNumber}</p>
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="glass p-2 rounded-xl">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <label className="block text-xs text-muted-foreground">
                  שם פרטי
                  <input
                    value={firstName}
                    onChange={event => setFirstName(event.target.value)}
                    className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="block text-xs text-muted-foreground">
                  שם משפחה
                  <input
                    value={lastName}
                    onChange={event => setLastName(event.target.value)}
                    className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm"
                  />
                </label>
                <button
                  onClick={() => updateMutation.mutate({
                    id: selectedCustomer.id,
                    changes: {
                      blocked: !selectedCustomer.is_blocked,
                      blockedReason,
                    },
                  })}
                  disabled={updateMutation.isPending || (!selectedCustomer.is_blocked && !blockedReason.trim())}
                  className={`w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40 ${
                    selectedCustomer.is_blocked ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {selectedCustomer.is_blocked ? 'בטל חסימה' : 'חסום לקוח'}
                </button>
                {!selectedCustomer.is_blocked && (
                  <label className="block text-xs text-muted-foreground">
                    סיבת חסימה
                    <input
                      value={blockedReason}
                      onChange={event => setBlockedReason(event.target.value)}
                      placeholder="סיבת החסימה"
                      className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm"
                    />
                  </label>
                )}
                <button
                  onClick={() => updateMutation.mutate({
                    id: selectedCustomer.id,
                    changes: { firstName, lastName },
                  })}
                  disabled={updateMutation.isPending || !firstName.trim() || !lastName.trim()}
                  className="w-full py-3 rounded-xl gold-gradient text-black font-black flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {updateMutation.isPending ? 'שומר...' : 'שמור שמות'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
