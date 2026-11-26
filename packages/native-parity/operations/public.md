# Historical Operations public fixtures

The 13 public route patterns now run on Next.js in the browser. The native implementations and 39 deterministic cases below record earlier experiments. In an Operations fixture build, `zyx-native-parity://operations-fixture?caseId=operations-public-blog-list-open-back` still opens the historical blog case. Set `NATIVE_PARITY_PUBLIC_FIXTURES=1` when running the capture script manually and pass `--include-public-fixtures` to the comparison script to include those diagnostics. The default Operations job measures protected Admin fixtures. Historical public captures and browser handoffs receive no native readiness credit. [Case registry](public-fixtures.ts).

| Pattern | Native flow | Remaining comparison or integration |
|---|---|---|
| `/` | Landing narrative with local quiz feedback, scripted Zyra conversation, flashcard grading, mastery profile switching, FAQ and navigation | Device comparison for stacked and wide layouts |
| `/about` | Story, principles, founders, photos, biographies and public profiles | Native image and layout comparison |
| `/blog` | Lead and recent entries, categories, scoped pagination, empty and retry | Device image, typography and ScrollView position comparison |
| `/blog/[slug]` | Published article, metadata, native share, related articles and Back | Rich Markdown, math and interactive visuals require the renderer binding. The base reader handles paragraphs, headings, lists, links and images. |
| `/demo` | Course selection and guest learning entry links | Web learning dashboard metrics and session activity |
| `/demo/[view]` | Native catalogue, overview, documents, article and Diktat completion, flashcard reviews, signed quiz practice, progress, study path, mastery, and tryout list | Complex article visuals, mastery graph, and the browser journeys below |
| `/download` | Stable or Nightly status, platform links, missing assets and retry | Icon and device installer handoff comparison |
| `/forms-playground` | Local-only validation, course selection, file size/type/removal, agreement, mock submit and reset | The Expo system picker returns local file metadata. Device selection and cancellation require runtime checks. |
| `/plans` | Bounded participant/subject selection, per-person and semester quotes, discounts, signup and WhatsApp drafts | Pricing promotion banner and timer comparison |
| `/privacy` | Both locales, complete policy text, section navigation and contact/terms links | Device text, scrolling and accessibility comparison |
| `/terms` | Both locales, complete terms text, section navigation and contact/privacy links | Device text, scrolling and accessibility comparison |
| `/testimonial` | Shared published stories and photos, signup and plans links | Native image and layout comparison |
| `/unsubscribe` | Token inspection, explicit confirmation, invalid and retry states | Real email deep-link handling and device accessibility |

The `/demo/[view]` entry recognizes all 37 documented views, with 13 native views and 24 browser handoffs. The detailed browser workflows are `achievements`, `course-discussions`, `course-leaderboard`, `discussions`, `feedback`, `groups`, `history`, `leaderboard`, `live`, `notifications`, `pet`, `playground`, `profile`, `profile-edit`, `quiz-review`, `quiz-summary`, `reflections`, `results`, `schedule`, `settings`, `tryout`, `tryout-review`, `video` and `zyra`. The browser URL carries the active course, selection and locale. The native view remains in history and has a demo Back action. The native tryout list links to the browser-based tryout flow. Browser-to-app return behavior requires device validation.

| Operation | Web source and authorization | Native behavior |
|---|---|---|
| Home learning frames | Web marketing quiz, scripted conversation, flashcards and mastery profiles | The quiz, grades and mastery profiles share example data with web. Tap to play the tutor transcript and show its source references. All interaction state stays on the landing screen. |
| Blog list, category and article | Marketing blog repository. Guest query selects published records. Web staff access keeps existing server role check. | Guest results come from `GET /api/native/public/blog` and `GET /api/native/public/blog/{slug}`. Unpublished and missing detail share 404. Network failure supports retry. |
| Demo summaries and product views | Existing public demo summaries, selection validation and free-first-chapter resolver | Read-only projection under `GET /api/native/public/demo[/{view}]`. The quiz payload has scoped IDs and token, with answer data omitted. Progress uses fictional snapshot totals, path uses snapshot focus topics, mastery uses the public web mastery projection, and tryout list exposes synthetic exam metadata. |
| Demo progress changes | Existing revision-scoped demo overlay and progress calculation | Reading completion, flashcard reviews, and finishing every page of the signed quiz update the device-local overlay. Partial quiz progress stays in the current app session. Reset clears the current course revision. Device and browser progress have separate storage. |
| Demo grade | Existing `POST /api/demo/quiz`; exact question order and signed content revision | Score and per-question feedback. Reload on stale token, retry on network failure. |
| Published release | Existing `GET /api/app/latest` and download channel selection | Uses published release metadata and browser for available artifacts. |
| Plan quote | Existing discount settings, price calculation and public WhatsApp formatter | `POST /api/native/public/plans` validates quantities, supported subjects and locale. Reads only, with the link opening a draft in WhatsApp. |
| Email unsubscribe | Existing signed category capability, expiry and preference write | `POST /api/native/public/unsubscribe` sends token in the body. Inspection returns only category and confirm is repeatable. Concurrent category confirmations update only the affected preference. |
| Playground form | Local form and fake submit in the web page | Validation and submit stay on device, with the picker returning file metadata only. |

- Local validation includes the 39-case registry, route validation, guest transport, retry and pagination, local PostgreSQL-backed blog and pricing/email tests, and the public demo projection and grading checks in `tests/contracts/demo-scoped-loaders.test.ts`. The device scenario in `.maestro/native-parallel/operations/public-demo-learning.yaml` covers local article completion, progress, mastery navigation, duration planning and the tryout handoff.
- MCP compatibility review found no change to the tool list, scopes, consent, discovery, host prompts, skills or environment bindings. The guest operations reuse existing public capability boundaries. Blog staff preview still uses the web role guard.
- Android and iOS pixel comparisons and device runtime sign-off are pending. Web reference artifacts are tracked at the operations PR level. Local contract tests establish request and projection behavior for synthetic data. They do not establish visual parity, release installation, browser return, system picker or real email processing.
