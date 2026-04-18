---
Task ID: 1
Agent: Main Agent
Task: Fix all messenger bugs reported by user

Work Log:
- Analyzed full messenger codebase: MessengerView.tsx (1829 lines), MessageBubble.tsx (617 lines), API routes
- Fixed SSE endpoint to include messageType, replyToId, edited, voiceUrl, voiceDuration, senderAvatar
- Fixed Messages POST API to accept replyToId, messageType, voiceUrl, voiceDuration
- Fixed Friends GET API to include avatar in response
- Fixed critical sendMessageOptimistic bug where reply content was replaced with JSON
- Fixed handleSaveEdit to keep encrypted content in store
- Fixed context menu: changed from absolute to fixed positioning at cursor coordinates
- Fixed touch handler: removed arbitrary offset, proper cleanup
- Added touchend/contextmenu listeners for context menu dismissal
- Changed heartbeat from 30s to 5s
- Changed status fetch from 60s to 5s
- Fixed voice recording stale closure, added mimeType fallback
- Fixed avatar loading: friend avatars now fetched from API
- Added profile view modal (click avatar in chat header)
- Expanded sticker packs: 12->24 emojis per category, 8-column grid
- Added voice/reply support to group message bubbles
- Improved input area layout

Stage Summary:
- All 14 identified bugs fixed
- 4 files modified: MessengerView.tsx, messages/route.ts, messages/sse/route.ts, friends/route.ts
- Pushed to GitHub as commit f3ae06e
- TypeScript compiles clean for messenger files
