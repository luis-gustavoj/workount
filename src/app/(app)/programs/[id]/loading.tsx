import { Skeleton, SkeletonCard, SkeletonPage } from "@/components/ui/skeleton";

/** Loading shell for `/programs/[id]` — back link, title block, workout list. */
export default function ProgramDetailLoading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-8 w-28 rounded-md" />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      <Skeleton className="h-9 w-32 rounded-md" />

      <section className="flex flex-col gap-3 border-t border-line pt-5">
        <Skeleton className="h-4 w-20" />
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} className="gap-2 p-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3.5 w-24" />
          </SkeletonCard>
        ))}
      </section>
    </SkeletonPage>
  );
}
