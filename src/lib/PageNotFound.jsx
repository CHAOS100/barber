import { Link, useLocation } from 'react-router-dom';

export default function PageNotFound() {
  const location = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background" dir="rtl">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-7xl font-light text-muted-foreground">404</h1>
          <div className="h-0.5 w-16 bg-border mx-auto" />
        </div>
        <div className="space-y-3">
          <h2 className="text-2xl font-bold">העמוד לא נמצא</h2>
          <p className="text-muted-foreground">
            הנתיב <span className="font-medium text-foreground">{location.pathname}</span> אינו קיים באפליקציה.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex items-center px-5 py-2.5 text-sm font-bold text-black gold-gradient rounded-xl"
        >
          חזרה לדף הבית
        </Link>
      </div>
    </div>
  );
}
