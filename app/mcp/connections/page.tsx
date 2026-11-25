import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getTranslations } from "@/lib/i18n/server";
import { listOAuthConnections, revokeOAuthConnection } from "@/lib/authoring/mcp-oauth";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

async function disconnect(formData: FormData) {
  "use server";
  const current = await auth.api.getSession({ headers: await headers() });
  if (!current?.user) redirect("/sign-in?next=%2Fmcp%2Fconnections");
  await revokeOAuthConnection(current.user.id, String(formData.get("id") ?? ""));
  revalidatePath("/mcp/connections");
}

export default async function McpConnectionsPage() {
  const current = await auth.api.getSession({ headers: await headers() });
  if (!current?.user) redirect("/sign-in?next=%2Fmcp%2Fconnections");
  const t = await getTranslations("consent.authorize");
  const connections = await listOAuthConnections(current.user.id);
  return (
    <div className="space-y-5">
      <h1 className="font-heading text-h5 font-bold">{t("manageConnections")}</h1>
      {connections.length === 0 ? <p className="text-body-sm text-muted-foreground">{t("connectionsEmpty")}</p> : (
        <div className="divide-y border-y">
          {connections.map(connection => (
            <div key={connection.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="wrap-anywhere font-medium">{connection.name}</p>
                <p className="text-body-xs text-muted-foreground">{t("connectionExpires", { date: connection.expiresAt.toISOString().slice(0, 10) })}</p>
                <p className="wrap-anywhere text-body-xs text-muted-foreground">{connection.scopes.join(", ")}</p>
              </div>
              <form action={disconnect}>
                <input type="hidden" name="id" value={connection.id} />
                <Button variant="outline" size="sm" type="submit">{t("disconnect")}</Button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
