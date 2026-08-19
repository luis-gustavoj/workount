import { cn } from "@/lib/utils";

/**
 * A placeholder block, shaped like the content that will replace it.
 *
 * These exist so a navigation *paints* immediately. Next's App Router holds
 * the previous screen on the display until the next route's server render
 * resolves — unless the segment has a `loading.tsx`, which is what these
 * compose. Without one, a tap looks like it did nothing and then the screen
 * jumps; the data isn't slower, the feedback is just missing.
 *
 * The shapes matter as much as the shimmer: a skeleton that matches the real
 * layout lets content swap in place instead of reflowing under the thumb.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // `bg-raised` rather than a shimmer gradient: the app is dark-only
      // (DESIGN.md) and a pulsing raised surface reads as "pending" without
      // inventing a colour that exists nowhere else.
      className={cn("animate-pulse rounded-md bg-raised", className)}
      {...props}
    />
  );
}

/**
 * The page shell every `loading.tsx` renders into — same max width, padding
 * and gap as the `<main>` of a real screen, so nothing shifts horizontally
 * when the content arrives.
 */
function SkeletonPage({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      // aria-hidden: a screen reader should hear the real page when it lands,
      // not a description of grey rectangles. `aria-busy` on the wrapper is
      // what actually announces the wait.
      aria-busy="true"
      className={cn(
        "mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 py-8",
        className,
      )}
      {...props}
    />
  );
}

/** A card-shaped placeholder, matching `<Card>`'s radius and ring. */
function SkeletonCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton, SkeletonCard, SkeletonPage };
