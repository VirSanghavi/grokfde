"use client";

import { ProspectPage } from "@/components/prospect/ProspectPage";
import { useParams } from "next/navigation";

export default function ProspectSessionPage() {
  const params = useParams<{ companySlug: string; prospectId: string }>();
  return (
    <ProspectPage companySlug={params.companySlug} prospectId={params.prospectId} />
  );
}
