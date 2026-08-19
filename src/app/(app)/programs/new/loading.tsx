import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** Loading shell for `/programs/new` — back link, heading, the create form. */
export default function NewProgramLoading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-8 w-28 rounded-md" />
      <Skeleton className="h-7 w-44" />

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-20 w-full rounded-md" />
        </div>
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
    </SkeletonPage>
  );
}
