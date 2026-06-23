import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Armchair,
  BadgeCheck,
  Ban,
  Bell,
  Calendar,
  ChevronLeft,
  Clock,
  Coffee,
  CreditCard,
  Info,
  Instagram,
  MessageCircle,
  MessageSquare,
  Navigation,
  PhoneCall,
  Share2,
  Shield,
  ShieldAlert,
  Sparkles,
  Star,
} from 'lucide-react';
import { BARBER_PHOTO, BUSINESS_INFO, isOpenNow } from '../lib/businessConfig';
import { useActiveBarbersRealtime, useActiveServicesRealtime } from '@/hooks/useBookingData';
import { usePublishedReviewsRealtime } from '@/hooks/useReviewsRealtime';
import { usePublishedGalleryRealtime } from '@/hooks/useGalleryRealtime';
import { useCustomerMessages } from '@/hooks/useCustomerMessages';
import StarRating from '../components/ui/StarRating';
import GoldButton from '../components/ui/GoldButton';
import GalTechBadge from '@/components/branding/GalTechBadge';

// ── Notification mini-card (home screen preview) ──────────────────────────────

const HOME_SEVERITY = {
  info: { Icon: Info, iconClass: 'text-[#93E3BD]', bgClass: 'bg-[#93E3BD]/10', borderClass: 'border-[#93E3BD]/20', dotClass: 'bg-[#93E3BD]' },
  success: { Icon: Sparkles, iconClass: 'text-[#93E3BD]', bgClass: 'bg-[#93E3BD]/10', borderClass: 'border-[#93E3BD]/20', dotClass: 'bg-[#93E3BD]' },
  warning: { Icon: AlertTriangle, iconClass: 'text-yellow-400', bgClass: 'bg-yellow-400/10', borderClass: 'border-yellow-400/20', dotClass: 'bg-yellow-400' },
  danger: { Icon: ShieldAlert, iconClass: 'text-red-400', bgClass: 'bg-red-400/10', borderClass: 'border-red-400/20', dotClass: 'bg-red-400' },
};

const HOME_TYPE_ICON = {
  free_slot: Calendar,
  appointment: Calendar,
  payment_request: CreditCard,
  no_show_payment_required: CreditCard,
  block: Ban,
  warning: AlertTriangle,
  broadcast: MessageSquare,
  admin_custom: MessageSquare,
  system: Info,
};

