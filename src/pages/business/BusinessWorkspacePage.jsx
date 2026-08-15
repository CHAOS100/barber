import { NavLink } from 'react-router-dom';
import { useBusiness } from '@/components/tenant/BusinessContext';

const sections = [
  ['dashboard', 'לוח בקרה'],
  ['appointments', 'תורים'],
  ['services', 'שירותים'],
  ['staff', 'צוות'],
  ['customers', 'לקוחות'],
  ['settings', 'הגדרות'],
];

export default function BusinessWorkspacePage({ section }) {
  const { business, businessId, membership } = useBusiness();
  const activeSection = sections.find(([key]) => key === section) || sections[0];

  return (
    <main className="min-h-[100dvh] bg-background px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <header className="dark-card rounded-3xl p-5">
          <p className="text-xs text-muted-foreground">מרחב עסקי · {businessId}</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-black">{business?.name || 'עסק'}</h1>
            <span className="glass rounded-full px-3 py-1 text-xs text-primary">
              {membership?.role || 'platform_admin'}
            </span>
          </div>
          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="ניהול העסק">
            {sections.map(([key, label]) => (
              <NavLink
                key={key}
                to={`/business/${businessId}/${key}`}
                className={({ isActive }) => (
                  `min-h-11 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold ${
                    isActive ? 'bg-primary text-black' : 'glass text-muted-foreground'
                  }`
                )}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </header>

        <section className="dark-card mt-4 rounded-3xl p-6">
          <h2 className="text-xl font-black">{activeSection[1]}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            נתיב זה מוגן באמצעות חברות פעילה בעסק. חיבור מסך הניהול הקיים למאגר
            המבודד של העסק יתבצע בשלב ההגירה הייעודי, ללא שימוש באוספים הגלובליים.
          </p>
        </section>
      </div>
    </main>
  );
}
