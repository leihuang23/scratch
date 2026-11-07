import type { ComponentType } from "react";
import { STATUS_ICON_COLOR } from "../../lib/library";
import { cn } from "../../lib/utils";
import {
  StatusActiveIcon,
  StatusCompletedIcon,
  StatusDroppedIcon,
  StatusOnHoldIcon,
} from "../icons";
import type { NoteStatus } from "../../types/note";

const STATUS_ICONS: Record<
  NoteStatus,
  ComponentType<{ className?: string }>
> = {
  active: StatusActiveIcon,
  "on-hold": StatusOnHoldIcon,
  completed: StatusCompletedIcon,
  dropped: StatusDroppedIcon,
};

interface StatusIconProps {
  status: NoteStatus;
  className?: string;
}

/** Colored Inkdrop-style status icon. */
export function StatusIcon({
  status,
  className = "w-3.5 h-3.5",
}: StatusIconProps) {
  const Icon = STATUS_ICONS[status];
  return (
    <Icon
      className={cn("shrink-0", STATUS_ICON_COLOR[status], className)}
    />
  );
}
