import { Skeleton, SkeletonCard, SkeletonPage } from "@/components/ui/skeleton";

/** Loading shell for one past session — back link, title block, exercise cards. */
export default function SessionDetailLoading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-8 w-24 rounded-md" />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>

      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} className="gap-2 p-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
          </SkeletonCard>
        ))}
      </div>
    </SkeletonPage>
  );
}
