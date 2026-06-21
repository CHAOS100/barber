import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Plus, Star, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useCustomerAppointmentsRealtime } from '@/hooks/useAppointmentsRealtime';
import {
  useAdminReviewsRealtime,
  useCustomerReviewsRealtime,
  usePublishedReviewsRealtime,
} from '@/hooks/useReviewsRealtime';
import {
  createAdminReview,
  createCustomerReview,
  deleteAdminReview,
  setAdminReviewStatus,
} from '@/lib/reviewsFirestore';
import { toast } from '@/components/ui/use-toast';
import { DATA_LOAD_ERROR_MESSAGE, getUserFacingErrorMessage } from '@/lib/userFacingErrors';
import StarRating from '../components/ui/StarRating';
import GoldButton from '../components/ui/GoldButton';

export default function Reviews() {
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useCurrentUser();
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [appointmentId, setAppointmentId] = useState('');

  const { reviews: publishedReviews, error: publicError } = usePublishedReviewsRealtime();
  const { reviews: adminReviews, error: adminError } = useAdminReviewsRealtime(isAdmin);
  const { reviews: customerReviews } = useCustomerReviewsRealtime(Boolean(currentUser) && !isAdmin);
  const { appointments } = useCustomerAppointmentsRealtime(Boolean(currentUser) && !isAdmin);

  const reviews = isAdmin ? adminReviews : publishedReviews;
  const reviewedAppointmentIds = useMemo(
    () => new Set(customerReviews.map((review) => review.appointmentId)),
    [customerReviews],
  );
  const eligibleAppointments = useMemo(
    () => appointments.filter((appointment) =>
      appointment.status === 'completed' && !reviewedAppointmentIds.has(appointment.id)),
    [appointments, reviewedAppointmentIds],
  );

  const averageRating = reviews.length
    ? reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length
    : 0;
  const ratingCounts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((review) => review.rating === star).length,
  }));

  const resetForm = () => {
    setShowForm(false);
    setRating(5);
    setText('');
    setCustomerName('');
    setAppointmentId('');
  };

  const submitMutation = useMutation({
    mutationFn: () => isAdmin
      ? createAdminReview({ customerName, rating, text })
      : createCustomerReview({ appointmentId, rating, text }),
    onSuccess: () => {
      toast({ title: 'הביקורת פורסמה', description: 'תודה, הביקורת נשמרה.' });
      resetForm();
    },
    onError: (error) => toast({
      variant: 'destructive',
      title: 'פרסום הביקורת נכשל',
      description: getUserFacingErrorMessage(error),
    }),
  });

  const statusMutation = useMutation({
    mutationFn: (/** @type {{ id: string, status: string }} */ input) =>
      setAdminReviewStatus(input.id, input.status),
    onSuccess: () => toast({ title: 'סטטוס הביקורת עודכן' }),
    onError: (error) => toast({ variant: 'destructive', title: 'העדכון נכשל', description: getUserFacingErrorMessage(error) }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminReview,
    onSuccess: () => toast({ title: 'הביקורת נמחקה' }),
    onError: (error) => toast({ variant: 'destructive', title: 'המחיקה נכשלה', description: getUserFacingErrorMessage(error) }),
  });

  const canWriteReview = isAdmin || eligibleAppointments.length > 0;
  const listenerError = adminError || publicError;

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="px-4 pt-12 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black">ביקורות</h1>
            <p className="text-muted-foreground text-sm">ביקורות מלקוחות</p>
          </div>
          {currentUser && canWriteReview && (
            <GoldButton onClick={() => setShowForm(true)} size="sm">
              <Plus className="w-4 h-4 ml-1" /> כתוב
            </GoldButton>
          )}
        </div>
      </div>

      <div className="px-4 mb-5">
        <div className="glass rounded-2xl p-5 flex items-center gap-6">
          <div className="text-center">
            <div className="text-5xl font-black gold-text">{averageRating.toFixed(1)}</div>
            <StarRating rating={Math.round(averageRating)} size="md" />
            <div className="text-muted-foreground text-xs mt-1">{reviews.length} ביקורות</div>
          </div>
          <div className="flex-1 space-y-1.5">
            {ratingCounts.map(({ star, count }) => (
              <div key={star} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-3">{star}</span>
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full gold-gradient rounded-full"
                    style={{ width: `${reviews.length ? Math.round((count / reviews.length) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {listenerError && (
        <div className="mx-4 mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-sm">
          {DATA_LOAD_ERROR_MESSAGE}
        </div>
      )}

      <div className="px-4 space-y-3 mb-8">
        {reviews.length === 0 ? (
          <div className="glass premium-empty-state rounded-2xl p-8 text-center text-muted-foreground text-sm">
            עדיין אין ביקורות.
          </div>
        ) : reviews.map((review, index) => (
          <motion.div
            key={review.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className={`dark-card rounded-2xl p-4 ${review.status === 'hidden' ? 'opacity-60 border border-yellow-500/30' : ''}`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 gold-gradient rounded-full flex items-center justify-center text-black font-bold text-sm">
                {review.customer_name?.[0] || '?'}
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm">{review.customer_name}</div>
                <div className="flex items-center gap-2">
                  <StarRating rating={review.rating} size="sm" />
                  {review.service_name && <span className="text-muted-foreground text-xs">• {review.service_name}</span>}
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-1">
                  <button
                    onClick={() => statusMutation.mutate({
                      id: review.id,
                      status: review.status === 'hidden' ? 'published' : 'hidden',
                    })}
                    className="glass p-2 rounded-lg"
                    aria-label={review.status === 'hidden' ? 'פרסם ביקורת' : 'הסתר ביקורת'}
                  >
                    {review.status === 'hidden'
                      ? <Eye className="w-4 h-4 text-green-400" />
                      : <EyeOff className="w-4 h-4 text-yellow-400" />}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(review.id)}
                    className="glass p-2 rounded-lg"
                    aria-label="מחק ביקורת"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">{review.comment}</p>
          </motion.div>
        ))}
      </div>

      {!currentUser && (
        <div className="px-4 pb-8 text-center">
          <p className="text-muted-foreground mb-3">יש להתחבר כדי לכתוב ביקורת לאחר תור שהושלם</p>
          <GoldButton onClick={() => navigate('/login')} size="md">כניסה</GoldButton>
        </div>
      )}
      {currentUser && !isAdmin && eligibleAppointments.length === 0 && (
        <div className="px-4 pb-8 text-center text-muted-foreground text-sm">
          ניתן לכתוב ביקורת לאחר השלמת תור, פעם אחת לכל תור.
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
            onClick={resetForm}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              className="keyboard-safe-modal dark-card rounded-3xl p-6 w-full max-w-sm overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-lg">{isAdmin ? 'הוסף ביקורת ידנית' : 'כתוב ביקורת'}</h3>
                <button onClick={resetForm} className="glass p-2 rounded-xl"><X className="w-4 h-4" /></button>
              </div>
              {isAdmin ? (
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="שם הלקוח"
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 mb-4 text-right"
                />
              ) : (
                <select
                  value={appointmentId}
                  onChange={(event) => setAppointmentId(event.target.value)}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 mb-4"
                >
                  <option value="">בחר תור שהושלם</option>
                  {eligibleAppointments.map((appointment) => (
                    <option key={appointment.id} value={appointment.id}>
                      {appointment.service_name} • {appointment.date}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} onClick={() => setRating(star)}>
                    <Star className={`w-8 h-8 ${star <= rating ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
                  </button>
                ))}
              </div>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="ספר לנו על החוויה שלך..."
                className="w-full bg-secondary border border-border rounded-2xl px-4 py-3 text-right resize-none h-28 mb-4"
              />
              <GoldButton
                onClick={() => submitMutation.mutate()}
                size="lg"
                className="w-full"
                disabled={
                  submitMutation.isPending
                  || !text.trim()
                  || (isAdmin ? !customerName.trim() : !appointmentId)
                }
              >
                {submitMutation.isPending ? 'מפרסם...' : 'פרסם ביקורת'}
              </GoldButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
