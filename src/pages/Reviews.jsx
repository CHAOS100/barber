import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Plus, X } from 'lucide-react';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useNavigate } from 'react-router-dom';
import { base44 } from '../api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MOCK_REVIEWS, BUSINESS_INFO } from '../lib/mockData';
import StarRating from '../components/ui/StarRating';
import GoldButton from '../components/ui/GoldButton';

export default function Reviews() {
  const navigate = useNavigate();
  const { currentUser } = useCurrentUser();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: reviews = [] } = useQuery({
    queryKey: ['reviews'],
    queryFn: async () => {
      try {
        const r = await base44.entities.Review.list('-created_date');
        return r.length > 0 ? r : MOCK_REVIEWS;
      } catch { return MOCK_REVIEWS; }
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => base44.entities.Review.create({
      customer_name: currentUser.name,
      customer_phone: currentUser.phone,
      rating,
      comment,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews'] });
      setShowForm(false);
      setComment('');
      setRating(5);
    },
  });

  const displayReviews = reviews.filter(r => !r.is_hidden);
  const sorted = [...displayReviews].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return 0;
  });

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="px-4 pt-12 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black">ביקורות</h1>
            <p className="text-muted-foreground text-sm">מה הלקוחות אומרים</p>
          </div>
          {currentUser && (
            <GoldButton onClick={() => setShowForm(true)} size="sm">
              <Plus className="w-4 h-4 ml-1" /> כתוב
            </GoldButton>
          )}
        </div>
      </div>

      {/* Rating Summary */}
      <div className="px-4 mb-5">
        <div className="glass rounded-2xl p-5 flex items-center gap-6">
          <div className="text-center">
            <div className="text-5xl font-black gold-text">{BUSINESS_INFO.rating}</div>
            <StarRating rating={5} size="md" />
            <div className="text-muted-foreground text-xs mt-1">{BUSINESS_INFO.reviews_count}+ ביקורות</div>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = star === 5 ? 95 : star === 4 ? 15 : star === 3 ? 3 : star === 2 ? 1 : 1;
              const pct = Math.round((count / 115) * 100);
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-3">{star}</span>
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full gold-gradient rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reviews */}
      <div className="px-4 space-y-3 mb-8">
        {sorted.map((review, i) => (
          <motion.div
            key={review.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="dark-card rounded-2xl p-4"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 gold-gradient rounded-full flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
                {review.customer_name?.[0] || '?'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{review.customer_name}</span>
                  {review.is_pinned && <span className="text-xs text-primary">📌</span>}
                </div>
                <div className="flex items-center gap-2">
                  <StarRating rating={review.rating} size="sm" />
                  {review.service_name && <span className="text-muted-foreground text-xs">• {review.service_name}</span>}
                </div>
              </div>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">{review.comment}</p>
            {review.admin_reply && (
              <div className="mt-3 glass-gold rounded-xl p-3">
                <div className="text-xs font-bold text-primary mb-1">תגובת OST BARBER 💬</div>
                <p className="text-foreground text-sm">{review.admin_reply}</p>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {!currentUser && (
        <div className="px-4 pb-8 text-center">
          <p className="text-muted-foreground mb-3">יש להתחבר כדי לכתוב ביקורת</p>
          <GoldButton onClick={() => navigate('/login')} size="md">
            כניסה
          </GoldButton>
        </div>
      )}

      {/* Review Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center px-4 pb-8"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="dark-card rounded-3xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-lg">כתוב ביקורת</h3>
                <button onClick={() => setShowForm(false)} className="glass p-2 rounded-xl">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex justify-center mb-4">
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => setRating(s)}>
                      <Star className={`w-8 h-8 transition-all ${s <= rating ? 'fill-primary text-primary scale-110' : 'text-muted-foreground'}`} />
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="ספר לנו על החוויה שלך..."
                className="w-full bg-secondary border border-border rounded-2xl px-4 py-3 text-foreground text-right placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none h-28 mb-4"
                dir="rtl"
              />
              <GoldButton
                onClick={() => submitMutation.mutate()}
                size="lg"
                className="w-full"
                disabled={!comment || submitting}
              >
                פרסם ביקורת
              </GoldButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
