import { Skeleton, SkeletonCard, SkeletonPage } from "@/components/ui/skeleton";

/**
 * Loading shell for the workout builder. The start-session button is part of
 * the skeleton because it sits above the fold and is the most likely reason
 * the user opened this screen.
 */
export default function WorkoutDetailLoading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-8 w-32 rounded-md" />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-20" />
      </div>

      <Skeleton className="h-9 w-36 rounded-md" />

      <section className="flex flex-col gap-3 border-t border-line pt-5">
        <Skeleton className="h-4 w-20" />
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} className="gap-2 p-3">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3.5 w-32" />
          </SkeletonCard>
        ))}
      </section>
    </SkeletonPage>
  );
}
