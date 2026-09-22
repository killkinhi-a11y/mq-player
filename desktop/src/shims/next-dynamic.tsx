/*
 * next/dynamic shim for the MQ Player desktop client.
 *
 * The web AppShell uses 28 dynamic() calls with { ssr: false, loading } —
 * exactly the subset React.lazy + Suspense covers. The desktop bundle has
 * no SSR at all (ssr:false is a no-op). "loading" in Next can be a
 * component function; render it as the Suspense fallback.
 *
 * Loader shapes used by the web code:
 *   dynamic(() => import("./X"))                              → default export
 *   dynamic(() => import("./X").then(m => m.ShareSheet))      → named export
 * Both resolve to a component — React.lazy accepts either.
 */
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

type DynamicOptions = {
  ssr?: boolean;
  loading?: ComponentType | (() => ReactNode);
};

export default function dynamic<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T } | T>,
  options?: DynamicOptions
): T {
  const Lazy = lazy(async () => {
    const mod = await loader();
    const comp = (mod as { default?: T }).default ?? (mod as T);
    return { default: comp };
  });

  const Wrapped = ((props: any) => {
    const Loading = options?.loading as ComponentType | undefined;
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <Lazy {...props} />
      </Suspense>
    );
  }) as unknown as T;

  // Preserve displayName for debugging parity with next/dynamic.
  const name = (Wrapped as any).displayName || "MQDynamic";
  (Wrapped as any).displayName = `dynamic(${name})`;

  return Wrapped;
}
