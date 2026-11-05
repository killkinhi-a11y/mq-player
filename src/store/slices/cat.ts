// Store slice: Cat mascot.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE_STORE.md.
import type { StoreSlice } from "@/store/types";

export type CatSliceKeys =
  | "setCatEnabled"
  | "setCatFrequency"
  | "setCatMood"
  | "setCatSize"
  | "petCat";

/** Cat mascot. */
export const createCatSlice: StoreSlice<CatSliceKeys> = (set, get) => ({

      // ── Cat mascot actions ──
      setCatEnabled: (enabled) => set({ catEnabled: enabled }),
      setCatFrequency: (freq) => set({ catFrequency: freq }),
      setCatMood: (mood) => set({ catMood: mood }),
      setCatSize: (size) => set({ catSize: size }),
      petCat: () => set((s) => ({ catPetCount: s.catPetCount + 1, catLastSeen: Date.now() })),
});

