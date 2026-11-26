import { createTranslator } from "next-intl";
import marketing from "@/messages/id/marketing.json";
export async function getAppLocale() { return "id"; }
export async function getTranslations(namespace: string) { return createTranslator({ locale: "id", messages: { marketing }, namespace, timeZone: "UTC" }); }
