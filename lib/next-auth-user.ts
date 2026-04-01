import type { Session } from "next-auth";

/** App user shape derived from NextAuth session (WordPress JWT login). */
export interface AppSessionUser {
  id: number;
  email: string;
  name: string;
  username: string;
  roles: string[];
  customer?: unknown | null;
}

export function sessionToAppUser(session: Session | null): AppSessionUser | null {
  const u = session?.user;
  if (!u) return null;

  const ext = u as Session["user"] & {
    id?: string | number;
    roles?: string[];
  };

  const rawId = ext.id ?? u.email ?? "";
  const id =
    typeof rawId === "number"
      ? rawId
      : /^\d+$/.test(String(rawId))
        ? parseInt(String(rawId), 10)
        : 0;

  const email = u.email || "";
  const name = u.name || "";
  return {
    id,
    email,
    name,
    username: email || name,
    roles: Array.isArray(ext.roles) ? ext.roles : [],
    customer: null,
  };
}
