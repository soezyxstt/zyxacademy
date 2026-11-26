import { useRef, useState, type ComponentRef, type ReactNode } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, type TextInput } from "react-native";

import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { navigationCases, navigationFixture as fixture, type NavigationCaseId, type NavigationFixtureCase } from "../../../../packages/native-parity/shared-ui/navigation-cases";
import { Button } from "../../components/Button";
import { Textarea } from "../../components/Input";
import { Label } from "../../components/Label";
import { nativeTypography } from "../../typography";
import { MobileNavbar, NavigationTabs, RoleBottomNavigation, type NavbarActionId, type RoleDestinationId } from "./navigation";
import { NavigationIcon } from "./navigation-icons";
import { SharedDialog, SharedDialogFooter, SharedPopover, SharedPopoverAnchor, SharedSheet } from "./overlays";

type NavbarCaseProps = Extract<NavigationFixtureCase, { component: "mobile-navbar" }>;
type BottomCaseProps = Extract<NavigationFixtureCase, { component: "bottom-navigation" }>;
type TabCaseProps = Extract<NavigationFixtureCase, { component: "navigation-tabs" }>;
type DialogCaseProps = Extract<NavigationFixtureCase, { component: "shared-dialog" }>;
type SheetCaseProps = Extract<NavigationFixtureCase, { component: "shared-sheet" }>;
type PopoverCaseProps = Extract<NavigationFixtureCase, { component: "shared-popover" }>;

function ExampleText({ children, theme, status = false, testID }: { children: ReactNode; theme: "light" | "dark"; status?: boolean; testID?: string }) {
  return (
    <Text
      testID={testID}
      accessibilityLiveRegion={status ? "polite" : undefined}
      style={[nativeTypography.bodyRegular, styles.body, { color: nativeColors[theme].foreground }]}
    >
      {children}
    </Text>
  );
}

function NavbarCase({ item }: { item: NavbarCaseProps }) {
  const [action, setAction] = useState<NavbarActionId>();
  const courseRef = useRef<ComponentRef<typeof Pressable>>(null);
  const [courseTitle, setCourseTitle] = useState<string>(fixture.tutorCourse);
  const [courseOpen, setCourseOpen] = useState(false);
  const labels = fixture.navbarLabels;
  const actions = {
    search: { label: labels.search },
    notifications: { label: labels.notifications },
    "ops-ai": { label: labels["ops-ai"] },
    ...(item.role !== "student" ? { account: { label: labels.account } } : {}),
  };
  return (
    <>
      <MobileNavbar
        role={item.role}
        title={item.role === "student" ? fixture.studentNavLabels.home : fixture.adminTitle}
        home={item.role === "student" ? { label: labels.home } : undefined}
        back={item.role === "admin" ? { label: labels.back } : undefined}
        course={item.role === "tutor" ? { label: labels["switch-course"], title: courseTitle, expanded: courseOpen } : undefined}
        actions={actions}
        actionRefs={{ "switch-course": courseRef }}
        includeSafeArea={false}
        theme={item.theme}
        testID={item.id}
        onAction={(id) => {
          if (id === "switch-course") setCourseOpen(true);
          else setAction(id);
        }}
      />
      {action ? (
        <View style={styles.pageGutter}>
          <ExampleText theme={item.theme} status testID={`${item.id}-state`}>{labels[action]}</ExampleText>
        </View>
      ) : null}
      {item.role === "tutor" ? (
        <SharedSheet
          open={courseOpen}
          title={labels["switch-course"]}
          theme={item.theme}
          closeLabel={fixture.close}
          onDismiss={() => setCourseOpen(false)}
          returnFocusRef={courseRef}
          testID={`${item.id}-course-sheet`}
        >
          {[fixture.tutorCourse, "Matematika Dasar"].map((course) => (
            <OptionRow key={course} label={course} selected={course === courseTitle} theme={item.theme}
              onPress={() => { setCourseTitle(course); setCourseOpen(false); }} />
          ))}
        </SharedSheet>
      ) : null}
    </>
  );
}

