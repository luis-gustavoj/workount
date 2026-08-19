import { Skeleton, SkeletonCard, SkeletonPage } from "@/components/ui/skeleton";

/** Loading shell for `/history` — heading, then the session list. */
export default function HistoryLoading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-7 w-28" />

      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} className="gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3.5 w-16" />
            </div>
            <Skeleton className="h-3.5 w-40" />
          </SkeletonCard>
        ))}
      </div>
    </SkeletonPage>
  );
}
