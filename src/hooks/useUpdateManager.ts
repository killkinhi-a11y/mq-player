"use client";

/**
 * useUpdateManager — React binding for the singleton UpdateManager.
 * AppShell mounts this once; UpdateBanner reads the same manager.
 */

import { useEffect, useState, useCallback } from "react";
import {
  getUpdateManager,
  type UpdateState,
  type VersionInfo,
} from "@/lib/updateManager";
import { saveUpdateSnapshot } from "@/lib/updateSnapshot";

export interface UpdateManagerSnapshot {
  state: UpdateState;
  info: VersionInfo | null;
  error: string | null;
  availableBuildId: string | null;
  /** User pressed «Обновить» — snapshot + SW update + safe reload */
  applyUpdate: () => void;
  /** User pressed «Позже» */
  dismiss: () => void;
  /** Force a version check now (e.g. devtools / diagnostics) */
  checkNow: () => void;
}

export function useUpdateManager(): UpdateManagerSnapshot {
  const [snap, setSnap] = useState(() => {
    // Direct singleton access (NOT via ref) — refs must not be read during render.
    const m = getUpdateManager(saveUpdateSnapshot);
    const s = m.getState();
    return { state: s.state, info: s.info, error: s.error, availableBuildId: s.availableBuildId };
  });

  useEffect(() => {
    const m = getUpdateManager(saveUpdateSnapshot);
    const unsub = m.subscribe((s) => {
      setSnap({
        state: s.state,
        info: s.info,
        error: s.error,
        availableBuildId: s.availableBuildId,
      });
    });
    // Start once per page: initial check, interval, visibility, chunk errors.
    m.start();
    return unsub;
  }, []);

  const applyUpdate = useCallback(() => {
    void getUpdateManager(saveUpdateSnapshot).applyUpdate();
  }, []);

  const dismiss = useCallback(() => {
    getUpdateManager(saveUpdateSnapshot).dismiss();
  }, []);

  const checkNow = useCallback(() => {
    void getUpdateManager(saveUpdateSnapshot).checkNow("manual");
  }, []);

  return { ...snap, applyUpdate, dismiss, checkNow };
}
