import { NavLink } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

export default function PlatformAdminPage({ section = 'overview' }) {
  return (
    <main className="min-h-[100dvh] bg-background px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <header className="dark-card rounded-3xl p-6">
          <div className="flex items-center gap-3">
            <div className="glass-gold flex h-12 w-12 items-center justify-center rounded-2xl">
              <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ניהול הפלטפורמה</p>
              <h1 className="text-2xl font-black">Platform Admin</h1>
            </div>
          </div>
          <nav className="mt-5 flex gap-2" aria-label="ניהול הפלטפורמה">
            <NavLink to="/platform-admin" end className="glass min-h-11 rounded-xl px-4 py-3 text-sm font-bold">
              סקירה
            </NavLink>
            <NavLink to="/platform-admin/businesses" className="glass min-h-11 rounded-xl px-4 py-3 text-sm font-bold">
              עסקים
            </NavLink>
          </nav>
        </header>

        <section className="dark-card mt-4 rounded-3xl p-6">
          <h2 className="text-xl font-black">{section === 'businesses' ? 'עסקים' : 'סקירת פלטפורמה'}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            מעטפת ההרשאות והניווט מוכנה. כלי יצירה, השעיה וניהול מנויים יתווספו
            בשלב ייעודי דרך פעולות שרת מהימנות.
          </p>
        </section>
      </div>
    </main>
  );
}
