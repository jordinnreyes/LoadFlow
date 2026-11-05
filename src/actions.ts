import type { Workspace } from "./model";
export type Propose = (
  next: Workspace,
  reason: string,
  options?: {
    scope?: string;
    preserveGroup?: string;
    immediate?: boolean;
    confirmLabel?: string;
  },
) => void;
