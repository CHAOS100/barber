# Appointment SaaS platform foundation

ענף זה מכיל את תשתית המעבר מאפליקציית OST BARBER החד-עסקית לפלטפורמת תורים מרובת עסקים. OST BARBER נשמר כתוכן העסק הראשון וכמשטח התאימות הקיים; נתוני הייצור והנתיבים הישנים אינם עוברים אוטומטית למודל החדש.

מסמך הארכיטקטורה, מיפוי ההנחות ותוכנית השלבים נמצא ב-[docs/multi-tenant-foundation.md](docs/multi-tenant-foundation.md).

Firestore הוא מקור האמת היחיד ללקוחות, שירותים, צוות, שעות עבודה, תורים, ביקורות, הודעות ונתוני ניהול. האפליקציה אינה טוענת נתוני דמו ואינה משתמשת ב-`localStorage` כמסד נתונים. אחסון דפדפן משמש רק למצב אימות קצר-חיים ולגשר האימות של Capacitor.

## הרצה מקומית

```bash
npm install
npm run dev
```

יש להגדיר את משתני `VITE_FIREBASE_*` המתאימים. ניתן להגדיר גם `VITE_FIREBASE_EXPECTED_PROJECT_ID` ו-`VITE_FIREBASE_EXPECTED_API_KEY` כדי לגרום ל-build להיכשל אם הוזנו פרטי פרויקט שגוי. אין לחבר ענף זה לפרויקט Firebase חדש ללא תצורה מפורשת ואישור.

## בדיקות

```bash
npm run build
npm run lint
npm run typecheck
npm run test:scheduling
npm run test:notification-jobs
npm run test:firestore-rules
```

## ארכיטקטורת ייצור

- כתיבות רגישות של תורים, החלפות מועד, ביקורות ורשימת המתנה עוברות דרך Cloud Functions.
- הרשאת מנהל דורשת Firebase Auth ובנוסף מסמך `admins/{uid}` עם `role: "admin"` ו-`active: true`.
- חישוב זמינות מבוסס על `settings/booking`, שירותים, ספרים, חסימות ותורים שמורים ב-Firestore.
- מניעת הזמנה כפולה ומגבלת תור פעיל אחד נאכפות בטרנזקציות בצד השרת.
- התראות עסקיות נרשמות כ-`notificationJobs`; Push הוא הערוץ הפעיל. שליחת WhatsApp עסקית אינה מדומה ואינה מופעלת ללא ספק אמיתי.

## תשתית מרובת עסקים

- נתונים חדשים ממוקמים תחת `businesses/{businessId}`.
- הרשאות עסק מבוססות על `businesses/{businessId}/members/{uid}` ולא על פרמטר URL או תפקיד גלובלי.
- מנהלי פלטפורמה מאומתים דרך `platformAdmins/{uid}`.
- מתאמי הנתיבים החדשים דורשים `businessId` מפורש ואין להם עסק ברירת מחדל.
- הנתיבים והמאגר החדשים עדיין אינם מחליפים את מאגרי הייצור הישנים.

## פריסה

שינוי קוד מקומי אינו מעדכן את סביבת הייצור. לאחר סקירה ואישור נפרדים יש לפרוס, לפי הצורך, את Hosting/Vercel, Cloud Functions, Firestore rules/indexes ו-Storage rules. אין להריץ פקודות seed מול פרויקט הייצור.
