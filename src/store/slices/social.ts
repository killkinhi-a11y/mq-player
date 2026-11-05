// Store slice: Collaborative listening session.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE_STORE.md.
import type { StoreSlice } from "@/store/types";

export type SocialSliceKeys =
  | "setListenSession"
  | "clearListenSession";

/** Collaborative listening session. */
export const createSocialSlice: StoreSlice<SocialSliceKeys> = (set, get) => ({

      // ── Collaborative listening actions ──
      setListenSession: (session) => set({ listenSession: session }),
      clearListenSession: () => set({ listenSession: null }),
});

