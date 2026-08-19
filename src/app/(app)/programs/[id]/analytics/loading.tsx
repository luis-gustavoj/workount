import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/**
 * Loading shell for `/programs/[id]/analytics`. The chart blocks are sized to
 * the real charts so the page doesn't jump a screenful when Recharts mounts.
 */
export default function AnalyticsLoading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-8 w-32 rounded-md" />
      <Skeleton className="h-7 w-36" />

      {[0, 1].map((i) => (
        <section key={i} className="flex flex-col gap-3 border-t border-line pt-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3.5 w-52" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </section>
      ))}
    </SkeletonPage>
  );
}
