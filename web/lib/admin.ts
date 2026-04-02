export function getAdminUserIds(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_USER_IDS ?? "";
  return raw.split(",").map((x) => x.trim()).filter(Boolean);
}

export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const allowed = getAdminUserIds();
  return allowed.includes(userId);
}
