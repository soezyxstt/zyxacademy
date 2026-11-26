import { useEffect } from "react";
import {
  findAdministrationBundle, matchAdministrationRoute, resolveAdministrationRedirect, type AdministrationPattern,
} from "../../../../../packages/native-parity/academic/administration/routes";
import { CourseTheme } from "../courses/ui";
import type { AcademicScreenProps } from "../contracts";
import { AdministrationBundleReview } from "./bundle-review";
import { AdministrationNotifications, AdministrationPka } from "./communications";
import { AdministrationGroups, AdministrationTokens, AdministrationUsers } from "./management";
import { useAdministrationSnapshot, useAdministrationStore } from "./provider";
import { AdministrationSchedules } from "./schedules";
import { Action, AdministrationPage, CourseStatus } from "./ui";

export { AdministrationProvider, useAdministrationSnapshot } from "./provider";

function ProtectedAdministrationScreen(props: AcademicScreenProps) {
  const { path, params, query, actor, scenario, navigate, replace, back } = props;
  const { records, readError, authorized } = useAdministrationSnapshot();
  const store = useAdministrationStore();
  const route = matchAdministrationRoute(path);
  const redirect = route && resolveAdministrationRedirect(route.pattern, params, query, records.bundles);
  const target = authorized && !readError && redirect?.type === "redirect" ? redirect.target : undefined;
  useEffect(() => { if (target) replace(target); }, [target, replace]);

  const title = route?.title ?? "Administrasi akademik";
  if (!authorized || actor.role !== "admin") return <AdministrationPage title={title} back={back}>
    <CourseStatus label="Akses admin diperlukan." error />
  </AdministrationPage>;
  if (readError) return <AdministrationPage title={title} back={back}>
    <CourseStatus label="Data administrasi gagal dimuat." error retry={store.retryRead} />
  </AdministrationPage>;
  if (redirect?.type === "redirect") return <AdministrationPage title={title} back={back}>
    <CourseStatus label="Membuka halaman tujuan…" />
  </AdministrationPage>;
  if (!route || redirect?.type === "missing") return <AdministrationPage title={title} back={back}>
    <CourseStatus label="Halaman atau bundle tidak ditemukan." error />
  </AdministrationPage>;

  function content(pattern: AdministrationPattern) {
    switch (pattern) {
      case "/admin/users": return <AdministrationUsers actorId={actor.id} />;
      case "/admin/groups": return <AdministrationGroups />;
      case "/admin/tokens": return <AdministrationTokens />;
      case "/admin/schedules": return <AdministrationSchedules query={query} replace={replace} />;
      case "/admin/notifications": return <AdministrationNotifications query={query} replace={replace} />;
      case "/admin/tutorial-pka/announcements": return <AdministrationPka tab="announcements" navigate={navigate} />;
      case "/admin/tutorial-pka/registrations": return <AdministrationPka tab="registrations" navigate={navigate} />;
      case "/admin/tutorial-pka/schedules": return <AdministrationPka tab="schedules" navigate={navigate} />;
      case "/admin/courses/[slug]/review/idea/[bundleId]":
      case "/admin/courses/[slug]/review/product/[bundleId]": {
        const kind = pattern.includes("/idea/") ? "idea" : "product";
        const bundle = findAdministrationBundle(params.slug, params.bundleId, kind, records.bundles);
        const courseReview = params.slug ? `/admin/courses/${encodeURIComponent(params.slug)}/review?tab=${kind}` : "/admin/courses";
        return bundle ? <AdministrationBundleReview key={bundle.id} bundle={bundle} returnToReview={() => replace(courseReview)} /> :
          <>
            <CourseStatus label={scenario === "empty" ? "Belum ada bundle yang ditinjau." : "Bundle tidak tersedia pada mata kuliah ini."} error={scenario !== "empty"} />
            <Action label="Kembali ke review materi" onPress={() => replace(courseReview)} />
          </>;
      }
      default: return null;
    }
  }
  return <AdministrationPage title={title} back={back}>{content(route.pattern)}</AdministrationPage>;
}

export function AdministrationScreen(props: AcademicScreenProps) {
  return <CourseTheme.Provider value={props.theme}>
    <ProtectedAdministrationScreen {...props} />
  </CourseTheme.Provider>;
}

export { AdministrationLiveScreen } from "./live-screen";
