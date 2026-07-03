import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Search, AlertTriangle, Ban, Phone, ChevronLeft, CreditCard, Save, X } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import {
  subscribeToAllCustomerProfiles,
  updateCustomerByAdmin,
} from '@/lib/customerProfilesFirestore';
import { toast } from '@/components/ui/use-toast';
import { DATA_LOAD_ERROR_MESSAGE, getUserFacingErrorMessage } from '@/lib/userFacingErrors';

const hasPaymentRequest = (customer) => (
  customer.requiresNoShowPayment === true
  || customer.requires_no_show_payment === true
  || Number(customer.noShowPaymentAmount ?? customer.no_show_payment_amount ?? 0) > 0
);

const hasWarning = (customer) => (
  Number(customer.warningCount ?? customer.warning_count ?? 0) > 0
  || Boolean(customer.warning)
  || (Array.isArray(customer.warnings) && customer.warnings.length > 0)
);

const isBlocked = (customer) => (
  customer.blocked === true || customer.isBlocked === true || customer.is_blocked === true
);

const noShowCount = (customer) => Number(customer.noShowCount ?? customer.no_show_count ?? 0);

const STATUS_FILTERS = [
  { key: 'all', label: 'כולם' },
  { key: 'payment', label: 'דרישת תשלום פעילה' },
  { key: 'blocked', label: 'לקוח חסום' },
  { key: 'warning', label: 'אזהרה פעילה' },
  { key: 'no_show', label: 'אי הגעה' },
];

