/*
 * styled-jsx compatibility — the web tree includes `<style jsx global>`
 * elements (Next.js styled-jsx syntax). Next's own type declarations
 * (pulled in via next-env.d.ts on the web) augment the style element
 * with these attributes; the desktop bundle has no Next types, so the
 * same augmentation is declared here.
 */
import "react";

declare module "react" {
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
