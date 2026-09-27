import { Suspense } from "react";
import { CaptureBrowser } from "@/components/CaptureBrowser";
import { PageHeader, Spinner } from "@/components/ui";

export const metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Quick captures you haven't filed yet. Open one to decide what it is: payment, expense, deposit or note."
      />
      <Suspense fallback={<Spinner />}>
        <CaptureBrowser fixed={{ filed: "false" }} showFilters={false} />
      </Suspense>
    </>
  );
}
