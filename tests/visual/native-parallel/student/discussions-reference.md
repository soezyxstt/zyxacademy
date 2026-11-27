# Student discussion references

Each reference enters the indicated source route in Chromium and renders the production discussion workspace in Indonesian light mode. The browser supplies a synthetic Student session and serves workspace responses from the same Student fixture transport used by the native app. These captures cover the workspace, including the channel scope, targeted thread and empty list. They do not represent signed production traffic or a comparison of the complete navigation shell.

| Source route | Verified outcome |
| --- | --- |
| `/discussions` | The Student alias opens `/dashboard/discussions`, keeping the query and targeted message. A separate browser navigation and native route assertion verify preservation of repeated search parameters. |
| `/dashboard/discussions` | The canonical workspace opens directly, with all channels selected in the list and empty states. |
| `/courses/[id]/discussions` | The `matematika-1` workspace opens directly. Its channel catalog and list requests remain scoped to `channel-math`. |

The capture spec opens each route and each state in a fresh browser context at the Android and iOS reference extents. The alias and its canonical route can render the same pixels because both resolve to the same workspace. Their manifests record independently observed document navigations. Each corresponding Maestro flow enters its own source path and checks the visible locale/theme marker and destination state before capturing.

```sh
PLAYWRIGHT_BASE_URL=http://student-discussions-reference.invalid \
  node_modules/.bin/playwright test tests/visual/native-parallel/student/discussions-reference.spec.ts \
  --project=mobile-380
```
