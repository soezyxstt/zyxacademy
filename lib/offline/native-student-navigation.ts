import notificationsEn from "@/messages/en/notifications.json";
import notificationsId from "@/messages/id/notifications.json";
import en from "@/messages/en/student.json";
import id from "@/messages/id/student.json";
import commonEn from "@/messages/en/common.json";
import commonId from "@/messages/id/common.json";
import { OFFLINE_LIBRARY_COPY } from "./library-copy";
import type { OfflineMetadataSnapshot } from "./library-contract";

type Locale = "id" | "en";
type Icon = keyof typeof NATIVE_NAV_ICONS;
declare const NATIVE_NAV_ICONS: Record<
  "ArrowLeft" | "Bell" | "BookOpen" | "CalendarRange" | "Home" | "LayoutDashboard" |
  "Medal" | "MessageSquareText" | "PanelLeftClose" | "PanelLeftOpen" | "PawPrint" |
  "Search" | "Trophy" | "UserRound" | "Users", string
>;
declare const NATIVE_MOBILE_DESTINATIONS: ReadonlyArray<{
  id: keyof typeof id.mobile;
  href: string;
  icon: Icon;
}>;

declare const NATIVE_NAV_LOGOS: readonly string[];

const labels = { en, id };
const common = { en: commonEn, id: commonId };

function icon(name: Icon) {
  const element = document.createElement("span");
  element.setAttribute("aria-hidden", "true");
  // Built from Lucide components during packaging.
  element.innerHTML = NATIVE_NAV_ICONS[name];
  return element;
}

function label(element: HTMLElement, text: string) {
  element.setAttribute("aria-label", text);
  element.title = text;
}

