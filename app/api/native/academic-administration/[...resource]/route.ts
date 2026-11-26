import { handleAdministrationRead } from "@/lib/native/academic/administration/handle-read";
import { administrationReadServices } from "@/lib/native/academic/administration/read-services";

export async function GET(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  return handleAdministrationRead((await context.params).resource, new URL(request.url).searchParams, administrationReadServices);
}
