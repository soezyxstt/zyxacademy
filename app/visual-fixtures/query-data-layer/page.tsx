import { notFound } from "next/navigation";
import { Suspense } from "react";
import { QueryDataFixture } from "./fixture";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Suspense fallback={null}><QueryDataFixture /></Suspense>;
}
