"""Observe exact public URL handoffs from the Android release app in a real Chrome tab."""

from contextlib import ExitStack
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time


APP = "com.zyx.academy.nativeparity"
CHROME = "com.android.chrome"
ORIGIN = "https://staging.zyxacademy.com"
SCHEME = "zyx-native-parity://"
COMMAND_LINE = "/data/local/tmp/chrome-command-line"
ROOT = Path(__file__).resolve().parents[2]
CASES = {
    "marketing": "/about?ref=native-smoke",
    "blog": "/en/blog/native-smoke?category=learn%2Fread&tag=one&tag=two#article",
    "directory": "/tautan?q=native%2Bsmoke",
    "form": "/forms/native-smoke?ref=android",
    "meeting": "/meet/native-smoke?ref=android",
    "short-link": "/f/native-smoke?ref=android",
    "unsubscribe": "/unsubscribe?token=synthetic-native-smoke",
}
COLD_PATH = "/about?source=cold-native-smoke&flag"
RETRY_PATH = "/f/native-retry?slug=query&flag&tag=one&tail=%2f&tag=two#back"
BACK_PATH = "/meet/native-smoke?source=dismiss"

ACTIVITY = r"ActivityRecord\{(?P<token>\w+)\s+u\d+\s+(?P<component>[^\s}]+)"
RESUMED = re.compile(r"^\s*Resumed:\s+" + ACTIVITY, re.MULTILINE)
HISTORY = re.compile(r"^\s*\*?\s*Hist\s+#\d+:\s+" + ACTIVITY, re.MULTILINE)


def browser_intent(dump, expected_url):
    """Match the resumed Chrome record and its own full Intent, including the query."""
    resumed = RESUMED.search(dump)
    if not resumed:
        return None
    component = resumed["component"]
    if not component.startswith(CHROME + "/") or "CustomTabActivity" not in component:
        return None
    records = list(HISTORY.finditer(dump))
    for index, record in enumerate(records):
        if record["token"] != resumed["token"] or record["component"] != component:
            continue
        end = records[index + 1].start() if index + 1 < len(records) else resumed.start()
        detail = dump[record.end():end]
        launcher = re.search(r"\blaunchedFromPackage=(\S+)", detail)
        intent = re.search(r"^\s*Intent \{([^\n]+)\}", detail, re.MULTILINE)
        if launcher and launcher[1] in {APP, CHROME} and intent:
            fields = intent[1].split()
            if "act=android.intent.action.VIEW" in fields and f"dat={expected_url}" in fields:
                return f"{component}\nlaunchedFromPackage={launcher[1]}\n{intent[0].strip()}\n"
    return None


