import { BookOpen, CalendarRange, Home, MessageSquareText, UserRound } from "lucide-react";
import { studentMobileHrefs } from "./student-mobile-hrefs.mjs";

export const STUDENT_MOBILE_DESTINATIONS = [
  { id: "home", href: studentMobileHrefs.home, icon: Home, iconName: "Home" },
  { id: "courses", href: studentMobileHrefs.courses, icon: BookOpen, iconName: "BookOpen" },
  { id: "schedule", href: studentMobileHrefs.schedule, icon: CalendarRange, iconName: "CalendarRange" },
  { id: "discuss", href: studentMobileHrefs.discuss, icon: MessageSquareText, iconName: "MessageSquareText" },
  { id: "me", href: studentMobileHrefs.me, icon: UserRound, iconName: "UserRound" },
] as const;
