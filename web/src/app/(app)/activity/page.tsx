import { Suspense } from "react";
import { CaptureBrowser } from "@/components/CaptureBrowser";
import { PageHeader, Spinner } from "@/components/ui";

export const metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <>
      <PageHeader title="Activity" subtitle="Everything you've saved. Search by who, what, when, property or trip." />
      <Suspense fallback={<Spinner />}>
        <CaptureBrowser />
      </Suspense>
    </>
  );
}