export default function AdminCustomers() {
  const navigate = useNavigate();
  const location = useLocation();
  const [customers, setCustomers] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(location.state?.filter || 'all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [blockedReason, setBlockedReason] = useState('');
  const [clearAction, setClearAction] = useState(null);
  const [clearReason, setClearReason] = useState('');

  useEffect(() => subscribeToAllCustomerProfiles(setCustomers, setLoadError), []);

  const updateMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, changes }) => updateCustomerByAdmin(id, changes),
    onSuccess: () => {
      toast({ title: 'פרטי הלקוח עודכנו' });
      setSelectedCustomer(null);
      setClearAction(null);
      setClearReason('');
    },
    onError: (error) => toast({
      variant: 'destructive',
      title: 'עדכון הלקוח נכשל',
      description: getUserFacingErrorMessage(error),
    }),
  });

  useEffect(() => {
    if (location.state?.filter) setStatusFilter(location.state.filter);
  }, [location.state?.filter]);

  const filtered = useMemo(() => customers.filter((customer) => {
    const matchesSearch = customer.name?.includes(search) || customer.phoneNumber?.includes(search);
    const matchesFilter = statusFilter === 'all'
      || (statusFilter === 'payment' && hasPaymentRequest(customer))
      || (statusFilter === 'blocked' && isBlocked(customer))
      || (statusFilter === 'warning' && hasWarning(customer))
      || (statusFilter === 'no_show' && noShowCount(customer) > 0);
    return matchesSearch && matchesFilter;
  }), [customers, search, statusFilter]);

  const openCustomer = (customer) => {
    setSelectedCustomer(customer);
    setFirstName(customer.firstName || '');
    setLastName(customer.lastName || '');
    setBlockedReason(customer.blocked_reason || '');
    setClearAction(null);
    setClearReason('');
  };

  const openClearAction = (type) => {
    const titles = {
      payment: 'ניקוי דרישת תשלום',
      warning: 'ניקוי אזהרה',
      block: 'ניקוי חסימה',
    };
    setClearAction({ type, title: titles[type] || 'ניקוי סטטוס' });
    setClearReason('');
  };

  const submitClearAction = () => {
    if (!selectedCustomer || !clearAction) return;
    const changes = {
      clearReason,
      ...(clearAction.type === 'payment' ? { clearPaymentRequest: true } : {}),
      ...(clearAction.type === 'warning' ? { clearWarning: true } : {}),
      ...(clearAction.type === 'block' ? { clearBlock: true } : {}),
    };
    updateMutation.mutate({ id: selectedCustomer.id, changes });
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky-top-safe z-30 glass border-b border-white/10 px-4 py-3 flex items-center gap-1">
        <button onClick={() => navigate('/admin')} className="icon-btn press-scale -mr-2" aria-label="חזרה לניהול">
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
        <div className="flex gap-2 overflow-x-auto pt-3 pb-1" style={{ scrollbarWidth: 'none' }}>
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              onClick={() => setStatusFilter(filter.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                statusFilter === filter.key ? 'gold-gradient text-black' : 'glass text-muted-foreground'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="mx-4 mb-3 banner-error">
          {DATA_LOAD_ERROR_MESSAGE}
        </div>
      )}

      <div className="px-4 space-y-2 pb-6">
        {!loadError && filtered.length === 0 && (
          <div className="glass premium-empty-state rounded-2xl p-8 text-center">
            <Search className="w-10 h-10 text-muted-foreground/60 mx-auto mb-3" />
            <p className="font-black text-sm mb-1">לא נמצאו לקוחות</p>
            <p className="text-muted-foreground text-xs">נסה לשנות את החיפוש או הסינון.</p>
          </div>
        )}
        {filtered.map((customer, index) => (
          <motion.button
            key={customer.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className={`w-full dark-card rounded-2xl p-4 text-right ${isBlocked(customer) ? 'border border-red-500/30' : ''} ${hasPaymentRequest(customer) ? 'ring-1 ring-yellow-400/30' : ''}`}
            onClick={() => openCustomer(customer)}
          >
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-black ${
                hasPaymentRequest(customer) ? 'bg-yellow-400/20 text-yellow-300' : hasWarning(customer) ? 'bg-yellow-500/20 text-yellow-400' : 'gold-gradient text-black'
              }`}>
                {customer.name?.[0] || '?'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{customer.name}</span>
                  {isBlocked(customer) && <Ban className="w-3 h-3 text-red-400" />}
                  {hasPaymentRequest(customer) && <CreditCard className="w-3 h-3 text-yellow-300" />}
                  {hasWarning(customer) && (
                    <span className="flex items-center gap-0.5 text-yellow-400 text-xs">
                      <AlertTriangle className="w-3 h-3" />{Number(customer.warning_count || customer.warningCount || 1)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-muted-foreground text-xs mt-0.5" dir="ltr">
                  <Phone className="w-3 h-3" /> {customer.phoneNumber}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {hasPaymentRequest(customer) && (
                    <span className="status-pill status-pill--warning">
                      דרישת תשלום פעילה
                    </span>
                  )}
                  {isBlocked(customer) && (
                    <span className="status-pill status-pill--danger">
                      לקוח חסום
                    </span>
                  )}
                  {hasWarning(customer) && (
                    <span className="status-pill status-pill--warning">
                      אזהרה פעילה
                    </span>
                  )}
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
            className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setSelectedCustomer(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="keyboard-safe-modal dark-card rounded-3xl p-5 w-full max-w-sm overflow-y-auto"
              onPointerDown={event => event.stopPropagation()}
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
                {(hasPaymentRequest(selectedCustomer) || isBlocked(selectedCustomer) || hasWarning(selectedCustomer) || noShowCount(selectedCustomer) > 0) && (
                  <div className="space-y-2">
                    {hasPaymentRequest(selectedCustomer) && (
                      <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-3">
                        <div className="flex items-center gap-2 text-yellow-200 font-black text-sm">
                          <CreditCard className="w-4 h-4" />
                          דרישת תשלום פעילה
                        </div>
                        <p className="text-muted-foreground text-xs leading-5 mt-1">
                          לא ניתן להזמין עד להסדרת התשלום.
                        </p>
                        {Number(selectedCustomer.noShowPaymentAmount || 0) > 0 && (
                          <p className="text-primary font-black text-sm mt-1">₪{selectedCustomer.noShowPaymentAmount}</p>
                        )}
                        {selectedCustomer.noShowPaymentReason && (
                          <p className="text-muted-foreground text-xs leading-5 mt-1">{selectedCustomer.noShowPaymentReason}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => openClearAction('payment')}
                          className="mt-2 w-full rounded-xl bg-yellow-400/15 px-3 py-2 text-yellow-200 text-xs font-bold"
                        >
                          נקה דרישת תשלום
                        </button>
                      </div>
                    )}

                    {isBlocked(selectedCustomer) && (
                      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3">
                        <div className="flex items-center gap-2 text-red-300 font-black text-sm">
                          <Ban className="w-4 h-4" />
                          לקוח חסום
                        </div>
                        <p className="text-muted-foreground text-xs leading-5 mt-1">
                          {selectedCustomer.blocked_reason || selectedCustomer.blockedReason || 'לא צוינה סיבת חסימה.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => openClearAction('block')}
                          className="mt-2 w-full rounded-xl bg-red-500/15 px-3 py-2 text-red-200 text-xs font-bold"
                        >
                          נקה חסימה
                        </button>
                      </div>
                    )}

                    {hasWarning(selectedCustomer) && (
                      <div className="rounded-2xl border border-orange-400/30 bg-orange-400/10 p-3">
                        <div className="flex items-center gap-2 text-orange-200 font-black text-sm">
                          <AlertTriangle className="w-4 h-4" />
                          אזהרה פעילה
                        </div>
                        <p className="text-muted-foreground text-xs leading-5 mt-1">
                          {selectedCustomer.lastWarningReason || `מספר אזהרות: ${Number(selectedCustomer.warning_count || selectedCustomer.warningCount || 1)}`}
                        </p>
                        <button
                          type="button"
                          onClick={() => openClearAction('warning')}
                          className="mt-2 w-full rounded-xl bg-orange-400/15 px-3 py-2 text-orange-200 text-xs font-bold"
                        >
                          נקה אזהרה
                        </button>
                      </div>
                    )}

                    {noShowCount(selectedCustomer) > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-sm font-bold">אי הגעה</p>
                        <p className="text-muted-foreground text-xs mt-1">
                          נרשמו {noShowCount(selectedCustomer)} מקרי אי הגעה ללקוח.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {clearAction && (
                  <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3">
                    <p className="font-black text-sm text-primary mb-2">{clearAction.title}</p>
                    <textarea
                      value={clearReason}
                      onChange={event => setClearReason(event.target.value)}
                      placeholder="סיבת ניקוי (אופציונלי)"
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm resize-none h-20"
                    />
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setClearAction(null);
                          setClearReason('');
                        }}
                        className="rounded-xl glass px-3 py-2 text-sm font-bold"
                      >
                        ביטול
                      </button>
                      <button
                        type="button"
                        onClick={submitClearAction}
                        disabled={updateMutation.isPending}
                        className="rounded-xl gold-gradient px-3 py-2 text-sm font-black text-black disabled:opacity-50"
                      >
                        {updateMutation.isPending ? 'שומר...' : 'אישור ניקוי'}
                      </button>
                    </div>
                  </div>
                )}

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
                  onClick={() => {
                    if (isBlocked(selectedCustomer)) {
                      openClearAction('block');
                      return;
                    }
                    updateMutation.mutate({
                      id: selectedCustomer.id,
                      changes: {
                        blocked: true,
                        blockedReason,
                      },
                    });
                  }}
                  disabled={updateMutation.isPending || (!isBlocked(selectedCustomer) && !blockedReason.trim())}
                  className={`w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40 ${
                    isBlocked(selectedCustomer) ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {isBlocked(selectedCustomer) ? 'נקה חסימה' : 'חסום לקוח'}
                </button>
                {!isBlocked(selectedCustomer) && (
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
