"use client";

import { useEffect } from "react";

export default function OldAppError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // If somehow we end up here, redirect to /play
    window.location.replace("/play?_r=" + Date.now());
  }, []);

  return null;
}
