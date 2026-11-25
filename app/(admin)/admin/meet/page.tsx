"use client";

import { googleErrorKey } from "@/lib/google-operation-error";
import { GoogleSetupHelp } from "@/components/admin/google-setup-help";
import { ParticipantPickerSkeleton } from "@/components/admin/content-loading-skeletons";

import { Skeleton } from "@/components/ui/skeleton";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Video,
  PlusCircle,
  Copy,
  ExternalLink,
  Square,
  RefreshCw,
  Clock,
  Users,
  ChevronRight,
  Shield,
  Check,
  AlertCircle,
  Trash2,
  TrendingUp,
  X,
  UserPlus,
  Link2,
  Crown,
  Mail,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AdminIconAction } from "@/components/admin/icon-action";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useTranslations, useAppLocale } from "@/lib/i18n/client";

interface MeetSpaceInfo {
  name: string;
  meetingUri: string;
  meetingCode: string;
  title?: string;
  slug?: string;
  hostEmail?: string;
  coHostEmails?: string[];
  invitedEmails?: string[];
}

interface MeetUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  courseIds: string[];
}

interface MeetCourse {
  id: string;
  title: string;
  slug: string;
}

interface ConferenceRecordItem {
  name: string;
  startTime: string;
  endTime?: string;
  space: string;
  title?: string;
  participantCount?: number;
  peakConcurrentParticipants?: number;
}

