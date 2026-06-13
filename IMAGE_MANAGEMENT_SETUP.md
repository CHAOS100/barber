# Firebase Image Management

OST BARBER now stores image files in Firebase Storage and image metadata in
Firestore collection `gallery`.

## Current production status

On June 13, 2026, deployment confirmed that project `ost-barber-app` does not
yet have a default Firebase Storage bucket. The Storage API is enabled, but
uploads will fail until the bucket is created.

## Required Firebase setup

1. Open
   <https://console.firebase.google.com/project/ost-barber-app/storage> and
   click **Get Started** to create the default bucket.
2. Confirm Vercel has:
   `VITE_FIREBASE_STORAGE_BUCKET=ost-barber-app.firebasestorage.app`.
3. Deploy the included rules:

   ```bash
   firebase deploy --only storage,firestore:rules --project ost-barber-app
   ```

4. Redeploy Vercel after changing any `VITE_FIREBASE_*` value.

Admin uploads are limited to image content types and files smaller than 10MB.
Only active Firebase admins may upload, replace, or delete files.

## Firestore model

Each `gallery/{imageId}` document contains:

```text
imageUrl
storagePath
title
description
category: gallery | business | barber | service
serviceId (optional)
barberId (optional)
active
createdAt
updatedAt
uploadedBy
```

The customer gallery queries only documents where `active == true`. If old
gallery documents use `url` and `hidden`, edit and save them in the admin image
screen or migrate them to `imageUrl` and `active` before expecting them to
appear publicly.
