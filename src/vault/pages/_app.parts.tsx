import { createFileRoute } from "@/vault/router-adapter";
import { PipelineDrawings } from "@/vault/components/PipelineDrawings";

export const Route = createFileRoute("/_app/parts")({
  component: PipelineDrawings,
});

