"use client";

import { ProspectChat } from "@/components/prospect/ProspectChat";
import { useParams } from "next/navigation";

export default function ProspectFdePage() {
  const params = useParams<{ companySlug: string }>();
  return <ProspectChat companySlug={params.companySlug} />;
}
