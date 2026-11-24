import {MobileChromeProvider} from "@/components/navigation/mobile-chrome-context";
import {MobileTopNavbar} from "@/components/navigation/mobile-top-navbar";
import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import studentCourse from "@/messages/id/studentCourse.json";
import learning from "@/messages/id/learning.json";
import ui from "@/messages/id/ui.json";
import common from "@/messages/id/common.json";
import core from "@/messages/id/core.json";
import "katex/dist/katex.min.css";

import { article } from "@/tests/fixtures/product-learning/article-production-data";
createRoot(document.getElementById("root")!).render(<MobileChromeProvider><div className="md:hidden"><MobileTopNavbar /></div><NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={{ studentCourse, learning, ui, core, common }}><StructuredArticleReader article={article!} course={{ id: "ma1101", title: "Matematika I" }} adapter={{ ready: true, completed: false, onComplete() {} }} /></NextIntlClientProvider></MobileChromeProvider>);
