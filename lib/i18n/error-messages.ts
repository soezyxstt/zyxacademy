import type { Locale } from "@/lib/i18n/locale";

export const ERROR_MESSAGES: Record<Locale, {
  title: string;
  body: string;
  retry: string;
  notFoundTitle: string;
  notFoundBody: string;
  home: string;
  back: string;
}> = {
  id: {
    title: "Terjadi kendala sistem",
    body: "Terjadi masalah tak terduga. Coba muat ulang halaman.",
    retry: "Muat ulang halaman",
    notFoundTitle: "Halaman tidak ditemukan",
    notFoundBody: "Periksa alamat halaman atau kembali ke beranda.",
    home: "Ke beranda",
    back: "Kembali",
  },
  en: {
    title: "A system error occurred",
    body: "Something went wrong. Try reloading the page.",
    retry: "Reload page",
    notFoundTitle: "Page not found",
    notFoundBody: "Check the page address or return home.",
    home: "Home",
    back: "Go back",
  },
};

export function getLocaleFromBrowser(): Locale {
  if (typeof document !== "undefined") {
    const cookieValue = document.cookie.split(";").map((item) => item.trim())
      .find((item) => item.startsWith("zyx_locale="))?.split("=", 2)[1];
    if (cookieValue === "en" || cookieValue === "id") return cookieValue;
  }
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("en") ? "en" : "id";
}
