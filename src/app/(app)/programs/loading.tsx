import { Skeleton, SkeletonCard, SkeletonPage } from "@/components/ui/skeleton";

/** Loading shell for `/programs` — heading + New button, then the program list. */
export default function ProgramsLoading() {
  return (
    <SkeletonPage>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>

      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} className="gap-2 p-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-56" />
          </SkeletonCard>
        ))}
      </div>
    </SkeletonPage>
  );
}