function BottomCase({ item }: { item: BottomCaseProps }) {
  const [studentTab, setStudentTab] = useState<RoleDestinationId<"student">>("home");
  const [tutorTab, setTutorTab] = useState<RoleDestinationId<"tutor">>("classes");
  const [adminTab, setAdminTab] = useState<RoleDestinationId<"admin">>("courses");
  const [adminEditor, setAdminEditor] = useState(false);
  const [adminMore, setAdminMore] = useState(false);
  const moreRef = useRef<ComponentRef<typeof Pressable>>(null);

  if (item.role === "student") {
    return (
      <View style={styles.fill}>
        <View style={styles.pageGutter}><ExampleText theme={item.theme} status testID={`${item.id}-state`}>{fixture.studentNavLabels[studentTab]}</ExampleText></View>
        <View style={styles.fill} />
        <RoleBottomNavigation
          role="student"
          labels={fixture.studentNavLabels}
          accessibilityLabel="Navigasi siswa"
          activeId={studentTab}
          badges={{ discuss: { count: 3, label: "3 pertanyaan belum dibaca" } }}
          theme={item.theme}
          includeSafeArea={false}
          testID={item.id}
          onDestinationPress={setStudentTab}
        />
      </View>
    );
  }

  if (item.role === "tutor") {
    return (
      <View style={styles.fill}>
        <View style={styles.pageGutter}><ExampleText theme={item.theme} status testID={`${item.id}-state`}>{fixture.tutorNavLabels[tutorTab]}</ExampleText></View>
        <View style={styles.fill} />
        <RoleBottomNavigation
          role="tutor"
          labels={fixture.tutorNavLabels}
          accessibilityLabel="Navigasi pengajar"
          activeId={tutorTab}
          theme={item.theme}
          includeSafeArea={false}
          testID={item.id}
          onDestinationPress={setTutorTab}
        />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <View style={styles.pageGutter}>
        <ExampleText theme={item.theme} status testID={`${item.id}-state`}>{adminEditor ? fixture.adminEditor.title : fixture.adminNavLabels[adminTab]}</ExampleText>
        <Button
          testID={`${item.id}-${adminEditor ? "back" : "editor"}`}
          variant="outline"
          theme={item.theme}
          onPress={() => setAdminEditor(!adminEditor)}
        >
          {adminEditor ? fixture.navbarLabels.back : fixture.adminEditor.open}
        </Button>
      </View>
      <View style={styles.fill} />
      <RoleBottomNavigation
        role="admin"
        labels={fixture.adminNavLabels}
        accessibilityLabel="Navigasi admin"
        activeId={adminTab}
        actionIds={["more"]}
        expandedId={adminMore ? "more" : undefined}
        itemRefs={{ more: moreRef }}
        hidden={adminEditor}
        theme={item.theme}
        includeSafeArea={false}
        testID={item.id}
        onDestinationPress={(id) => {
          if (id === "more") setAdminMore(true);
          else setAdminTab(id);
        }}
      />
      <SharedSheet
        open={adminMore}
        title="Semua modul admin"
        closeLabel={fixture.close}
        theme={item.theme}
        onDismiss={() => setAdminMore(false)}
        returnFocusRef={moreRef}
        testID={`${item.id}-more-sheet`}
      >
        <OptionRow theme={item.theme} label="Web Analytics" selected={false} onPress={() => { setAdminTab("ops"); setAdminMore(false); }} />
      </SharedSheet>
    </View>
  );
}

function TabsCase({ item }: { item: TabCaseProps }) {
  type TabId = (typeof fixture.leaderboardTabs)[number]["id"] | (typeof fixture.courseTabs)[number]["id"];
  const [active, setActive] = useState<TabId>(item.active);
  const tabs = item.active === "progress" ? fixture.courseTabs : fixture.leaderboardTabs;

  return (
    <>
      <NavigationTabs
        testID={item.id}
        tabs={tabs}
        activeId={active}
        onTabPress={setActive}
        accessibilityLabel={item.active === "progress" ? "Navigasi mata kuliah" : "Jenis peringkat"}
        moreLabel={fixture.more}
        closeLabel={fixture.close}
        theme={item.theme}
      />
      <View style={styles.pageGutter} role="tabpanel">
        <ExampleText theme={item.theme} testID={`${item.id}-active`}>
          {tabs.find(({ id }) => id === active)?.label}
        </ExampleText>
      </View>
    </>
  );
}

function DialogCase({ item, geometryMarker }: { item: DialogCaseProps; geometryMarker?: ReactNode }) {
  const [open, setOpen] = useState(item.open);
  const [reason, setReason] = useState<string>(item.theme === "dark" ? fixture.dialog.longReason : "");
  const [error, setError] = useState(item.id === "shared-dialog-validation-light");
  const [submitted, setSubmitted] = useState(false);
  const reasonRef = useRef<ComponentRef<typeof TextInput>>(null);
  const triggerRef = useRef<ComponentRef<typeof Pressable>>(null);
  const { dialog } = fixture;
  const colors = nativeColors[item.theme];
  const panelId = `${item.id}-panel`;

  function submit() {
    if (!reason.trim()) {
      setError(true);
      reasonRef.current?.focus();
      if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(dialog.error);
      return;
    }
    setOpen(false);
    setSubmitted(true);
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(dialog.success);
  }

  return (
    <View style={styles.pageGutter}>
      <Button ref={triggerRef} testID={`${item.id}-trigger`} theme={item.theme} variant="outline"
        onPress={() => { setSubmitted(false); setError(false); setOpen(true); }} accessibilityState={{ expanded: open }}>
        {dialog.trigger}
      </Button>
      {submitted ? <ExampleText theme={item.theme} status>{dialog.success}</ExampleText> : null}
      <SharedDialog
        open={open}
        onDismiss={() => setOpen(false)}
        title={dialog.title}
        description={dialog.description}
        closeLabel={fixture.close}
        returnFocusRef={triggerRef}
        theme={item.theme}
        testID={panelId}
        footer={
          <SharedDialogFooter>
            <Button theme={item.theme} variant="outline" onPress={() => setOpen(false)}>{dialog.cancel}</Button>
            <Button testID={`${item.id}-submit`} theme={item.theme} onPress={submit}>{dialog.submit}</Button>
          </SharedDialogFooter>
        }
      >
        {geometryMarker}
        <Label theme={item.theme} onPress={() => reasonRef.current?.focus()}>{dialog.field}</Label>
        <Textarea
          ref={reasonRef}
          theme={item.theme}
          testID={`${item.id}-reason`}
          accessibilityLabel={dialog.field}
          accessibilityHint={error ? dialog.error : undefined}
          placeholder={dialog.placeholder}
          style={error ? { borderColor: colors.destructive } : undefined}
          value={reason}
          onChangeText={(text) => {
            setReason(text);
            if (text.trim()) setError(false);
          }}
        />
        {error ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
            style={[nativeTypography.bodyRegular, styles.body, { color: colors.destructive }]}>
            {dialog.error}
          </Text>
        ) : null}
      </SharedDialog>
    </View>
  );
}

