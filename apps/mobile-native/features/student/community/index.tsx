import { useEffect } from "react";
import {
  communityRoutes,
} from "../../../../../packages/native-parity/student/community/contracts";
import { studentCommunityAlias } from "../../../../../packages/native-parity/student/community/routes";
import type { StudentScreenProps } from "../contracts";
import { AchievementsScreen, PetScreen } from "./achievements";
import { DiscussionsScreen } from "./discussions";
import { ProfileEditorScreen, ProfileScreen, PublicProfileScreen, ReflectionsScreen } from "./profile";
import { CourseLeaderboardScreen, LeaderboardScreen } from "./ranking";
import { CalendarScreen } from "./calendar";
import { GroupsScreen, ScheduleScreen } from "./schedule";
import { BrowserNotificationsScreen, FeedbackScreen, NotificationsScreen, SettingsScreen } from "./settings";
import { CommunityProvider, Copy, Page, useCommunity } from "./ui";

export { communityRoutes };

function CommunityRoute() {
  const { route, replace, tr } = useCommunity();
  const alias = studentCommunityAlias(route.pattern, route.path);
  useEffect(() => { if (alias) replace(alias); }, [alias, replace]);
  if (alias) return null;
  switch (route.pattern) {
    case "/achievements": return <AchievementsScreen />;
    case "/calendar": return <CalendarScreen />;
    case "/courses/[id]/discussions":
    case "/dashboard/discussions": return <DiscussionsScreen />;
    case "/courses/[id]/leaderboard": return <CourseLeaderboardScreen />;
    case "/dashboard/groups": return <GroupsScreen />;
    case "/dashboard/schedule": return <ScheduleScreen />;
    case "/feedback": return <FeedbackScreen />;
    case "/leaderboard": return <LeaderboardScreen />;
    case "/pet": return <PetScreen />;
    case "/profile": return <ProfileScreen />;
    case "/profile/edit": return <ProfileEditorScreen />;
    case "/profile/reflections": return <ReflectionsScreen />;
    case "/settings": return <SettingsScreen />;
    case "/settings/notifications": return <NotificationsScreen />;
    case "/settings/notifications/browser": return <BrowserNotificationsScreen />;
    case "/students/[publicId]": return <PublicProfileScreen />;
    default: return <Page title={tr("Halaman tidak tersedia", "Page unavailable")}><Copy>{tr("Periksa tautan yang Anda buka.", "Check the link you opened.")}</Copy></Page>;
  }
}

/** Student host owns route matching, back stack, verified sessions and the authorized request transport. */
export function CommunityScreen(props: StudentScreenProps) {
  const identity = JSON.stringify([props.session.origin, props.session.userId, props.session.locale, props.route.pattern, props.route.params]);
  return <CommunityProvider props={props}><CommunityRoute key={identity} /></CommunityProvider>;
}
