import { ScheduleForm } from "@/components/ScheduleForm";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New recurring payment" };

export default async function NewSchedulePage({ searchParams }: PageProps<"/recurring/new">) {
  const { property } = await searchParams;
  return (
    <>
      <PageHeader title="New recurring payment" subtitle="HOA dues, insurance, utilities: anything that repeats." />
      <ScheduleForm initialProperty={typeof property === "string" ? property : undefined} />
    </>
  );
}
