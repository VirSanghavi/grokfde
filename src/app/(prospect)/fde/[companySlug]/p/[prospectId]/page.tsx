"use client";

import { ProspectChat } from "@/components/prospect/ProspectChat";
import { useParams } from "next/navigation";

export default function ProspectSessionPage() {
  const params = useParams<{ companySlug: string; prospectId: string }>();
  return (
    <ProspectChat companySlug={params.companySlug} prospectId={params.prospectId} />
  );
}