function HomeMessageCard({ msg }) {
  const sev = HOME_SEVERITY[msg.severity] || HOME_SEVERITY.info;
  const DisplayIcon = HOME_TYPE_ICON[msg.type] || sev.Icon;

  return (
    <div className={`rounded-2xl border px-3.5 py-3 flex items-center gap-3 ${sev.bgClass} ${sev.borderClass} ${!msg.isRead ? 'notification-unread-card' : ''}`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${sev.bgClass} border ${sev.borderClass}`}>
        <DisplayIcon className={`w-4 h-4 ${sev.iconClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {!msg.isRead && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sev.dotClass}`} />}
          <span className="font-black text-xs text-foreground truncate">{msg.title}</span>
        </div>
        <p className="text-muted-foreground text-[11px] leading-relaxed line-clamp-1 mt-0.5">
          {msg.message}
        </p>
      </div>
      <ChevronLeft className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </div>
  );
}

const COVER_IMAGE = "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=900&q=90";

const AMENITIES = [
  { Icon: Armchair, label: 'שירותים' },
  { Icon: Coffee, label: 'מתקן שתייה' },
  { Icon: BadgeCheck, label: 'עזרה ראשונה' },
  { Icon: Shield, label: 'מקלט / מ"מ' },
];

const MAP_SRC = "https://maps.google.com/maps?q=%D7%94%D7%A9%D7%95%D7%9E%D7%A8+55+%D7%A8%D7%90%D7%A9%D7%95%D7%9F+%D7%9C%D7%A6%D7%99%D7%95%D7%9F&output=embed&z=16";

const normalizeInstagramUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const username = raw.replace(/^@/, '').replace(/^instagram\.com\//i, '').replace(/^www\.instagram\.com\//i, '');
  return username ? `https://instagram.com/${username}` : '';
};

export default function Home() {
  const navigate = useNavigate();
  const open = isOpenNow();
  const [activeTab, setActiveTab] = useState('info');
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const { data: services } = useActiveServicesRealtime();
  const { data: barbers } = useActiveBarbersRealtime();
  const { reviews } = usePublishedReviewsRealtime();
  const { photos } = usePublishedGalleryRealtime();
  const { messages: customerMessages, unreadCount: msgUnreadCount, isLoggedIn } = useCustomerMessages();
  const previewMessages = customerMessages.slice(0, 3);
  const averageRating = reviews.length
    ? reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length
    : 0;
  const haircutServices = services.filter(s => s.name !== 'עיצוב זקן' && s.name !== 'חבילת פרימיום');
  const beardServices = services.filter(s => s.name === 'עיצוב זקן');
  const premiumServices = services.filter(s => s.name === 'חבילת פרימיום');
  const instagramUrl = normalizeInstagramUrl(
    barbers.find((barber) => barber.instagram_url || barber.instagramUrl || barber.instagramUsername)?.instagram_url
    || barbers.find((barber) => barber.instagram_url || barber.instagramUrl || barber.instagramUsername)?.instagramUrl
    || barbers.find((barber) => barber.instagram_url || barber.instagramUrl || barber.instagramUsername)?.instagramUsername
    || BUSINESS_INFO.instagramUrl
    || BUSINESS_INFO.instagram,
  );

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: 'OST BARBER', url: window.location.href });
    }
  };

  const todayHours = BUSINESS_INFO.hours[new Date().getDay()];
  const todayStr = todayHours?.is_open ? `${todayHours.open}-${todayHours.close}` : 'סגור';

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      {/* Hero Cover */}
      <div className="relative h-72 overflow-hidden">
        <img src={COVER_IMAGE} alt="OST BARBER" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-background" />
        <div className="absolute top-4 left-4">
          <button onClick={handleShare} className="glass p-2.5 rounded-full press-scale">
            <Share2 className="w-5 h-5 text-white" />
          </button>
        </div>
        {/* Category pills on image */}
        <div className="absolute bottom-4 right-4 flex gap-2">
          <span className="glass px-3 py-1 rounded-full text-xs font-bold text-white">ספרות</span>
          <span className="glass px-3 py-1 rounded-full text-xs font-bold text-white">עיצוב זקן</span>
        </div>
        {/* Barber avatar */}
        <div className="absolute bottom-4 left-4">
          <img
            src={BARBER_PHOTO}
            alt="OST Barber"
            className="w-14 h-14 rounded-full border-2 border-primary object-cover gold-shadow"
          />
        </div>
      </div>

      {/* Profile Info */}
      <div className="px-4 pt-4">
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-foreground tracking-tight">OST BARBER</h1>
              <BadgeCheck className="w-6 h-6 text-primary fill-primary/20" />
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <span className="text-primary font-bold text-sm">{averageRating.toFixed(1)}</span>
              <span className="text-muted-foreground text-xs">({reviews.length} ביקורות)</span>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-muted-foreground text-xs">{BUSINESS_INFO.address}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 my-4">
          {/* Waze */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => window.open(BUSINESS_INFO.waze)}
            className="flex-1 glass flex flex-col items-center gap-1.5 py-3 rounded-2xl press-scale border border-border/40"
          >
            <Navigation className="w-7 h-7 text-primary" />
            <span className="text-xs text-foreground font-medium">וייז</span>
          </motion.button>

          {/* WhatsApp */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => window.open(`https://wa.me/${BUSINESS_INFO.whatsapp.replace('+', '')}`)}
            className="flex-1 glass flex flex-col items-center gap-1.5 py-3 rounded-2xl press-scale border border-border/40"
          >
            <MessageCircle className="w-7 h-7 text-primary" />
            <span className="text-xs text-foreground font-medium">וואטסאפ</span>
          </motion.button>

          {/* Phone */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => window.open(`tel:${BUSINESS_INFO.phone}`)}
            className="flex-1 glass flex flex-col items-center gap-1.5 py-3 rounded-2xl press-scale border border-border/40"
          >
            <PhoneCall className="w-7 h-7 text-primary" />
            <span className="text-xs text-foreground font-medium">שיחה</span>
          </motion.button>

          {instagramUrl && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => window.open(instagramUrl, '_blank', 'noopener,noreferrer')}
              className="flex-1 glass flex flex-col items-center gap-1.5 py-3 rounded-2xl press-scale border border-border/40"
            >
              <Instagram className="w-7 h-7 text-primary" />
              <span className="text-xs text-foreground font-medium">אינסטגרם</span>
            </motion.button>
          )}
        </div>

        {/* Customer notifications strip */}
        <AnimatePresence>
          {isLoggedIn && (
            <motion.div
              key="notif-strip"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="overflow-hidden mb-4"
            >
              <div className={`flex items-center justify-between mb-2 ${msgUnreadCount > 0 ? 'notification-alive rounded-2xl px-2 py-1 -mx-2' : ''}`}>
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  <span className="text-sm font-black">הודעות ועדכונים</span>
                  {msgUnreadCount > 0 && (
                    <span className="gold-gradient text-black text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                      {msgUnreadCount}
                    </span>
                  )}
                </div>
                <Link
                  to="/notifications"
                  className="text-primary text-xs font-medium flex items-center gap-0.5"
                >
                  הכל
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Link>
              </div>
              {previewMessages.length === 0 ? (
                <div className="glass premium-empty-state rounded-2xl px-4 py-3 text-center text-xs text-muted-foreground">
                  אין הודעות חדשות כרגע
                </div>
              ) : (
                <div className="space-y-2">
                  {previewMessages.map((msg, i) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.22 }}
                      onClick={() => navigate('/notifications')}
                      className="cursor-pointer press-scale"
                    >
                      <HomeMessageCard msg={msg} />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <div className="flex gap-1 glass rounded-2xl p-1 mb-5">
          {[
            { key: 'info', label: 'מידע כללי' },
            { key: 'services', label: 'תורים' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                activeTab === tab.key ? 'gold-gradient text-black' : 'text-muted-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ─── INFO TAB ─── */}
          {activeTab === 'info' && (
            <motion.div key="info" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>

              {/* About */}
              <div className="mb-5">
                <h2 className="text-base font-black mb-2">על המקום</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  חברים שימו לב: מומלץ להקדים את התור עקב מצוקת חניות באזור!<br />
                  *יש לבחור תור לתספורת במידה ובחרת עם גזירות.<br />
                  *איחורים מעל 10 דקות לא יתקבלו.<br />
                  *במקרה של ביטולים ללא הודעה מראש יידרש 50 אחוז ממחיר התספורת בתור הבא.
                </p>
              </div>

              {/* Opening Hours */}
              <div className="glass rounded-2xl p-4 mb-5">
                <button
                  className="flex items-center justify-between w-full"
                  onClick={() => setHoursExpanded(e => !e)}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <span className={`text-sm font-bold ${open ? 'text-green-400' : 'text-red-400'}`}>
                      {open ? 'פתוח' : 'סגור'}
                    </span>
                    <span className="text-muted-foreground text-sm">{todayStr}</span>
                  </div>
                  <span className="text-muted-foreground text-lg">{hoursExpanded ? '▲' : '▼'}</span>
                </button>
                <AnimatePresence>
                  {hoursExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 space-y-2">
                        {BUSINESS_INFO.hours.map((h) => {
                          const isToday = BUSINESS_INFO.hours.indexOf(h) === new Date().getDay();
                          return (
                            <div key={h.day} className={`flex justify-between items-center text-sm ${isToday ? 'text-primary font-bold' : ''}`}>
                              <span className={isToday ? 'text-primary' : 'text-muted-foreground'}>{h.day}</span>
                              <span className={h.is_open ? (isToday ? 'text-primary' : 'text-foreground') : 'text-muted-foreground/60'}>
                                {h.is_open ? `${h.open}-${h.close}` : 'סגור'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Gallery */}
              <div className="mb-5">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-base font-black">גלריה</h2>
                  <Link to="/gallery" className="text-primary text-sm font-medium flex items-center gap-1">
                    כל הגלריה <ChevronLeft className="w-4 h-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {photos.slice(0, 3).map((photo, i) => (
                    <motion.div
                      key={photo.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.06 }}
                      className="aspect-square rounded-xl overflow-hidden cursor-pointer press-scale"
                      onClick={() => navigate('/gallery')}
                    >
                      <img src={photo.imageUrl || photo.url} alt={photo.title || ''} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                    </motion.div>
                  ))}
                  {photos.length === 0 && (
                    <div className="col-span-3 glass rounded-xl p-4 text-center text-muted-foreground text-xs">עדיין אין תמונות בגלריה</div>
                  )}
                </div>
              </div>

              {/* Reviews */}
              <div className="mb-5">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-base font-black">ביקורות</h2>
                  <Link to="/reviews" className="text-primary text-sm font-medium flex items-center gap-1">
                    כל הביקורות <ChevronLeft className="w-4 h-4" />
                  </Link>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                  {reviews.slice(0, 4).map((review, i) => (
                    <motion.div
                      key={review.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.07 }}
                      className="dark-card rounded-2xl p-4 min-w-[220px] flex-shrink-0"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 gold-gradient rounded-full flex items-center justify-center text-black font-bold text-xs flex-shrink-0">
                          {review.customer_name[0]}
                        </div>
                        <div>
                          <div className="font-bold text-foreground text-xs">{review.customer_name}</div>
                          <StarRating rating={review.rating} size="sm" />
                        </div>
                      </div>
                      <p className="text-muted-foreground text-xs leading-relaxed line-clamp-3">{review.comment}</p>
                    </motion.div>
                  ))}
                  {reviews.length === 0 && (
                    <div className="glass rounded-2xl p-4 min-w-full text-center text-muted-foreground text-xs">עדיין אין ביקורות</div>
                  )}
                </div>
              </div>

              {/* Team */}
              <div className="mb-5">
                <h2 className="text-base font-black mb-3">צוות המקום</h2>
                <div className="dark-card rounded-2xl p-4 flex items-center gap-4">
                  <img src={BARBER_PHOTO} alt="OST" className="w-16 h-16 rounded-full object-cover border-2 border-primary" />
                  <div>
                    <div className="font-bold text-foreground">עומרי סימן טוב</div>
                    <div className="text-muted-foreground text-sm">בעלים</div>
                    <StarRating rating={5} size="sm" />
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="mb-5">
                <h2 className="text-base font-black mb-3">במקום</h2>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {AMENITIES.map((a) => (
                    <div key={a.label} className="dark-card rounded-2xl p-3 flex flex-col items-center gap-1.5">
                      <a.Icon className="w-6 h-6 text-primary" />
                      <span className="text-xs text-muted-foreground text-center leading-tight">{a.label}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl overflow-hidden h-44 relative">
                  <iframe
                    src={MAP_SRC}
                    className="w-full h-full border-0"
                    loading="lazy"
                    title="מפה"
                  />
                  <button
                    onClick={() => window.open(BUSINESS_INFO.waze)}
                    className="absolute bottom-3 left-3 glass-gold px-4 py-2 rounded-xl text-sm font-bold text-primary press-scale"
                  >
                    נווט עם וייז
                  </button>
                </div>
              </div>

            </motion.div>
          )}

          {/* ─── SERVICES TAB ─── */}
          {activeTab === 'services' && (
            <motion.div key="services" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <p className="text-muted-foreground text-sm mb-4">בחר שירות וקבע תור מיידי</p>

              {services.length === 0 && (
                <div className="glass rounded-2xl p-5 text-center text-muted-foreground text-sm mb-5">
                  אין שירותים זמינים כרגע
                </div>
              )}

              {/* Category: תספורות */}
              {haircutServices.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground font-semibold mb-2 px-1">תספורות</p>
                  <div className="space-y-2">
                    {haircutServices.map((service, i) => (
                      <motion.div
                        key={service.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => navigate('/booking', { state: { service } })}
                        className="dark-card rounded-2xl px-4 py-3.5 flex items-center gap-3 cursor-pointer press-scale border border-transparent hover:border-primary/30 transition-all"
                      >
                        <div className="flex-1 text-right">
                          <div className="font-bold text-foreground text-sm">{service.name}</div>
                          <div className="text-muted-foreground text-xs mt-0.5">{service.duration} דק׳ | פתוח לכולם</div>
                        </div>
                        <div className="text-foreground font-black text-sm flex-shrink-0">₪{service.price}</div>
                        <div className="w-7 h-7 rounded-lg border-2 border-border flex items-center justify-center flex-shrink-0">
                          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Category: עיצוב זקן */}
              {beardServices.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground font-semibold mb-2 px-1">עיצוב זקן</p>
                  {beardServices.map((service) => (
                    <motion.div
                      key={service.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => navigate('/booking', { state: { service } })}
                      className="dark-card rounded-2xl px-4 py-3.5 flex items-center gap-3 cursor-pointer press-scale border border-transparent hover:border-primary/30 transition-all"
                    >
                      <div className="flex-1 text-right">
                        <div className="font-bold text-foreground text-sm">{service.name}</div>
                        <div className="text-muted-foreground text-xs mt-0.5">{service.duration} דק׳ | פתוח לכולם</div>
                      </div>
                      <div className="text-foreground font-black text-sm flex-shrink-0">₪{service.price}</div>
                      <div className="w-7 h-7 rounded-lg border-2 border-border flex items-center justify-center flex-shrink-0">
                        <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Category: חבילות */}
              {premiumServices.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs text-muted-foreground font-semibold mb-2 px-1">חבילות פרימיום</p>
                  {premiumServices.map((service) => (
                    <motion.div
                      key={service.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => navigate('/booking', { state: { service } })}
                      className="glass-gold rounded-2xl px-4 py-3.5 flex items-center gap-3 cursor-pointer press-scale border border-primary/30 transition-all"
                    >
                      <div className="flex-1 text-right">
                        <div className="font-bold text-foreground text-sm flex items-center gap-1 justify-end">
                          {service.name} <span className="text-primary text-xs">⭐</span>
                        </div>
                        <div className="text-muted-foreground text-xs mt-0.5">{service.duration} דק׳ | פתוח לכולם</div>
                      </div>
                      <div className="text-primary font-black text-sm flex-shrink-0">₪{service.price}</div>
                      <div className="w-7 h-7 rounded-lg border-2 border-primary/40 flex items-center justify-center flex-shrink-0">
                        <ChevronLeft className="w-4 h-4 text-primary" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-2 pb-4">
          <GoldButton onClick={() => navigate('/booking')} size="lg" className="w-full rounded-2xl shadow-2xl">
          הזמן עכשיו
          </GoldButton>
        </div>

        <div className="auth-galtech-footer pb-4">
          <GalTechBadge variant="auth" />
        </div>
      </div>
    </div>
  );
}