function OptionRow({
  label,
  selected,
  theme,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  theme: "light" | "dark";
  onPress: () => void;
  testID?: string;
}) {
  const colors = nativeColors[theme];
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.option,
        (selected || pressed) && { backgroundColor: `${colors.muted}80` },
        focused && { outlineColor: colors.accent, outlineWidth: 2, outlineOffset: -2 },
      ]}
    >
      <Text style={[styles.optionLabel, nativeTypography.bodyMedium, { color: colors.foreground }]}>{label}</Text>
      {selected ? <NavigationIcon name="check" color={colors.primary} size={16} /> : null}
    </Pressable>
  );
}

function SheetCase({ item, geometryMarker }: { item: SheetCaseProps; geometryMarker?: ReactNode }) {
  const [open, setOpen] = useState(item.open);
  const [active, setActive] = useState<string>(fixture.sheet.chapters[0]);
  const triggerRef = useRef<ComponentRef<typeof Pressable>>(null);
  const chapters = item.theme === "dark" ? fixture.sheet.chapters : fixture.sheet.chapters.slice(0, 3);

  return (
    <View style={styles.pageGutter}>
      <Button ref={triggerRef} testID={`${item.id}-trigger`} theme={item.theme} variant="outline"
        onPress={() => setOpen(true)} accessibilityState={{ expanded: open }}>
        {fixture.sheet.title}
      </Button>
      <ExampleText theme={item.theme} status testID={`${item.id}-chapter`}>{active}</ExampleText>
      <SharedSheet
        open={open}
        onDismiss={() => setOpen(false)}
        title={fixture.sheet.title}
        closeLabel={fixture.close}
        theme={item.theme}
        returnFocusRef={triggerRef}
        testID={`${item.id}-panel`}
      >
        {geometryMarker}
        {chapters.map((label, index) => (
          <OptionRow
            key={label}
            label={`${index + 1}. ${label}`}
            selected={active === label}
            theme={item.theme}
            testID={`${item.id}-chapter-${index + 1}`}
            onPress={() => { setActive(label); setOpen(false); }}
          />
        ))}
      </SharedSheet>
    </View>
  );
}

