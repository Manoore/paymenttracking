import { ScheduleForm } from "@/components/ScheduleForm";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New recurring payment" };

export default function NewSchedulePage() {
  return (
    <>
      <PageHeader title="New recurring payment" subtitle="HOA dues, insurance, utilities: anything that repeats." />
      <ScheduleForm />
    </>
  );
}
