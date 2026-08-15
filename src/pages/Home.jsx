import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  Bell,
  Calendar,
  ChevronLeft,
  Clock,
  CreditCard,
  Info,
  Instagram,
  MessageCircle,
  MessageSquare,
  Navigation,
  PhoneCall,
  Share2,
  ShieldAlert,
  Sparkles,
  Star,
} from 'lucide-react';
import { isOpenNow } from '../lib/businessConfig';
import { useActiveBarbersRealtime, useActiveServicesRealtime, useBookingSettingsRealtime, useBusinessSettingsRealtime } from '@/hooks/useBookingData';
import { usePublishedReviewsRealtime } from '@/hooks/useReviewsRealtime';
import { usePublishedGalleryRealtime } from '@/hooks/useGalleryRealtime';
import { useCustomerMessages } from '@/hooks/useCustomerMessages';
import StarRating from '../components/ui/StarRating';
import GoldButton from '../components/ui/GoldButton';
import GalTechBadge from '@/components/branding/GalTechBadge';
import { BUSINESS_BRAND_IMAGE_SRC } from '@/lib/brandAssets';
import { formatILS } from '@/lib/formatters';
import { groupServicesByCategory } from '@/lib/serviceCategories';

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

const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const normalizeInstagramUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const username = raw.replace(/^@/, '').replace(/^instagram\.com\//i, '').replace(/^www\.instagram\.com\//i, '');
  return username ? `https://instagram.com/${username}` : '';
};

const timestampVersion = (timestamp) => (
  timestamp?.toMillis?.()
  || (timestamp?.seconds ? timestamp.seconds * 1000 : '')
  || ''
);

const withImageVersion = (url, timestamp) => {
  const cleanUrl = String(url || '').trim();
  const version = timestampVersion(timestamp);
  if (!cleanUrl || !version) return cleanUrl;
  return `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}v=${version}`;
};

