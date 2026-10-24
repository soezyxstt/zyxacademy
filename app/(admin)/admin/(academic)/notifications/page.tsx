/**
 * app/admin/notifications/page.tsx
 *
 * Admin Push Notification Management Page ; /admin/notifications
 *
 * Features:
 * 1. Compose & Send ; broadcast to All / Course / User with live preview
 * 2. Notification History ; paginated log of all sent notifications
 *
 * Design follows Zyx design system: font-heading/font-sans, semantic color tokens,
 * no rounded-full on non-circular elements, no arbitrary hex colors.
 */

import { pageTitle } from "@/lib/site";
import { getNotificationHistoryAction, getCoursesForTargetingAction } from "./actions";
import { NotificationBroadcastForm } from "./_components/broadcast-form";
import { NotificationHistoryTable } from "./_components/history-table";
import { Bell, History } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata() {
 const t = await getTranslations("adminOps");
 return { title: pageTitle(t("notificationPage.title")), description: t("notificationPage.description") };
}

export default async function AdminNotificationsPage() {
  const [history, courseList] = await Promise.all([
  getNotificationHistoryAction(1, 10),
  getCoursesForTargetingAction(),
  ]);

 return (
 <div className="space-y-4">
  <AdminPageHeader
   icon={Bell}
   title={<TranslatedText namespace="notifications" messageKey="title" />}
  />
 <div className="max-w-3xl">
 {/* Left: Compose form (3/5 width) */}
 <div>
 <div className="mb-3 flex items-center gap-2">
 <Bell className="size-4 text-brand-primary" aria-hidden />
 <h2 className="font-heading text-body-base font-semibold text-foreground">
 <TranslatedText namespace="adminOps" messageKey="notificationPage.compose" />
 </h2>
 </div>
 <NotificationBroadcastForm courses={courseList} />
 </div>

 </div>

 {/* Notification history table */}
 <div>
 <div className="mb-3 flex items-center gap-2">
 <History className="size-4 text-muted-foreground" aria-hidden />
 <h2 className="font-heading text-body-base font-semibold text-foreground">
 <TranslatedText namespace="adminOps" messageKey="notificationPage.history" />
 </h2>
 </div>
  <NotificationHistoryTable history={history.rows} total={history.total} pageSize={10} />
 </div>
 </div>
 );
}
