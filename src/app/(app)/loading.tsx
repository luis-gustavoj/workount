import { Skeleton, SkeletonCard, SkeletonPage } from "@/components/ui/skeleton";

/**
 * Loading shell for `/` — home.
 *
 * This also serves as the fallback boundary for any `(app)` route that hasn't
 * declared its own, so it deliberately stays generic: a card with an action,
 * then a divided list.
 */
export default function HomeLoading() {
  return (
    <SkeletonPage>
      <SkeletonCard>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </SkeletonCard>

      <section className="flex flex-col gap-3 border-t border-line pt-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-14" />
        </div>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-4 w-16" />
      </section>
    </SkeletonPage>
  );
}
