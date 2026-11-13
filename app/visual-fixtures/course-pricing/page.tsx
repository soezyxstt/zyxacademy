import { notFound } from "next/navigation";
import { CoursePricingFixture } from "./pricing-fixture";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CoursePricingFixture />;
}
