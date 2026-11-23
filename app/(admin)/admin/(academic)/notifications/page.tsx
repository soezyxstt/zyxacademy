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
import { NotificationsLayout } from "./_components/notifications-layout";
import { Bell } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata() {
 const t = await getTranslations("adminOps");
 return { title: pageTitle(t("notificationPage.title")), description: t("notificationPage.description") };
}

export default async function AdminNotificationsPage() {
  const [t, history, courseList] = await Promise.all([
    getTranslations("adminOps"),
    getNotificationHistoryAction(1, 10),
    getCoursesForTargetingAction(),
  ]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        icon={Bell}
        title={<TranslatedText namespace="notifications" messageKey="title" />}
      />
      <NotificationsLayout
        composeLabel={t("notificationPage.compose")}
        historyLabel={t("notificationPage.history")}
        composeContent={<NotificationBroadcastForm courses={courseList} />}
        historyContent={
          <NotificationHistoryTable
            history={history.rows}
            total={history.total}
            pageSize={10}
          />
        }
      />
    </div>
  );
}
