"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CaptureForm } from "@/components/CaptureForm";
import { PageHeader, Spinner } from "@/components/ui";
import type { CaptureType } from "@/lib/types";

const TYPES = ["note", "link", "payment", "expense", "deposit", "document", "place", "idea"];

function NewCapture() {
  const params = useSearchParams();
  // Supports the PWA share target: /new?title=…&text=…&url=…
  const sharedUrl = params.get("url") ?? (params.get("text")?.match(/https?:\/\/\S+/)?.[0] ?? "");
  const type = params.get("type");
  const prefill = {
    ...(type && TYPES.includes(type) ? { type: type as CaptureType } : {}),
    ...(params.get("title") ? { title: params.get("title")! } : {}),
    ...(params.get("text") ? { notes: params.get("text")! } : {}),
    ...(params.get("property") ? { property: params.get("property")! } : {}),
    ...(sharedUrl ? { url: sharedUrl, type: (type as CaptureType) ?? "link" } : {}),
  };
  return <CaptureForm prefill={prefill} />;
}

export default function NewCapturePage() {
  return (
    <>
      <PageHeader title="New capture" subtitle="Save proof now. You can always add details later." />
      <Suspense fallback={<Spinner />}>
        <NewCapture />
      </Suspense>
    </>
  );
}
