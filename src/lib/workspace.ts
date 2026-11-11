import { cookies } from "next/headers";
import { DEFAULT_BUSINESS, type Business } from "./business";
import { getBusiness } from "./settings";
import { ADMIN_COOKIE, DEMO_WS, WS_COOKIE, adminToken, isWorkspaceId } from "./workspace-id";

export { DEMO_WS, isWorkspaceId } from "./workspace-id";

/** The visitor's workspace, from the cookie the proxy sets. Null outside a browser request. */
export async function currentWorkspace(): Promise<string | null> {
  const value = (await cookies()).get(WS_COOKIE)?.value;
  return isWorkspaceId(value) ? value : null;
}

export async function isAdmin(): Promise<boolean> {
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  return (await cookies()).get(ADMIN_COOKIE)?.value === (await adminToken(key));
}

/** Everyone owns their own workspace; the public demo line's business needs the admin key. */
export async function canEdit(workspace: string): Promise<boolean> {
  return workspace !== DEMO_WS || (await isAdmin());
}

/** The visitor's workspace and its business, for server components. */
export async function currentBusiness(): Promise<{ workspace: string | null; business: Business; editable: boolean }> {
  const workspace = await currentWorkspace();
  if (!workspace) return { workspace: null, business: DEFAULT_BUSINESS, editable: false };
  const [business, editable] = await Promise.all([getBusiness(workspace), canEdit(workspace)]);
  return { workspace, business, editable };
}
