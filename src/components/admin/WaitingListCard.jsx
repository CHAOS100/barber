import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '../../api/base44Client';
import { BellRing, Check, Phone, Calendar, Clock, Users } from 'lucide-react';

export default function WaitingListCard() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('pending'); // pending | claimed

  const { data: waitingList = [], isLoading } = useQuery({
    queryKey: ['waiting-list'],
    queryFn: () => base44.entities.WaitingList.list('-created_date'),
    refetchInterval: 30000,
  });

  const notifyMutation = useMutation({
    mutationFn: (id) => base44.entities.WaitingList.update(id, {
      notified_at: new Date().toISOString(),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waiting-list'] }),
  });

  const claimMutation = useMutation({
    mutationFn: (id) => base44.entities.WaitingList.update(id, {
      is_claimed: true,
      notified_at: new Date().toISOString(),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waiting-list'] }),
  });

  const pendingList = waitingList.filter(w => !w.is_claimed);
  const claimedList = waitingList.filter(w => w.is_claimed);
  const displayList = filter === 'pending' ? pendingList : claimedList;

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BellRing className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-sm">רשימת המתנה</h3>
          {pendingList.length > 0 && (
            <span className="gold-gradient text-black text-xs font-black w-5 h-5 rounded-full flex items-center justify-center">
              {pendingList.length}
            </span>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex glass rounded-xl p-0.5 mb-3">
        {[
          { key: 'pending', label: `ממתינים (${pendingList.length})` },
          { key: 'claimed', label: `טופלו (${claimedList.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filter === t.key ? 'gold-gradient text-black' : 'text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-4 text-muted-foreground text-sm">טוען...</div>
      ) : displayList.length === 0 ? (
        <div className="text-center py-6">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-xs">
            {filter === 'pending' ? 'אין ממתינים כרגע' : 'אין לקוחות שטופלו'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {displayList.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`dark-card rounded-xl p-3 ${item.is_claimed ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 gold-gradient rounded-xl flex items-center justify-center text-black font-black text-sm flex-shrink-0">
                  {item.customer_name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{item.customer_name}</div>
                  <div className="flex items-center gap-1 text-muted-foreground text-xs mt-0.5">
                    <Phone className="w-3 h-3" />
                    {item.customer_phone}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" /> {item.date}
                    </span>
                    {item.time && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" /> {item.time}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-primary font-medium mt-0.5">{item.service_name}</div>
                  {item.notified_at && !item.is_claimed && (
                    <div className="text-xs text-yellow-400 mt-0.5">
                      הודעה נשלחה: {new Date(item.notified_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>

              {!item.is_claimed && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => notifyMutation.mutate(item.id)}
                    disabled={notifyMutation.isPending || !!item.notified_at}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                      item.notified_at
                        ? 'bg-yellow-400/10 text-yellow-400 cursor-default'
                        : 'glass hover:border-primary/40 border border-transparent text-foreground'
                    }`}
                  >
                    <BellRing className="w-3 h-3" />
                    {item.notified_at ? 'הודע' : 'שלח הודעה'}
                  </button>
                  <button
                    onClick={() => claimMutation.mutate(item.id)}
                    disabled={claimMutation.isPending}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold gold-gradient text-black flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    קיבל תור
                  </button>
                </div>
              )}

              {item.is_claimed && (
                <div className="flex items-center gap-1 mt-2 text-green-400 text-xs font-bold">
                  <Check className="w-3 h-3" /> טופל בהצלחה
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
