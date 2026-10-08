import { createFileRoute } from "@/vault/router-adapter";
import { CompanyFiles } from "@/vault/components/CompanyFiles";

export const Route = createFileRoute("/_app/documents/")({
  component: CompanyFiles,
});

