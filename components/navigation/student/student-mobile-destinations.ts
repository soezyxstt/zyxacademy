import { BookOpen, CalendarRange, Home, MessageSquareText, UserRound } from "lucide-react";

export const STUDENT_MOBILE_DESTINATIONS = [
  { id: "home", href: "/dashboard", icon: Home, iconName: "Home" },
  { id: "courses", href: "/courses", icon: BookOpen, iconName: "BookOpen" },
  { id: "schedule", href: "/dashboard/schedule", icon: CalendarRange, iconName: "CalendarRange" },
  { id: "discuss", href: "/dashboard/discussions", icon: MessageSquareText, iconName: "MessageSquareText" },
  { id: "me", href: "/profile", icon: UserRound, iconName: "UserRound" },
] as const;
