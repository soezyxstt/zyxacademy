import { redirect } from "next/navigation";

export default function LegacyAuthoringContextPage() {
  redirect("/admin/courses");
}
