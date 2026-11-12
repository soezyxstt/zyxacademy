import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import VerificationPage from "@/app/authoring-verification/page";
import learning from "@/messages/id/learning.json";
import studentCourse from "@/messages/id/studentCourse.json";
import ui from "@/messages/id/ui.json";

createRoot(document.getElementById("root")!).render(<NextIntlClientProvider locale="id" timeZone="UTC" messages={{ learning, studentCourse, ui }}><VerificationPage /></NextIntlClientProvider>);
