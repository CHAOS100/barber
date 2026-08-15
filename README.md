# OST BARBER

אפליקציית הייצור של OST BARBER לקביעת תורים ולניהול העסק, בנויה עם React, Vite, Firebase ו-Capacitor.

Firestore הוא מקור האמת היחיד ללקוחות, שירותים, צוות, שעות עבודה, תורים, ביקורות, הודעות ונתוני ניהול. האפליקציה אינה טוענת נתוני דמו ואינה משתמשת ב-`localStorage` כמסד נתונים. אחסון דפדפן משמש רק למצב אימות קצר-חיים ולגשר האימות של Capacitor.

## הרצה מקומית

```bash
npm install
npm run dev
```

יש להגדיר את משתני `VITE_FIREBASE_*` המתאימים. הקוד בודק שה-build מכוון לפרויקט Firebase הצפוי ומסרב לעלות עם תצורה חסרה או לא תקינה.

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

## פריסה

שינוי קוד מקומי אינו מעדכן את סביבת הייצור. לאחר סקירה ואישור נפרדים יש לפרוס, לפי הצורך, את Hosting/Vercel, Cloud Functions, Firestore rules/indexes ו-Storage rules. אין להריץ פקודות seed מול פרויקט הייצור.
