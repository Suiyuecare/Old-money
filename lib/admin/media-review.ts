import type {
  AdminMediaAssetStatus,
  AdminRole,
} from "./types";

export interface AdminMediaTransitionSpec {
  readonly fromStatus: AdminMediaAssetStatus;
  readonly toStatus: AdminMediaAssetStatus;
  readonly label: string;
  readonly allowedRoles: readonly AdminRole[];
  readonly requiresRecentAal2: boolean;
  readonly requiresBackupAcknowledgement: boolean;
  readonly requiresReason: boolean;
  readonly destructive: boolean;
}

const transitionSpecs: readonly AdminMediaTransitionSpec[] = [
  {
    fromStatus: "draft",
    toStatus: "review",
    label: "送交審核",
    allowedRoles: ["owner", "merchandiser"],
    requiresRecentAal2: false,
    requiresBackupAcknowledgement: false,
    requiresReason: false,
    destructive: false,
  },
  {
    fromStatus: "review",
    toStatus: "draft",
    label: "退回草稿",
    allowedRoles: ["owner", "merchandiser"],
    requiresRecentAal2: false,
    requiresBackupAcknowledgement: false,
    requiresReason: true,
    destructive: false,
  },
  {
    fromStatus: "review",
    toStatus: "live-approved",
    label: "核准上線",
    allowedRoles: ["owner"],
    requiresRecentAal2: true,
    requiresBackupAcknowledgement: true,
    requiresReason: false,
    destructive: false,
  },
  {
    fromStatus: "live-approved",
    toStatus: "revocation-pending",
    label: "提出撤銷",
    allowedRoles: ["owner"],
    requiresRecentAal2: true,
    requiresBackupAcknowledgement: false,
    requiresReason: true,
    destructive: true,
  },
  {
    fromStatus: "revocation-pending",
    toStatus: "live-approved",
    label: "恢復上線",
    allowedRoles: ["owner"],
    requiresRecentAal2: true,
    requiresBackupAcknowledgement: false,
    requiresReason: true,
    destructive: false,
  },
  {
    fromStatus: "revocation-pending",
    toStatus: "revoked",
    label: "完成撤銷",
    allowedRoles: ["owner"],
    requiresRecentAal2: true,
    requiresBackupAcknowledgement: false,
    requiresReason: true,
    destructive: true,
  },
];

const statusLabels: Readonly<Record<AdminMediaAssetStatus, string>> = {
  draft: "草稿",
  review: "待審核",
  "live-approved": "已核准上線",
  "revocation-pending": "撤銷確認中",
  revoked: "已撤銷",
};

export function getAdminMediaTransitionSpec(
  fromStatus: AdminMediaAssetStatus,
  toStatus: AdminMediaAssetStatus,
): AdminMediaTransitionSpec | null {
  return transitionSpecs.find(
    (spec) => spec.fromStatus === fromStatus && spec.toStatus === toStatus,
  ) ?? null;
}

export function listAdminMediaTransitions(
  fromStatus: AdminMediaAssetStatus,
  role: AdminRole,
): readonly AdminMediaTransitionSpec[] {
  return transitionSpecs.filter(
    (spec) =>
      spec.fromStatus === fromStatus &&
      spec.allowedRoles.includes(role),
  );
}

export function adminMediaStatusLabel(status: AdminMediaAssetStatus): string {
  return statusLabels[status];
}