function slugifyTitle(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function AdminMeetPage() {
  const t = useTranslations("adminOps");
  const googleError = useTranslations("admin.googleSetup");
  const { locale } = useAppLocale();
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [accessType, setAccessType] = useState<"OPEN" | "TRUSTED" | "RESTRICTED">("OPEN");
  const [activeSpace, setActiveSpace] = useState<MeetSpaceInfo | null>(null);
  const [copied, setCopied] = useState<"zyx" | "meet" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  // Invitation picker
  const [meetUsers, setMeetUsers] = useState<MeetUser[]>([]);
  const [meetCourses, setMeetCourses] = useState<MeetCourse[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [showAllCoHosts, setShowAllCoHosts] = useState(false);

  // Conference Records
  const [records, setRecords] = useState<ConferenceRecordItem[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; title: string } | null>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (slugEdited) return;
    setSlug(slugifyTitle(title));
  }, [title, slugEdited]);

  const fetchRecords = useCallback(async () => {
    setLoadingRecords(true);
    try {
      const res = await fetch("/api/admin/meet/records");
      const data = await res.json();
      if (data.success && Array.isArray(data.conferenceRecords)) {
        setRecords(data.conferenceRecords);
      } else {
        setRecords([]);
      }
    } catch {
      setRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    let cancelled = false;
    setUsersLoading(true);
    fetch("/api/admin/meet/users")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          setMeetUsers(data.users || []);
          setMeetCourses(data.courses || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateSpace = async () => {
    setCreating(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/meet/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          slug: slug.trim() || undefined,
          accessType,
          invitedEmails: selectedEmails,
        }),
      });
      const data = await res.json();
      if (data.success && data.space) {
        setActiveSpace({
          ...data.space,
          title: data.space.title || title.trim() || t("meetMainUI.defaultTitle"),
        });
        setTitle("");
        setSlug("");
        setSlugEdited(false);
        setSelectedEmails([]);
        setShowAllCoHosts(false);
        if (Array.isArray(data.warnings) && data.warnings.length > 0) {
          toast.warning(t("meetMainUI.permissionWarning", { count: data.warnings.length }));
        }
      } else {
        setErrorMsg(res.status === 401 || res.status === 403 ? googleError("adminAccess") : googleError(googleErrorKey(data.code)));
      }
    } catch {
      setErrorMsg(t("meetMainUI.networkError"));
    } finally {
      setCreating(false);
    }
  };

  const handleEndConference = async () => {
    if (!activeSpace) return;
    setEnding(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/meet/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceName: activeSpace.name }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveSpace(null);
        fetchRecords();
      } else {
        setErrorMsg(t("meetMainUI.endError"));
      }
    } catch {
      setErrorMsg(t("meetMainUI.networkError"));
    } finally {
      setEnding(false);
    }
  };

  const handleDeleteRecord = async (recordName: string) => {
    const recordId = recordName.replace(/^conferenceRecords\//, "");
    setDeleteTarget(null);
    setDeletingId(recordId);
    try {
      const res = await fetch(`/api/admin/meet/records/${recordId}/delete`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setRecords((prev) => prev.filter((r) => r.name !== recordName));
        toast.success(t("meetMainUI.deleteSuccess"));
      } else {
        toast.error(t("meetMainUI.deleteError"));
      }
    } catch {
      toast.error(t("meetMainUI.networkError"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = (text: string, key: "zyx" | "meet") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((prev) => (prev === key ? null : prev)), 2000);
  };

  const toggleEmail = (email: string) => {
    setSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const toggleRoleBulk = (role: string) => {
    const matching = filteredUsers.filter((u) => u.roles.includes(role)).map((u) => u.email);
    if (matching.length === 0) return;
    setSelectedEmails((prev) => {
      const allSelected = matching.every((e) => prev.includes(e));
      return allSelected
        ? prev.filter((e) => !matching.includes(e))
        : [...new Set([...prev, ...matching])];
    });
  };

  const toggleCourseBulk = (courseId: string) => {
    const matching = filteredUsers.filter((u) => u.courseIds.includes(courseId)).map((u) => u.email);
    if (matching.length === 0) return;
    setSelectedEmails((prev) => {
      const allSelected = matching.every((e) => prev.includes(e));
      return allSelected
        ? prev.filter((e) => !matching.includes(e))
        : [...new Set([...prev, ...matching])];
    });
  };

  const roleAllSelected = (role: string) => {
    const matching = filteredUsers.filter((u) => u.roles.includes(role));
    return matching.length > 0 && matching.every((u) => selectedEmails.includes(u.email));
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meetUsers.filter((u) => {
      if (roleFilter !== "all" && !u.roles.includes(roleFilter)) return false;
      if (courseFilter !== "all" && !u.courseIds.includes(courseFilter)) return false;
      if (q && !u.email.toLowerCase().includes(q) && !u.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [meetUsers, search, roleFilter, courseFilter]);

  const selectedCourse =
    courseFilter === "all" ? null : (meetCourses.find((c) => c.id === courseFilter) ?? null);

  const previewSlug = slug || slugifyTitle(title);
  const createLink = origin && previewSlug ? `${origin}/f/${previewSlug}` : "";
  const activeZyxLink = origin && activeSpace?.slug ? `${origin}/f/${activeSpace.slug}` : "";
  const hostMeetingUri = activeSpace?.hostEmail
    ? `${activeSpace.meetingUri}${activeSpace.meetingUri.includes("?") ? "&" : "?"}authuser=${encodeURIComponent(activeSpace.hostEmail)}`
    : activeSpace?.meetingUri;

  const formatTimeOnly = (isoStr?: string) => {
    if (!isoStr) return "-";
    return new Date(isoStr).toLocaleTimeString(locale === "id" ? "id-ID" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const calculateDuration = (startStr: string, endStr?: string) => {
    if (!endStr) return t("meetMainUI.inProgress");
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    const diffSec = Math.round((end - start) / 1000);
    if (diffSec < 60) return `${diffSec} ${t("meetMainUI.seconds")}`;
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return `${mins} ${t("meetMainUI.minutesShort")} ${secs} ${t("meetMainUI.seconds")}`;
  };

  return (
    <div className="space-y-(--section-gap)">
      <AdminPageHeader
        icon={Video}
        title={t("meetMainUI.title")}
      />

      {errorMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-body-sm text-status-error">
          <AlertCircle className="size-5 shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Top Action Section: Create & Manage Active Meeting */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Card 1: Start Meeting Controls */}
        <div className="border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <PlusCircle className="size-5 text-brand-primary" />
            <h2 className="font-heading text-body-base font-bold text-foreground">
              {t("meetMainUI.createHeading")}
            </h2>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-body-xs font-semibold text-foreground">
                {t("meetMainUI.meetingTitle")}
              </label>
              <Input
                type="text"
                placeholder={t("meetMainUI.titlePlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-body-xs font-semibold text-foreground">
                {t("meetMainUI.slugLabel")}
              </label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-md bg-muted px-2 py-2 text-body-xs font-medium text-muted-foreground">
                  /f/
                </span>
                <Input
                  type="text"
                  placeholder={t("meetMainUI.slugPlaceholder")}
                  value={slug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setSlug(slugifyTitle(e.target.value));
                  }}
                />
              </div>
              {createLink && (
                <p className="mt-1.5 truncate text-body-xs text-muted-foreground">
                  {t("meetMainUI.linkLabel")}: <span className="font-medium text-brand-primary">{createLink}</span>
                </p>
              )}
            </div>

            <div>
              <label htmlFor="meet-access" className="mb-1 block text-body-sm font-semibold text-foreground">
                {t("meetMainUI.accessLabel")}
              </label>
              <Select value={accessType} onValueChange={(v) => setAccessType(v as any)}>
                <SelectTrigger id="meet-access">
                  <SelectValue placeholder={t("meetMainUI.chooseAccess")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">{t("meetMainUI.accessOpen")}</SelectItem>
                  <SelectItem value="TRUSTED">{t("meetMainUI.accessTrusted")}</SelectItem>
                  <SelectItem value="RESTRICTED">{t("meetMainUI.accessRestricted")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {accessType !== "OPEN" && (
              <div>
                <label className="mb-1 block text-body-xs font-semibold text-foreground">
                  {t("meetMainUI.inviteParticipants", { count: selectedEmails.length })}
                </label>
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <UserPlus className="size-4" />
                        {t("meetMainUI.chooseParticipants")}
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-body-xs font-semibold text-muted-foreground">
                        {selectedEmails.length}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[25rem] max-w-[calc(100vw-2rem)]" align="start">
                    <div className="space-y-3">
                      <Input
                        type="text"
                        placeholder={t("meetMainUI.searchPeople")}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                          <SelectTrigger aria-label={t("meetMainUI.role")} className="h-9">
                            <SelectValue placeholder={t("meetMainUI.role")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t("meetMainUI.allRoles")}</SelectItem>
                            <SelectItem value="admin">{t("meetMainUI.admin")}</SelectItem>
                            <SelectItem value="tutor">{t("meetMainUI.tutor")}</SelectItem>
                            <SelectItem value="murid">{t("meetMainUI.student")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={courseFilter} onValueChange={setCourseFilter}>
                          <SelectTrigger aria-label={t("meetMainUI.course")} className="h-9">
                            <SelectValue placeholder={t("meetMainUI.course")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t("meetMainUI.allCourses")}</SelectItem>
                            {meetCourses.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button type="button" variant="outline" size="sm" onClick={() => toggleRoleBulk("admin")}>
                          {roleAllSelected("admin") ? <Check className="size-3.5 text-status-success" /> : <UserPlus className="size-3.5" />}
                          {t("meetMainUI.admin")}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => toggleRoleBulk("tutor")}>
                          {roleAllSelected("tutor") ? <Check className="size-3.5 text-status-success" /> : <UserPlus className="size-3.5" />}
                          {t("meetMainUI.tutor")}
                        </Button>
                        {selectedCourse && (
                          <Button type="button" variant="outline" size="sm" onClick={() => toggleCourseBulk(selectedCourse.id)}>
                            <UserPlus className="size-3.5" />
                            {selectedCourse.title}
                          </Button>
                        )}
                      </div>
                      <div className="max-h-[min(16rem,40dvh)] overflow-y-auto border-y border-border/60">
                        {usersLoading ? (
                          <ParticipantPickerSkeleton label={t("meetMainUI.loadingParticipants")} />
                        ) : filteredUsers.length === 0 ? (
                          <p className="p-4 text-body-sm text-muted-foreground">{t("meetMainUI.noMatchingParticipants")}</p>
                        ) : (
                          filteredUsers.map((u) => (
                            <label
                              key={u.id}
                              className="flex items-start gap-2.5 border-b border-border/60 py-2 transition-colors last:border-b-0 hover:bg-muted/40"
                            >
                              <Checkbox
                                checked={selectedEmails.includes(u.email)}
                                onCheckedChange={() => toggleEmail(u.email)}
                                className="mt-0.5"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-body-sm font-medium text-foreground">
                                  {u.name}
                                </span>
                                <span className="block truncate text-body-xs text-muted-foreground">
                                  {u.email}
                                </span>
                                <span className="mt-1 flex flex-wrap gap-1">
                                  {u.roles.map((r) => (
                                    <Badge key={r} variant="secondary" className="text-[10px] uppercase tracking-wide">
                                      {r === "admin" ? t("meetMainUI.admin") : r === "tutor" ? t("meetMainUI.tutor") : r === "murid" ? t("meetMainUI.student") : r}
                                    </Badge>
                                  ))}
                                  {u.courseIds.length > 0 && (
                                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                      {t("meetMainUI.courseCount", { count: u.courseIds.length })}
                                    </Badge>
                                  )}
                                </span>
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-3">
                        <p className="text-body-xs text-muted-foreground">
                          {t("meetMainUI.selectedParticipants", { count: selectedEmails.length })}
                        </p>
                        <Button type="button" size="sm" onClick={() => setPickerOpen(false)}>
                          {t("meetMainUI.done")}
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                {selectedEmails.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedEmails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-body-xs text-foreground"
                      >
                        <span className="truncate">{email}</span>
                        <button
                          type="button"
                          onClick={() => toggleEmail(email)}
                          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={t("meetMainUI.removeEmail", { email })}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <GoogleSetupHelp service="meet" />
            <Button
              type="button"
              onClick={handleCreateSpace}
              disabled={creating}
              className="mt-2 w-full"
            >
              {creating ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  {t("meetMainUI.creatingSpace")}
                </>
              ) : (
                <>
                  <Video className="size-4" />
                  {t("meetMainUI.startMeeting")}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Card 2: Active Meeting Card */}
        <div className="flex flex-col justify-between border-y border-border py-4">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="size-5 text-status-success" />
                <h2 className="font-heading text-body-base font-bold text-foreground">
                  {t("meetMainUI.meetingStatus")}
                </h2>
              </div>
              {activeSpace ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-status-success/15 px-2.5 py-1 text-body-xs font-semibold text-status-success">
                  <span className="size-2 rounded-full bg-status-success animate-pulse" />
                  {t("meetMainUI.active")}
                </span>
              ) : (
                <span className="rounded-md bg-muted px-2.5 py-1 text-body-xs font-medium text-muted-foreground">
                  {t("meetMainUI.inactive")}
                </span>
              )}
            </div>

            {activeSpace ? (
              <div className="mt-4 space-y-3">
                <div className="border-b border-border pb-3">
                  <p className="font-heading text-body-base font-bold text-foreground">
                    {activeSpace.title}
                  </p>
                  <p className="mt-0.5 text-body-xs font-mono text-muted-foreground">
                    {t("meetMainUI.codeLabel")}: {activeSpace.meetingCode}
                  </p>

                  <div className="mt-2 space-y-1.5">
                    {activeZyxLink && (
                      <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1">
                        <Link2 className="size-3.5 shrink-0 text-brand-primary" />
                        <span className="min-w-0 flex-1 truncate text-body-xs font-medium text-brand-primary">
                          {activeZyxLink}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0"
                          onClick={() => handleCopy(activeZyxLink, "zyx")}
                          title={t("meetMainUI.copyZyxLink")}
                        >
                          {copied === "zyx" ? (
                            <Check className="size-3.5 text-status-success" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1">
                      <Video className="size-3.5 shrink-0 text-brand-primary" />
                      <span className="min-w-0 flex-1 truncate text-body-xs font-medium text-brand-primary">
                        {activeSpace.meetingUri}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        onClick={() => handleCopy(activeSpace.meetingUri, "meet")}
                        title={t("meetMainUI.copyMeetLink")}
                      >
                        {copied === "meet" ? (
                          <Check className="size-3.5 text-status-success" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {activeSpace.hostEmail && (
                  <p className="flex items-center gap-1.5 text-body-xs text-muted-foreground">
                    <Crown className="size-3.5 shrink-0 text-brand-secondary" />
                    {t("meetMainUI.hostLabel")}: <span className="font-medium text-foreground">{activeSpace.hostEmail}</span>
                  </p>
                )}

                {activeSpace.coHostEmails && activeSpace.coHostEmails.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Users className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-body-xs text-muted-foreground">
                      {t("meetMainUI.coHosts", { count: activeSpace.coHostEmails.length })}:
                    </span>
                    {(showAllCoHosts ? activeSpace.coHostEmails : activeSpace.coHostEmails.slice(0, 3)).map(
                      (email) => (
                        <Badge
                          key={email}
                          variant="secondary"
                          className="max-w-[200px] truncate text-[10px]"
                        >
                          {email}
                        </Badge>
                      )
                    )}
                    {activeSpace.coHostEmails.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setShowAllCoHosts((v) => !v)}
                        className="text-body-xs font-medium text-brand-primary transition-colors hover:text-brand-primary/80"
                      >
                        {showAllCoHosts ? t("meetMainUI.hide") : t("meetMainUI.more", { count: activeSpace.coHostEmails.length - 3 })}
                      </button>
                    )}
                  </div>
                )}

                {activeSpace.invitedEmails && activeSpace.invitedEmails.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-body-xs text-muted-foreground">{t("meetMainUI.invitedLabel")}</span>
                    {activeSpace.invitedEmails.slice(0, 3).map((email) => (
                      <Badge
                        key={email}
                        variant="outline"
                        className="max-w-[200px] truncate text-[10px]"
                      >
                        {email}
                      </Badge>
                    ))}
                    {activeSpace.invitedEmails.length > 3 && (
                      <Badge variant="outline" className="text-[10px]">
                        {t("meetMainUI.more", { count: activeSpace.invitedEmails.length - 3 })}
                      </Badge>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a href={hostMeetingUri} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3.5" />
                      {t("meetMainUI.openAsHost")}
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-body-xs text-muted-foreground">
                {t("meetMainUI.noActiveMeeting")}
              </p>
            )}
          </div>

          {activeSpace && (
            <div className="mt-(--related-gap) flex justify-end border-t border-border/60 pt-(--compact-gap)">
              <Button
                type="button"
                variant="destructive"
                className="min-h-9"
                onClick={handleEndConference}
                disabled={ending}
              >
                {ending ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Square className="size-4 fill-current" />
                )}
                {t("meetMainUI.endMeeting")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Conference Records / Log Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="font-heading text-body-base font-bold text-foreground">
            {t("meetMainUI.historyHeading")}
          </h2>
          <AdminIconAction label={t("meetMainUI.refresh")}
            type="button"
            variant="outline"
            onClick={fetchRecords}
            disabled={loadingRecords}>
            <RefreshCw className={`size-4 ${loadingRecords ? "animate-spin" : ""}`} />
          </AdminIconAction>
        </div>

        {loadingRecords ? (
          <div role="status" aria-label="Memuat" className="divide-y divide-border border-y border-border">{[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4 px-4 py-(--table-row-padding)"><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-40 max-w-full" /><Skeleton className="h-3 w-24" /></div><Skeleton className="hidden h-4 w-24 sm:block" /><Skeleton className="hidden h-4 w-16 md:block" /><Skeleton className="h-8 w-8" /></div>)}</div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Clock className="size-10 text-muted-foreground/60" />
            <p className="mt-3 font-heading text-body-base font-semibold text-foreground">
              {t("meetMainUI.noHistory")}
            </p>
            <p className="mt-1 max-w-md text-body-xs text-muted-foreground">
              {t("meetMainUI.historyDescription")}
            </p>
          </div>
        ) : (
          <div className="border-y border-border/60">
            {/* Mobile stacked rows */}
            <div className="divide-y divide-border/60 md:hidden">
              {records.map((rec) => {
                const recordId = rec.name.replace(/^conferenceRecords\//, "");
                const isDeleting = deletingId === recordId;
                const peak = rec.peakConcurrentParticipants || rec.participantCount || 0;
                const total = rec.participantCount || 0;

                return (
                  <div key={rec.name} className="space-y-1.5 py-(--row-padding)">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-body-sm font-bold text-foreground">
                          {rec.title || t("meetMainUI.recordFallback", { id: recordId.slice(0, 8) })}
                        </p>
                        <p className="mt-0.5 text-body-xs text-muted-foreground">
                          {new Date(rec.startTime).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}{" "}
                          · {formatTimeOnly(rec.startTime)} - {formatTimeOnly(rec.endTime)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button variant="outline" size="sm" asChild className="h-8 px-2.5 text-body-sm">
                          <Link href={`/admin/meet/${recordId}`}>
                            <Users className="size-3.5" />
                            <span>{t("meetMainUI.logDetails")}</span>
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          onClick={() => setDeleteTarget({
                            name: rec.name,
                            title: rec.title || t("meetMainUI.recordFallback", { id: recordId.slice(0, 8) }),
                          })}
                          disabled={isDeleting}
                          aria-label={t("meetMainUI.deleteLog")}
                          title={t("meetMainUI.deleteLog")}
                          className="size-8 border-status-error/30 bg-status-error/10 text-status-error hover:bg-status-error/20"
                        >
                          {isDeleting ? (
                            <RefreshCw className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-body-xs text-muted-foreground">
                      <span className="font-medium">{calculateDuration(rec.startTime, rec.endTime)}</span>
                      <div className="flex items-center gap-1.5 font-semibold text-foreground tabular-nums">
                        <TrendingUp className="size-3.5 text-brand-primary" />
                        <span>
                          {t("meetMainUI.peakLabel")}: <strong className="text-brand-primary">{peak}</strong>
                        </span>
                        <span className="font-normal text-muted-foreground">
                          ({t("meetMainUI.totalLabel")}: {total})
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <Table className="w-full text-left text-body-sm">
                <TableHeader className="border-b border-border bg-muted/50 text-body-xs font-semibold text-muted-foreground">
                  <TableRow>
                    <TableHead className="px-4">{t("meetMainUI.titleColumn")}</TableHead>
                    <TableHead className="px-4">{t("meetMainUI.timeColumn")}</TableHead>
                    <TableHead className="px-4">{t("meetMainUI.durationColumn")}</TableHead>
                    <TableHead className="px-4">{t("meetMainUI.participantsColumn")}</TableHead>
                    <TableHead className="px-4 text-right">{t("meetMainUI.actionsColumn")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border">
                  {records.map((rec) => {
                    const recordId = rec.name.replace(/^conferenceRecords\//, "");
                    const isDeleting = deletingId === recordId;
                    const peak = rec.peakConcurrentParticipants || rec.participantCount || 0;
                    const total = rec.participantCount || 0;

                    return (
                      <TableRow key={rec.name} className="transition-colors hover:bg-muted/30">
                        <TableCell className="whitespace-nowrap px-4 font-medium text-foreground">
                          <p className="text-body-sm font-bold text-foreground">
                            {rec.title || t("meetMainUI.recordFallback", { id: recordId.slice(0, 8) })}
                          </p>
                          <p className="font-mono text-body-xs text-muted-foreground">
                            ID: {recordId.slice(0, 16)}...
                          </p>
                        </TableCell>

                        <TableCell className="whitespace-nowrap px-4 text-foreground">
                          <p className="text-body-xs font-semibold">
                            {new Date(rec.startTime).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                          <p className="text-body-xs text-muted-foreground">
                            {formatTimeOnly(rec.startTime)} - {formatTimeOnly(rec.endTime)}
                          </p>
                        </TableCell>

                        <TableCell className="whitespace-nowrap px-4 font-medium text-muted-foreground">
                          {calculateDuration(rec.startTime, rec.endTime)}
                        </TableCell>

                        <TableCell className="whitespace-nowrap px-4">
                          <div className="flex items-center gap-1.5 text-body-xs font-semibold text-foreground">
                            <TrendingUp className="size-3.5 text-brand-primary" />
                            <span>{t("meetMainUI.peakLabel")}: <strong className="text-brand-primary">{peak}</strong></span>
                            <span className="font-normal text-muted-foreground">({t("meetMainUI.totalLabel")}: {total})</span>
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-nowrap px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/admin/meet/${recordId}`}>
                                <Users className="size-3.5" />
                                {t("meetMainUI.logDetails")}
                                <ChevronRight className="size-3.5" />
                              </Link>
                            </Button>

                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              onClick={event => {
                                deleteTrigger.current = event.currentTarget;
                                setDeleteTarget({
                                  name: rec.name,
                                  title: rec.title || t("meetMainUI.recordFallback", { id: recordId.slice(0, 8) }),
                                });
                              }}
                              disabled={isDeleting}
                              title={t("meetMainUI.deleteLog")}
                              className="border-status-error/30 bg-status-error/10 text-status-error hover:bg-status-error/20"
                            >
                              {isDeleting ? (
                                <RefreshCw className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>
      <AdminConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={open => { if (!open) setDeleteTarget(null); }}
        title={t("meetMainUI.deleteLog")}
        description={<>{deleteTarget?.title}<br />{t("meetMainUI.deleteConfirm")}</>}
        onConfirm={() => { if (deleteTarget) void handleDeleteRecord(deleteTarget.name); }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          deleteTrigger.current?.focus();
        }}
      />
    </div>
  );
}
