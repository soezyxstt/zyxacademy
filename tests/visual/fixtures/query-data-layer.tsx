import React from "react";
import "katex/dist/katex.min.css";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import learning from "@/messages/id/learning.json";
import studentCourse from "@/messages/id/studentCourse.json";
import ui from "@/messages/id/ui.json";
import core from "@/messages/id/core.json";
import { QueryProvider } from "@/components/providers/query-provider";
import { QueryDataFixture } from "@/app/visual-fixtures/query-data-layer/fixture";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import { AppToaster } from "@/components/app-toaster";
import { sourceArticle } from "./query-article-data";

const params = new URLSearchParams(window.location.search);
const surface = params.get("surface");
const reader = <StructuredArticleReader article={sourceArticle} course={{ id: "matematika-1", title: "Matematika I" }} mode={params.get("preview") === "1" ? "admin-preview" : "learner"} />;
const content = surface === "article" ? reader : <QueryDataFixture />;
const root = createRoot(document.getElementById("root")!);
declare global { interface Window { unmountQueryFixture: () => void } }
window.unmountQueryFixture = () => root.unmount();
root.render(
  <NextIntlClientProvider locale="id" timeZone="UTC" messages={{ learning, studentCourse, ui, core }}>
    {params.get("preview") === "1" ? content : <QueryProvider>{content}</QueryProvider>}
    <AppToaster />
  </NextIntlClientProvider>,
);