function PopoverCase({ item, geometryMarker }: { item: PopoverCaseProps; geometryMarker?: ReactNode }) {
  const [open, setOpen] = useState(item.open);
  const options = item.theme === "dark" ? fixture.popover.courses : fixture.popover.options;
  const [active, setActive] = useState<string>(options[0]);
  const triggerRef = useRef<ComponentRef<typeof Pressable>>(null);

  return (
    <View style={styles.pageGutter}>
      <View style={styles.popoverTrigger}>
        <ExampleText theme={item.theme} status testID={`${item.id}-selection`}>{active}</ExampleText>
        <SharedPopoverAnchor>
          <Button ref={triggerRef} testID={`${item.id}-trigger`} onPress={() => setOpen(true)}
            theme={item.theme} variant="outline" accessibilityState={{ expanded: open }}>
            {fixture.popover.title}
          </Button>
          <SharedPopover
            open={open}
            onDismiss={() => setOpen(false)}
            title={item.theme === "dark" ? fixture.popover.courseField : fixture.popover.field}
            closeLabel={fixture.close}
            anchorRef={triggerRef}
            align="end"
            theme={item.theme}
            testID={`${item.id}-panel`}
          >
            {geometryMarker}
            {options.map((label, index) => (
              <OptionRow key={label} label={label} selected={active === label} theme={item.theme}
                testID={`${item.id}-option-${index + 1}`} onPress={() => { setActive(label); setOpen(false); }} />
            ))}
          </SharedPopover>
        </SharedPopoverAnchor>
      </View>
    </View>
  );
}

export function NavigationCase({ id, geometryMarker }: { id: NavigationCaseId; geometryMarker?: ReactNode }) {
  const item = navigationCases.find((entry) => entry.id === id);
  if (!item) return null;
  switch (item.component) {
    case "mobile-navbar":
      return <NavbarCase key={id} item={item} />;
    case "bottom-navigation":
      return <BottomCase key={id} item={item} />;
    case "navigation-tabs":
      return <TabsCase key={id} item={item} />;
    case "shared-dialog":
      return <DialogCase key={id} item={item} geometryMarker={geometryMarker} />;
    case "shared-sheet":
      return <SheetCase key={id} item={item} geometryMarker={geometryMarker} />;
    case "shared-popover":
      return <PopoverCase key={id} item={item} geometryMarker={geometryMarker} />;
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pageGutter: { margin: 16, gap: 10, alignItems: "flex-start" },
  body: { fontSize: 14, lineHeight: 20 },
  option: { minHeight: 44, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 10 },
  optionLabel: { flex: 1, fontSize: 14, lineHeight: 20 },
  popoverTrigger: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
});
