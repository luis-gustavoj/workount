import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** Loading shell for `/settings`. `gap-8` matches the real page's section gap. */
export default function SettingsLoading() {
  return (
    <SkeletonPage className="gap-8">
      <Skeleton className="h-7 w-28" />

      <section className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3.5 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </section>
    </SkeletonPage>
  );
}
