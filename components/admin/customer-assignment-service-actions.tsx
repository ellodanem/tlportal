"use client";

import {
  AssignmentPauseForm,
  AssignmentResumeForm,
} from "@/components/admin/assignment-pause-resume-actions";
import type { CustomerBillingMode, ServiceAssignmentStatus } from "@prisma/client";

export function CustomerAssignmentServiceActions({
  assignmentId,
  deviceId,
  billingMode,
  status,
  open,
  layout = "stack",
}: {
  assignmentId: string;
  deviceId: string;
  billingMode: CustomerBillingMode;
  status: ServiceAssignmentStatus;
  /** Open assignment (not ended, not cancelled). */
  open: boolean;
  layout?: "stack" | "inline";
}) {
  if (!open) {
    return <span className="text-xs text-zinc-400">—</span>;
  }

  if (status === "suspended") {
    return (
      <AssignmentResumeForm
        assignmentId={assignmentId}
        deviceId={deviceId}
        billingMode={billingMode}
      />
    );
  }

  if (status !== "active") {
    return <span className="text-xs text-zinc-400">—</span>;
  }

  if (layout === "inline") {
    return (
      <details className="group text-xs">
        <summary className="cursor-pointer list-none font-medium text-amber-900 hover:underline dark:text-amber-200 [&::-webkit-details-marker]:hidden">
          Pause service…
        </summary>
        <div className="mt-2 min-w-[12rem] rounded-md border border-zinc-200 bg-zinc-50/90 p-2 dark:border-zinc-700 dark:bg-zinc-950/80">
          <AssignmentPauseForm
            assignmentId={assignmentId}
            deviceId={deviceId}
            billingMode={billingMode}
            compact
          />
        </div>
      </details>
    );
  }

  return (
    <div className="min-w-[10rem]">
      <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Pause service</p>
      <AssignmentPauseForm
        assignmentId={assignmentId}
        deviceId={deviceId}
        billingMode={billingMode}
        compact
      />
    </div>
  );
}
