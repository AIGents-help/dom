import type { ImageLoaderProps } from "next/image";

// Public Supabase assets and signed user-upload URLs are already transformed
// at their source. Serving them directly avoids stripping required URL data.
export function passthroughImageLoader({ src }: ImageLoaderProps) {
  return src;
}
