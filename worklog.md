---
Task ID: 1
Agent: main
Task: Fix all visible problems in mq-player messenger — profile buttons, notifications, now-playing, player UX

Work Log:
- Analyzed uploaded screenshot to understand current UI state
- Read MessengerView.tsx (~2500 lines), ProfileView.tsx, PlayerBar.tsx, NavBar.tsx
- Examined Prisma schema, API routes, Zustand store
- Identified and fixed the following issues:

1. Profile buttons: "Звонок" was replaced with "Невидимка"
   - Restored "Звонок" (Phone) button in user profile modal
   - Moved "Невидимка" toggle to own ProfileView with switch UI
   - ProfileView and MessengerView share hideOnline state via localStorage + StorageEvent

2. Notifications system: complete system was missing
   - Added Notification model to Prisma schema with indexes
   - Created /api/notifications route (GET/POST/PUT/DELETE)
   - Added auto-migration (CREATE TABLE IF NOT EXISTS) for deployment
   - Created NotificationPanel component with slide-in panel UI
   - Server-side notifications for: new messages, friend requests, friend accepted
   - Bell icon with badge count in messenger sidebar
   - Unread count polling every 20s
   - Mark all read, individual read, delete support

3. "Сейчас слушает" real-time: needed page reload
   - Added cache-busting headers (Cache-Control: no-store) to now-playing API
   - Reduced polling interval from 5s to 3s
   - Added timestamp query param for Vercel edge cache bypass

4. Player blocking chat input: touch event conflict
   - Adjusted messenger height calculation for mobile (topNav 4rem, playerBar 5.5rem)
   - Added touch-action: none to PlayerBar to prevent stealing input touch events
   - Added relative z-10 to chat input area

5. Build system:
   - Added postinstall script for prisma generate
   - Updated build script to include prisma generate
   - Both commits pushed to GitHub

Stage Summary:
- All changes pushed to GitHub (killkinhi-a11y/mq-player) in 2 commits
- Build verified successful with `next build`
- Auto-migration ensures Notification table exists on first API call
- Vercel deployment will trigger automatically from push