export function mountNativeStudentNavigation(
  locale: Locale,
  wide: boolean,
  snapshot: OfflineMetadataSnapshot | null,
  searchReadings: (query: string) => { title: string; open: () => void }[],
) {
  const chrome = document.getElementById("student-navigation");
  const bottom = document.getElementById("student-bottom-nav");
  if (!chrome || !bottom) return;
  const t = labels[locale];
  const copy = OFFLINE_LIBRARY_COPY[locale];
  chrome.replaceChildren();
  bottom.replaceChildren();

  const shell = document.getElementById("offline-shell");
  const desktop = Boolean(shell && wide);
  const origin = (window as Window & { __ZYX_NATIVE_SERVER_ORIGIN__?: string }).__ZYX_NATIVE_SERVER_ORIGIN__
    ?? "https://www.zyxacademy.com";
  const dialog = document.createElement("dialog");
  const heading = document.createElement("h2");
  heading.id = "native-nav-dialog-title";
  dialog.setAttribute("aria-labelledby", heading.id);
  const body = document.createElement("div");
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = copy.cancel;
  close.addEventListener("click", () => dialog.close());
  dialog.append(heading, body, close);
  let returnFocus: HTMLElement | null = null;
  dialog.addEventListener("close", () => returnFocus?.focus());
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.isComposing) return;
    event.preventDefault();
    dialog.close();
  });

  function show(title: string, content: Node) {
    heading.textContent = title;
    body.replaceChildren(content);
    if (!dialog.open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
  }

  function unavailable(title: string) {
    const message = document.createElement("p");
    message.textContent = locale === "id" ? "Sambungkan ke internet untuk membuka halaman ini." : "Connect to the internet to open this page.";
    show(title, message);
  }

  function route(path: string, text: string, name: Icon, visible = false) {
    const anchor = document.createElement("a");
    anchor.href = new URL(path, origin).href;
    anchor.append(icon(name));
    label(anchor, text);
    if (visible) {
      const caption = document.createElement("span");
      caption.textContent = text;
      anchor.append(caption);
    }
    anchor.addEventListener("click", event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (!navigator.onLine) unavailable(text);
      else window.dispatchEvent(new CustomEvent("zyx:offline-navigate", {
        detail: { path, onFailure: () => unavailable(text) },
      }));
    });
    return anchor;
  }

  function button(name: Icon, text: string, onClick: () => void) {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.append(icon(name));
    label(trigger, text);
    trigger.addEventListener("click", onClick);
    return trigger;
  }

  const search = () => {
    const container = document.createElement("div");
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = copy.title;
    input.setAttribute("aria-label", copy.title);
    const results = document.createElement("ul");
    function renderResults() {
      results.replaceChildren();
      for (const result of searchReadings(input.value)) {
        const item = document.createElement("li");
        const open = document.createElement("button");
        open.type = "button";
        open.textContent = result.title;
        open.addEventListener("click", () => { dialog.close(); result.open(); });
        item.append(open);
        results.append(item);
      }
      if (!results.childElementCount) {
        const empty = document.createElement("li");
        empty.textContent = copy.emptyReadings;
        results.append(empty);
      }
    }
    input.addEventListener("input", renderResults);
    container.append(input, results);
    renderResults();
    show(t.mobile.search, container);
    input.focus();
  };

  const notificationLabel = (locale === "id" ? notificationsId : notificationsEn).bell;
  const notifications = button("Bell", notificationLabel, () => unavailable(notificationLabel));
  const searchButton = button("Search", t.mobile.search, search);
  searchButton.dataset.nativeNavSearch = "";
  if (desktop) searchButton.setAttribute("aria-keyshortcuts", "Control+K Meta+K");
  const header = document.createElement("div");
  header.className = "student-native-top-row";
  const title = document.createElement("span");
  title.className = "student-native-title";
  title.textContent = copy.title;
  const back = route("/dashboard", t.mobile.back, "ArrowLeft");
  const logo = route("/dashboard", `${t.navigation.dashboard} Zyx Academy`, "Home");
  logo.className = "student-native-logo";
  logo.replaceChildren();
  for (const [index, theme] of ["light", "dark"].entries()) {
    const mark = document.createElement("span");
    mark.className = `student-native-logo-${theme}`;
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = NATIVE_NAV_LOGOS[index];
    logo.append(mark);
  }
  const toggle = button("PanelLeftClose", common[locale].closeSidebar, () => {
    const collapsed = shell?.classList.toggle("student-native-collapsed");
    toggle.replaceChildren(icon(collapsed ? "PanelLeftOpen" : "PanelLeftClose"));
    label(toggle, collapsed ? common[locale].openSidebar : common[locale].closeSidebar);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    if (collapsed) toggle.after(searchButton);
    else toggle.before(searchButton);
    toggle.focus();
  });
  toggle.className = "student-native-toggle";
  toggle.setAttribute("aria-expanded", String(!shell?.classList.contains("student-native-collapsed")));
  toggle.setAttribute("aria-controls", "student-desktop-nav");
  if (shell?.classList.contains("student-native-collapsed")) {
    toggle.replaceChildren(icon("PanelLeftOpen"));
    label(toggle, common[locale].openSidebar);
  }
  header.append(back, title, logo);
  if (desktop && shell?.classList.contains("student-native-collapsed")) header.append(notifications, toggle, searchButton);
  else if (desktop) header.append(notifications, searchButton, toggle);
  else header.append(searchButton, notifications);
  chrome.append(header, dialog);

  const menu = document.createElement("nav");
  menu.id = "student-desktop-nav";
  menu.setAttribute("aria-label", t.mobile.bottomNavLabel);
  const group = (text: string, trailing?: HTMLElement) => {
    const title = document.createElement("p");
    title.textContent = text;
    if (trailing) {
      const row = document.createElement("div");
      row.className = "student-native-nav-group";
      row.append(title, trailing);
      menu.append(row);
    } else menu.append(title);
  };
  if (desktop) {
    menu.append(
      route("/dashboard", t.navigation.dashboard, "LayoutDashboard", true),
      route("/dashboard/schedule", t.navigation.schedule, "CalendarRange", true),
      route("/dashboard/discussions", t.mobile.discuss, "MessageSquareText", true),
    );
    const allCourses = route("/courses", t.navigation.courses, "BookOpen", true);
    allCourses.className = "student-native-all-courses";
    group(t.navigation.courses, route("/courses", t.navigation.exploreCourses, "Search"));
    menu.append(allCourses);
    if (snapshot?.courses.length) {
      for (const course of snapshot.courses) {
        const courseLink = route(`/courses/${encodeURIComponent(course.id)}`, course.title, "BookOpen", true);
        courseLink.className = "student-native-enrollment";
        menu.append(courseLink);
      }
    } else {
      const explore = route("/courses", t.navigation.exploreCourses, "Search", true);
      explore.className = "student-native-enrollment";
      menu.append(explore);
    }
    group(t.navigation.groupCommunity);
    menu.append(
      route("/dashboard/groups", t.navigation.groups, "Users", true),
      route("/leaderboard", t.navigation.leaderboard, "Medal", true),
      route("/achievements", t.navigation.achievements, "Trophy", true),
      route("/pet", "Pet", "PawPrint", true),
    );
    chrome.append(menu, route("/profile", t.mobile.me, "UserRound", true));
  }
  bottom.setAttribute("aria-label", t.mobile.bottomNavLabel);
  for (const item of NATIVE_MOBILE_DESTINATIONS) bottom.append(route(item.href, t.mobile[item.id], item.icon, true));
}