def run(device, maestro, output):
    if (os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("RUNNER_ENVIRONMENT") != "github-hosted"
            or not re.fullmatch(r"emulator-\d+", device)):
        raise ValueError("The browser test requires an isolated GitHub-hosted Android emulator.")
    output.mkdir(parents=True, exist_ok=True)

    def adb(*args, check=True, text=True, timeout=15):
        return subprocess.run(["adb", "-s", device, *args], check=check, capture_output=True,
                              text=text, timeout=timeout).stdout

    def shell(*args, **options):
        return adb("shell", shlex.join(args), **options)

    def open_native(path):
        return shell("am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", SCHEME + path.lstrip("/"), APP, timeout=30)

    def flow(case, name):
        subprocess.run([
            maestro, "--platform", "android", "--device", device, "test", "--format", "junit",
            "--output", str(case / f"{name}.xml"), "--test-output-dir", str(case / f"{name}-results"),
            "--debug-output", str(case / f"{name}-logs"), str(ROOT / f".maestro/native-integration/helpers/{name}.yaml"),
        ], check=True, timeout=45)

    def verify_browser(target, path, native_flow):
        deadline = time.monotonic() + 20
        expected = ORIGIN + path
        while True:
            dump = shell("dumpsys", "activity", "-a", "activities")
            evidence = browser_intent(dump, expected)
            if evidence:
                break
            if time.monotonic() >= deadline:
                (target / "activities.txt").write_text(dump)
                raise RuntimeError(f"Chrome did not open the expected public URL for {target.name}.")
            time.sleep(0.5)

        (target / "browser-intent.txt").write_text(evidence)
        (target / "browser.png").write_bytes(adb("exec-out", "screencap", "-p", text=False))
        shell("input", "keyevent", "KEYCODE_BACK")
        flow(target, native_flow)
        print(f"Verified Chrome handoff and native return for {target.name}.", flush=True)

    with ExitStack() as cleanup:
        if shell("id", "-u").strip() != "0":
            adb("root")
            cleanup.callback(adb, "unroot", check=False)
            adb("wait-for-device")
        if shell("id", "-u").strip() != "0":
            raise RuntimeError("App egress cannot be isolated without emulator root.")

        # Keep ADB and Android network validation usable. Prevent IPv4 and IPv6
        # traffic from Chrome and app or isolated UIDs before opening any link.
        rule = ("-m", "owner", "--uid-owner", "10000-99999", "!", "-o", "lo", "-j", "REJECT")
        for family in ("iptables", "ip6tables"):
            shell(family, "-I", "OUTPUT", "1", *rule)
            cleanup.callback(shell, family, "-D", "OUTPUT", *rule)
        (output / "network.txt").write_text("IPv4 and IPv6 app egress blocked for browser handoff checks.\n")

        shell("test", "!", "-e", COMMAND_LINE)
        cleanup.callback(shell, "rm", "-f", COMMAND_LINE)
        flags = "chrome --disable-fre --disable-startup-promos-for-testing"
        adb("shell", f"printf '%s\\n' {shlex.quote(flags)} > {COMMAND_LINE}")
        shell("chmod", "644", COMMAND_LINE)
        if shell("cat", COMMAND_LINE).strip() != flags:
            raise RuntimeError("The Chrome fixture startup flags could not be written.")
        cleanup.callback(shell, "am", "force-stop", CHROME)

        before = output / "before"
        before.mkdir(exist_ok=True)
        (before / "start.txt").write_text(open_native("/sign-up?locale=en"))
        flow(before, "guest-sign-up")
        for case, path in CASES.items():
            target = output / case
            target.mkdir(exist_ok=True)
            shell("am", "force-stop", CHROME)
            (target / "start.txt").write_text(open_native(path))
            verify_browser(target, path, "guest-sign-up")

        cold = output / "cold"
        cold.mkdir(exist_ok=True)
        shell("am", "force-stop", APP)
        shell("am", "force-stop", CHROME)
        (cold / "start.txt").write_text(open_native(COLD_PATH))
        verify_browser(cold, COLD_PATH, "guest-sign-in")

        before_recovery = output / "before-recovery"
        before_recovery.mkdir(exist_ok=True)
        (before_recovery / "start.txt").write_text(open_native("/sign-up?locale=en"))
        flow(before_recovery, "guest-sign-up")

        for name, path, retry in (("browser-retry", RETRY_PATH, True), ("browser-back", BACK_PATH, False)):
            target = output / name
            target.mkdir(exist_ok=True)
            # The fixture has Chrome as its browser. Disabling the package
            # exercises Expo's actual no-matching-activity failure.
            shell("pm", "disable-user", "--user", "0", CHROME)
            try:
                (target / "start.txt").write_text(open_native(path))
                flow(target, "website-unavailable")
                if not retry:
                    flow(target, "website-back")
            finally:
                shell("pm", "enable", "--user", "0", CHROME)
            if retry:
                flow(target, "website-retry")
                verify_browser(target, path, "guest-sign-up")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(f"Usage: {sys.argv[0]} <device> <maestro> <output>")
    run(sys.argv[1], sys.argv[2], Path(sys.argv[3]))
