import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/uploadthing-admin";

export const LEGACY_AUTHORING_RETIRED_CODE = "LEGACY_AUTHORING_CRUD_RETIRED";
export const LEGACY_AUTHORING_RETIRED_MESSAGE =
  "CRUD authoring lama telah dipensiunkan. Gunakan workflow Source Pack, Idea Bundle, dan Product Bundle.";

export async function retiredAdminAuthoringResponse(replacementHref: string) {
  try {
    await assertAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: LEGACY_AUTHORING_RETIRED_CODE,
      message: LEGACY_AUTHORING_RETIRED_MESSAGE,
      replacementHref,
    },
    { status: 410 },
  );
}
