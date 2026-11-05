import Link from "next/link";
import { Mail, GraduationCap, CalendarDays, User2, ShieldCheck, ClipboardList, Edit3 } from "lucide-react";
import { ShellPage } from "@/components/shell-page";
import { ProfileAvatar } from "@/app/(student)/profile/profile-avatar";
import { FormattedDate } from "@/components/ui/formatted-date";
import { TranslatedText } from "@/components/i18n/translated-text";
type ProfileData = {
 href?: (path: string) => string;
 user: { name: string; email: string; image?: string | null; role?: string | null; createdAt: Date; lastActivityAt?: Date | null };
 activeEnrollments: { id: string; title: string; category?: string | null; enrolledAt: Date }[];
 completedCount: number; submissionCount: number; averageScore: number | null;
 userGroups: { id: string; name: string; joinedAt: Date }[];
 studentBookings: { id: string; courseTitle: string; tutorName: string; dayOfWeek: string; startTime: string; endTime: string }[];
 dbUser: { faculty?: string | null; major?: string | null; entryYear?: number | null } | null;
};
export function StudentProfileView({ href = (path: string) => path,  user, activeEnrollments, completedCount, submissionCount, averageScore, userGroups, studentBookings, dbUser }: ProfileData) {

 return (
 <ShellPage title={<TranslatedText namespace="student" messageKey="profile.pageTitle" />}>
 <div className="w-full pb-12">
 {/* Profile Header */}
 <div className="flex items-start gap-4 sm:gap-6">
 <div className="relative size-16 sm:size-20 shrink-0">
 <ProfileAvatar image={user.image} name={user.name} />
 <span
 className="absolute bottom-1 right-1 flex size-4 items-center justify-center rounded-full bg-status-success ring-2 ring-background"
 aria-hidden="true"
 />
 <TranslatedText namespace="student" messageKey="profile.googleAccountActive" as="span" className="sr-only" />
 </div>

 <div className="flex-1 min-w-0">
 <span className="inline-flex items-center gap-1 rounded-md border border-brand-primary/20 bg-brand-primary/5 px-2.5 py-0.5 text-[10px] font-semibold text-brand-primary uppercase tracking-wider">
 {user.role === "student" || !user.role ? <TranslatedText namespace="student" messageKey="profile.roleStudent" />
   : user.role === "tutor" ? <TranslatedText namespace="student" messageKey="profile.roleTutor" />
   : user.role === "teacher" ? <TranslatedText namespace="student" messageKey="profile.roleTeacher" />
   : user.role === "admin" ? <TranslatedText namespace="student" messageKey="profile.roleAdmin" />
   : user.role}
 </span>

 <h2 className="font-heading text-h5 font-bold tracking-tight text-foreground mt-2 break-words">
 {user.name}
 </h2>

 <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-body-sm text-muted-foreground">
 <span className="flex items-center gap-1.5 min-w-0">
 <Mail className="size-4 text-muted-foreground/75 shrink-0" />
 <span className="break-all">{user.email}</span>
 </span>
 <span className="flex items-center gap-1.5 text-status-success font-medium shrink-0">
 <ShieldCheck className="size-4 shrink-0" />
 <TranslatedText namespace="student" messageKey="profile.googleConnected" />
 </span>
 <Link
 href={href("/profile/edit")}
 className="flex items-center gap-1.5 text-brand-primary font-semibold hover:underline shrink-0"
 >
 <Edit3 className="size-4 shrink-0" />
 <TranslatedText namespace="student" messageKey="profile.editProfile" />
 </Link>
 <Link
 href={href("/profile/reflections")}
 className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground font-medium hover:underline shrink-0"
 >
 <ClipboardList className="size-4 shrink-0" />
 <TranslatedText namespace="student" messageKey="profile.reflections" />
 </Link>
 </div>
 </div>
 </div>

 {/* Stats Section: Cardless, Dividers Grid */}
 <div className="rounded-xl border border-border bg-card p-4 my-5 grid grid-cols-2 md:grid-cols-4 gap-4">
 <div className="flex flex-col items-start md:px-4 first:pl-0">
 <span className="font-heading text-h5 font-bold text-brand-primary">
 {activeEnrollments.length}
 </span>
 <span className="text-body-xs font-medium text-muted-foreground mt-1">
 <TranslatedText namespace="student" messageKey="profile.activeClassesStat" />
 </span>
 </div>

 <div className="flex flex-col items-start md:px-4">
 <span className="font-heading text-h5 font-bold text-brand-primary">
 {completedCount}
 </span>
 <span className="text-body-xs font-medium text-muted-foreground mt-1">
 <TranslatedText namespace="student" messageKey="profile.completedMaterialsStat" />
 </span>
 </div>

 <div className="flex flex-col items-start md:px-4">
 <span className="font-heading text-h5 font-bold text-brand-primary">
 {submissionCount}
 </span>
 <span className="text-body-xs font-medium text-muted-foreground mt-1">
 <TranslatedText namespace="student" messageKey="profile.completedExamsStat" />
 </span>
 </div>

 <div className="flex flex-col items-start md:px-4 last:pr-0">
 <span className="font-heading text-h5 font-bold text-brand-secondary">
 {averageScore !== null ? `${averageScore}%` : "-"}
 </span>
 <span className="text-body-xs font-medium text-muted-foreground mt-1">
 <TranslatedText namespace="student" messageKey="profile.averageScoreStat" />
 </span>
 </div>
 </div>

      {/* Main Content Info Row */}
      <div className="grid gap-6 lg:grid-cols-12 mt-6">
        {/* Left Side: Learning and Bookings */}
        <div className="lg:col-span-7 space-y-6">
          {/* Active Classes list */}
          <div>
            <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-4">
              <GraduationCap className="size-5 text-brand-primary shrink-0" />
              <TranslatedText namespace="student" messageKey="profile.enrolledClasses" />
            </h3>
            {activeEnrollments.length > 0 ? (
              <div className="divide-y divide-border/60">
                {activeEnrollments.map((course) => (
                  <div key={course.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4 border-b border-border/40 last:border-b-0 text-left">
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2 flex-wrap text-left">
                        <span className="inline-flex rounded-md bg-brand-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-brand-primary uppercase tracking-wider ring-1 ring-brand-primary/20">
                          {course.category}
                        </span>
                        <span className="text-body-xs text-muted-foreground">
                          <TranslatedText namespace="student" messageKey="profile.enrolledDate" />{" "}
                          <FormattedDate date={course.enrolledAt} options={{ dateStyle: "medium" }} />
                        </span>
                      </div>
                      <h4 className="font-heading text-body-sm font-semibold text-foreground mt-1.5 break-words text-left">
                        {course.title}
                      </h4>
                    </div>
                    <Link
                      href={href(`/courses/${course.id}`)}
                      className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-body-sm font-semibold text-foreground hover:bg-muted/70 hover:border-border-strong transition-colors h-8 shrink-0"
                    >
                      <TranslatedText namespace="student" messageKey="profile.openClass" />
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground py-2 italic border-t border-border/40">
                <TranslatedText namespace="student" messageKey="profile.noActiveClasses" />
              </p>
            )}
          </div>

          {/* Bookings list */}
          <div className="border-t border-border/60 pt-6">
            <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-4">
              <CalendarDays className="size-5 text-brand-secondary shrink-0" />
              <TranslatedText namespace="student" messageKey="profile.upcomingTutorials" />
            </h3>
            {studentBookings.length > 0 ? (
              <div className="divide-y divide-border/60">
                {studentBookings.map((booking) => (
                  <div key={booking.id} className="flex items-start gap-3 py-3">
                    <div className="size-8 shrink-0 flex items-center justify-center rounded bg-brand-secondary/10 text-brand-secondary">
                      <User2 className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-body-sm font-semibold text-foreground break-words">
                        <TranslatedText namespace="student" messageKey="profile.tutorialCourse" values={{ course: booking.courseTitle }} />
                      </h4>
                      <p className="text-body-xs text-muted-foreground mt-0.5 break-words">
                        <TranslatedText namespace="student" messageKey="profile.tutor" /> <span className="font-medium text-foreground">{booking.tutorName}</span>
                      </p>
                      <p className="text-body-xs font-semibold text-brand-secondary mt-2 flex items-center gap-1">
                        <span className="capitalize">{booking.dayOfWeek}</span>, {booking.startTime} - {booking.endTime}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground py-2 italic">
                <TranslatedText namespace="student" messageKey="profile.noTutorialsThisWeek" />
              </p>
            )}
          </div>
        </div>

        {/* Right Side: Account details and groups */}
        <div className="lg:col-span-5 space-y-6">
          {/* ITB Academic Profile */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-body-base font-bold text-foreground">
                <TranslatedText namespace="student" messageKey="profile.itbAcademicProfile" />
              </h3>
              <Link
                href={href("/profile/edit")}
                className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
              >
                <Edit3 className="size-3.5" />
                <TranslatedText namespace="student" messageKey="profile.editProfile" />
              </Link>
            </div>
            <dl className="text-body-sm divide-y divide-border/40 border-t border-border/40 zebra-no-rows">
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-muted-foreground"><TranslatedText namespace="student" messageKey="profile.facultyOrSchool" /></dt>
                <dd className="font-semibold text-foreground text-right">
                  {dbUser?.faculty || <span className="text-muted-foreground font-normal italic"><TranslatedText namespace="student" messageKey="profile.notProvided" /></span>}
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-muted-foreground"><TranslatedText namespace="student" messageKey="profile.majorOrProgram" /></dt>
                <dd className="font-semibold text-foreground text-right">
                  {dbUser?.major || <span className="text-muted-foreground font-normal italic"><TranslatedText namespace="student" messageKey="profile.notProvided" /></span>}
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-muted-foreground"><TranslatedText namespace="student" messageKey="profile.entryYear" /></dt>
                <dd className="font-semibold text-foreground text-right">
                  {dbUser?.entryYear ? `${dbUser.entryYear}` : <span className="text-muted-foreground font-normal italic"><TranslatedText namespace="student" messageKey="profile.notProvided" /></span>}
                </dd>
              </div>
            </dl>
          </div>

          {/* Google Identity info */}
          <div>
            <h3 className="font-heading text-body-base font-bold text-foreground mb-3">
              <TranslatedText namespace="student" messageKey="profile.googleAccount" />
            </h3>
            <dl className="text-body-sm divide-y divide-border/40 border-t border-border/40 zebra-no-rows">
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-muted-foreground"><TranslatedText namespace="student" messageKey="profile.accountRelationship" /></dt>
                <dd className="font-semibold text-foreground flex items-center gap-1.5">
                  <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                  </svg>
                  Google
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-muted-foreground"><TranslatedText namespace="student" messageKey="profile.emailStatus" /></dt>
                <dd className="font-semibold text-status-success">
                  <TranslatedText namespace="student" messageKey="profile.verified" />
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-muted-foreground"><TranslatedText namespace="student" messageKey="profile.registeredDate" /></dt>
                <dd className="font-semibold text-foreground">
                  <FormattedDate date={user.createdAt} options={{ dateStyle: "long" }} />
                </dd>
              </div>
              {user.lastActivityAt && (
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-muted-foreground"><TranslatedText namespace="student" messageKey="profile.lastActivity" /></dt>
                  <dd className="font-semibold text-foreground">
                    <FormattedDate date={user.lastActivityAt} options={{ dateStyle: "medium", timeStyle: "short" }} />
                  </dd>
                </div>
              )}
            </dl>
          </div>

 {/* Groups list */}
 <div>
 <h3 className="font-heading text-body-base font-semibold text-foreground mb-4">
 <TranslatedText namespace="student" messageKey="profile.groupsTitle" />
 </h3>
 {userGroups.length > 0 ? (
 <div className="divide-y divide-border/40 border-t border-border/40 zebra-no-rows">
 {userGroups.map((grp) => (
 <div key={grp.id} className="py-3 flex items-center justify-between gap-4">
 <span className="font-semibold text-body-sm text-foreground">
 {grp.name}
 </span>
 <span className="text-body-xs text-muted-foreground">
                  <TranslatedText namespace="student" messageKey="profile.groupJoinedDate" />{" "}
                  <FormattedDate date={grp.joinedAt} options={{ dateStyle: "medium" }} />
 </span>
 </div>
 ))}
 </div>
 ) : (
 <p className="text-body-xs text-muted-foreground italic pt-2 border-t border-border/40">
 <TranslatedText namespace="student" messageKey="profile.groupAfterActivation" />
 </p>
 )}
 </div>
 </div>
 </div>
 </div>
 </ShellPage>
 );
}
