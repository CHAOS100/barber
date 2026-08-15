import { Link } from 'react-router-dom';
import { Building2, CalendarDays, MapPin, Phone } from 'lucide-react';
import { useBusiness } from '@/components/tenant/BusinessContext';

export default function TenantPublicLanding() {
  const { business, businessSlug, loading, error } = useBusiness();

  if (loading) return null;

  if (error || !business) {
    return (
      <main className="min-h-[100dvh] bg-background flex items-center justify-center px-5" dir="rtl">
        <section className="dark-card w-full max-w-md rounded-3xl p-7 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-black">העסק לא נמצא</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            כתובת העסק אינה קיימת או שהעסק אינו זמין כרגע.
          </p>
          <Link to="/" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-black text-black">
            חזרה
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main
      className="min-h-[100dvh] bg-background px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]"
      dir="rtl"
      style={{ '--tenant-accent': business.accentColor }}
    >
      <section className="mx-auto max-w-3xl">
        <div className="dark-card overflow-hidden rounded-3xl">
          {business.coverUrl && (
            <img src={business.coverUrl} alt="" className="h-52 w-full object-cover" />
          )}
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-4">
              {business.logoUrl ? (
                <img src={business.logoUrl} alt={business.name} className="h-16 w-16 rounded-2xl object-cover" />
              ) : (
                <div className="glass flex h-16 w-16 items-center justify-center rounded-2xl">
                  <Building2 className="h-7 w-7" style={{ color: business.accentColor }} aria-hidden="true" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">/{businessSlug}</p>
                <h1 className="truncate text-2xl font-black">{business.name}</h1>
              </div>
            </div>

            {business.description && (
              <p className="mt-5 leading-7 text-muted-foreground">{business.description}</p>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {business.phone && (
                <div className="glass flex items-center gap-3 rounded-2xl p-4">
                  <Phone className="h-5 w-5" style={{ color: business.accentColor }} aria-hidden="true" />
                  <span>{business.phone}</span>
                </div>
              )}
              {business.address && (
                <div className="glass flex items-center gap-3 rounded-2xl p-4">
                  <MapPin className="h-5 w-5" style={{ color: business.accentColor }} aria-hidden="true" />
                  <span>{business.address}</span>
                </div>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
              <CalendarDays className="mx-auto h-7 w-7" style={{ color: business.accentColor }} aria-hidden="true" />
              <p className="mt-2 font-black">עמוד העסק מוכן לחיבור מערכת ההזמנות</p>
              <p className="mt-1 text-sm text-muted-foreground">
                שירותים, צוות וזמינות יחוברו לנתוני העסק בשלב ההגירה הבא.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
