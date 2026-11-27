import { Link, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button, EmptyState } from "../components/ui/primitives";

export default function NotFound() {
  const location = useLocation();

  return (
    <div className="mx-auto max-w-2xl pt-6">
      <EmptyState
        icon={<Compass className="size-6" />}
        title="Page not found"
        description={
          <>
            Nothing is routed at <code className="font-mono text-xs">{location.pathname}</code>. The
            link may be old, or typed wrong.
          </>
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/crm">
              <Button variant="primary">Back to dashboard</Button>
            </Link>
            <Link to="/crm/leads">
              <Button variant="outline">Go to leads</Button>
            </Link>
          </div>
        }
      />
    </div>
  );
}
