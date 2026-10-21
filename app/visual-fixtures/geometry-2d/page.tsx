import { notFound } from "next/navigation";
import { ProductLearningVisual } from "@/components/course/product-learning-visual";
import { geometryVisualFixture } from "@/tests/fixtures/product-learning/geometry-visual";

export default function Geometry2dFixture() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="mx-auto max-w-prose p-4"><ProductLearningVisual spec={geometryVisualFixture} /></main>;
}