export default function Home() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('info');
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const { data: services } = useActiveServicesRealtime();
  const { data: barbers } = useActiveBarbersRealtime();
  const { reviews } = usePublishedReviewsRealtime();
  const { photos } = usePublishedGalleryRealtime();
  const { messages: customerMessages, unreadCount: msgUnreadCount, isLoggedIn } = useCustomerMessages();
  const { settings: businessSettings, loading: businessSettingsLoading } = useBusinessSettingsRealtime();
  const { settings: bookingSettings } = useBookingSettingsRealtime();
  const workingHours = bookingSettings?.workingHours || [];
  const open = isOpenNow(workingHours);
  const previewMessages = customerMessages.slice(0, 3);
  const averageRating = reviews.length
    ? reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length
    : 0;
  const serviceGroups = groupServicesByCategory(services);
  const liveWaze = String(businessSettings?.waze || '').trim();
  const liveWhatsapp = String(businessSettings?.whatsapp || '').trim();
  const livePhone = String(businessSettings?.phone || '').trim();
  const businessName = String(businessSettings?.name || 'OST BARBER').trim();
  const businessAddress = String(businessSettings?.address || '').trim();
  const instagramUrl = normalizeInstagramUrl(
    businessSettings?.instagram
    || barbers.find((barber) => barber.instagram_url || barber.instagramUrl || barber.instagramUsername)?.instagram_url
    || barbers.find((barber) => barber.instagram_url || barber.instagramUrl || barber.instagramUsername)?.instagramUrl
    || barbers.find((barber) => barber.instagram_url || barber.instagramUrl || barber.instagramUsername)?.instagramUsername,
  );
  const mapSrc = businessAddress
    ? `https://maps.google.com/maps?q=${encodeURIComponent(businessAddress)}&output=embed&z=16`
    : '';
  const heroImageUrl = businessSettingsLoading
    ? ''
    : withImageVersion(businessSettings?.homeHeroImageUrl, businessSettings?.homeHeroImageUpdatedAt);
  const profileImageUrl = businessSettingsLoading
    ? ''
    : withImageVersion(businessSettings?.profileImageUrl, businessSettings?.profileImageUpdatedAt);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: businessName, url: window.location.href });
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.warn('[Home] sharing failed', { name: error?.name || 'unknown' });
        }
      }
    }
  };

  const todayHours = workingHours.find((day) => Number(day.day_of_week) === new Date().getDay());
  const todayStr = todayHours?.is_open
    ? `${todayHours.open_time}-${todayHours.close_time}`
    : 'סגור';

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      {/* Hero Cover */}
      <div className="relative h-72 overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(147,227,189,0.16),transparent_34%),linear-gradient(135deg,#101713_0%,#050706_65%,#0d1110_100%)]">
        {businessSettingsLoading && (
          <div className="absolute inset-0 animate-pulse bg-[linear-gradient(135deg,#101713_0%,#050706_65%,#0d1110_100%)]" />
        )}
        {!businessSettingsLoading && heroImageUrl && (
          <img
            src={heroImageUrl}
            alt="OST BARBER"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-background" />
        <div className="absolute top-4 left-4">
          <button type="button" onClick={handleShare} className="glass min-h-11 min-w-11 p-2.5 rounded-full press-scale" aria-label="שיתוף העסק">
            <Share2 className="w-5 h-5 text-white" />
          </button>
        </div>
        {/* Category pills on image */}
        {serviceGroups.length > 0 && (
          <div className="absolute bottom-4 right-4 flex gap-2">
            {serviceGroups.slice(0, 2).map((group) => (
              <span key={group.category} className="glass px-3 py-1 rounded-full text-xs font-bold text-white">
                {group.category}
              </span>
            ))}
          </div>
        )}
        {/* Barber avatar */}
        <div className="absolute bottom-4 left-4">
          <img
            src={profileImageUrl || BUSINESS_BRAND_IMAGE_SRC}
            alt="OST BARBER"
            className="w-14 h-14 rounded-full border-2 border-primary gold-shadow object-cover bg-secondary"
          />
        </div>
      </div>

      {/* Profile Info */}
      <div className="px-4 pt-4">
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-foreground tracking-tight">{businessName}</h1>
              <BadgeCheck className="w-6 h-6 text-primary fill-primary/20" />
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <span className="text-primary font-bold text-sm">{averageRating.toFixed(1)}</span>
              <span className="text-muted-foreground text-xs">({reviews.length} ביקורות)</span>
               {businessAddress && <span className="text-muted-foreground text-xs">·</span>}
               {businessAddress && <span className="text-muted-foreground text-xs">{businessAddress}</span>}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 my-4">
          {/* Waze */}
          {liveWaze && <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => window.open(liveWaze)}
            className="flex-1 glass flex flex-col items-center gap-1.5 py-3 rounded-2xl press-scale border border-border/40"
          >
            <Navigation className="w-7 h-7 text-primary" />
            <span className="text-xs text-foreground font-medium">וייז</span>
          </motion.button>}

          {/* WhatsApp */}
          {liveWhatsapp && <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => window.open(`https://wa.me/${String(liveWhatsapp || '').replace(/\D/g, '')}`)}
            className="flex-1 glass flex flex-col items-center gap-1.5 py-3 rounded-2xl press-scale border border-border/40"
          >
            <MessageCircle className="w-7 h-7 text-primary" />
            <span className="text-xs text-foreground font-medium">וואטסאפ</span>
          </motion.button>}

          {/* Phone */}
          {livePhone && <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => window.open(`tel:${livePhone}`)}
            className="flex-1 glass flex flex-col items-center gap-1.5 py-3 rounded-2xl press-scale border border-border/40"
          >
            <PhoneCall className="w-7 h-7 text-primary" />
            <span className="text-xs text-foreground font-medium">שיחה</span>
          </motion.button>}

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
                {businessSettings?.description ? (
                  <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                    {businessSettings.description}
                  </p>
                ) : null}
              </div>

              {/* Features / Highlights */}
              {(() => {
                const raw = Array.isArray(businessSettings?.features) ? businessSettings.features : [];
                const displayFeatures = raw
                  .filter(f => f.enabled !== false)
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                if (!displayFeatures.length) return null;
                return (
                  <div className="mb-5">
                    <h2 className="text-base font-black mb-3">מה אנחנו מציעים</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {displayFeatures.map((feature, i) => (
                        <motion.div
                          key={feature.id || i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="dark-card rounded-2xl p-3"
                        >
                          <span className="text-2xl mb-1.5 block">{feature.icon}</span>
                          <div className="font-bold text-sm">{feature.title}</div>
                          <div className="text-muted-foreground text-xs mt-0.5 leading-snug">{feature.description}</div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })()}

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
                        {workingHours.map((h) => {
                          const isToday = Number(h.day_of_week) === new Date().getDay();
                          return (
                            <div key={h.day_of_week} className={`flex justify-between items-center text-sm ${isToday ? 'text-primary font-bold' : ''}`}>
                              <span className={isToday ? 'text-primary' : 'text-muted-foreground'}>{h.day_name || DAY_NAMES_HE[h.day_of_week]}</span>
                              <span className={h.is_open ? (isToday ? 'text-primary' : 'text-foreground') : 'text-muted-foreground/60'}>
                                {h.is_open ? `${h.open_time}-${h.close_time}` : 'סגור'}
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
              {barbers.length > 0 && <div className="mb-5">
                <h2 className="text-base font-black mb-3">צוות המקום</h2>
                <div className="space-y-2">
                  {barbers.map((barber) => (
                    <div key={barber.id} className="dark-card rounded-2xl p-4 flex items-center gap-4">
                      {barber.photo_url ? (
                        <img src={barber.photo_url} alt={barber.name} className="w-16 h-16 rounded-full border-2 border-primary object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-16 h-16 rounded-full border-2 border-primary gold-gradient text-black font-black flex items-center justify-center flex-shrink-0">
                          {String(barber.name || '?').slice(0, 2)}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-foreground">{barber.name}</div>
                        {barber.specialties?.length > 0 && (
                          <div className="text-muted-foreground text-sm">{barber.specialties.join(' • ')}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>}

              {/* Location */}
              {(mapSrc || liveWaze) && <div className="mb-5">
                <h2 className="text-base font-black mb-3">מיקום</h2>
                <div className="rounded-2xl overflow-hidden h-44 relative">
                  {mapSrc && <iframe
                    src={mapSrc}
                    className="w-full h-full border-0"
                    loading="lazy"
                    title="מפה"
                  />}
                  {liveWaze && <button
                    onClick={() => window.open(liveWaze)}
                    className="absolute bottom-3 left-3 glass-gold px-4 py-2 rounded-xl text-sm font-bold text-primary press-scale"
                  >
                    נווט עם וייז
                  </button>}
                </div>
              </div>}

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

              {serviceGroups.map((group, groupIndex) => (
                <div key={group.category} className={groupIndex === serviceGroups.length - 1 ? 'mb-6' : 'mb-4'}>
                  <p className="text-xs text-muted-foreground font-semibold mb-2 px-1">{group.category}</p>
                  <div className="space-y-2">
                    {group.services.map((service, serviceIndex) => (
                    <motion.div
                      key={service.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (groupIndex * 0.03) + (serviceIndex * 0.05) }}
                      onClick={() => navigate('/booking', { state: { service } })}
                      className="dark-card rounded-2xl px-4 py-3.5 flex items-center gap-3 cursor-pointer press-scale border border-transparent hover:border-primary/30 transition-all"
                    >
                      <div className="flex-1 text-right">
                        <div className="font-bold text-foreground text-sm">{service.name}</div>
                        <div className="text-muted-foreground text-xs mt-0.5">{service.duration} דק׳ | פתוח לכולם</div>
                      </div>
                      <div className="text-foreground font-black text-sm flex-shrink-0">{formatILS(service.price)}</div>
                      <div className="w-7 h-7 rounded-lg border-2 border-border flex items-center justify-center flex-shrink-0">
                        <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </motion.div>
                    ))}
                  </div>
                </div>
              ))}
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
