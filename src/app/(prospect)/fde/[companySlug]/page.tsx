"use client";

import { ProspectPage } from "@/components/prospect/ProspectPage";
import { useParams } from "next/navigation";

export default function ProspectFdePage() {
  const params = useParams<{ companySlug: string }>();
  return <ProspectPage companySlug={params.companySlug} />;
}
