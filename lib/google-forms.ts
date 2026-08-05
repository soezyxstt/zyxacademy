/**
 * Google Forms REST API v1 Client Library
 *
 * Provides typed helpers for:
 * 1. OAuth2 token refresh (using GOOGLE_FORMS_REFRESH_TOKEN or fallback to GOOGLE_MEET_REFRESH_TOKEN)
 * 2. Form creation & batch update (adding questions: multiple choice, text, checkboxes, rating scale)
 * 3. Form details and public responder URI generation
 * 4. Response list retrieval & analytics calculation for Recharts visualizations
 */

// ── TYPES & INTERFACES ───────────────────────────────────────────────────────

export interface GoogleFormInfo {
  title: string;
  documentTitle?: string;
  description?: string;
}

export interface Option {
  value: string;
  isCustom?: boolean;
}

export interface ChoiceQuestion {
  type: "CHOICE_TYPE_UNSPECIFIED" | "RADIO" | "CHECKBOX" | "DROP_DOWN";
  options: Option[];
  shuffle?: boolean;
}

export interface TextQuestion {
  paragraph?: boolean;
}

export interface ScaleQuestion {
  low: number;
  high: number;
  lowLabel?: string;
  highLabel?: string;
}

export interface Question {
  questionId: string;
  required?: boolean;
  choiceQuestion?: ChoiceQuestion;
  textQuestion?: TextQuestion;
  scaleQuestion?: ScaleQuestion;
}

export interface FormItem {
  itemId: string;
  title: string;
  description?: string;
  questionItem?: {
    question: Question;
  };
}

export interface GoogleForm {
  formId: string;
  info: GoogleFormInfo;
  settings?: any;
  items?: FormItem[];
  revisionId?: string;
  responderUri: string;
  linkedSheetId?: string;
}

export interface Answer {
  questionId: string;
  textAnswers?: {
    answers: { value: string }[];
  };
  fileUploadAnswers?: any;
  grade?: any;
}

export interface FormResponse {
  responseId: string;
  createTime: string; // ISO 8601
  lastSubmittedTime: string;
  respondentEmail?: string;
  answers?: Record<string, Answer>; // Keyed by questionId
  totalScore?: number;
}

export interface ListFormResponsesResponse {
  responses?: FormResponse[];
  nextPageToken?: string;
}

export interface FormQuestionAnalytics {
  questionId: string;
  title: string;
  type: "choice" | "text" | "scale" | "other";
  totalAnswers: number;
  optionsBreakdown?: { label: string; count: number; percentage: number }[];
  scaleDistribution?: { rating: number; count: number }[];
  sampleTextAnswers?: string[];
}

export interface ResponseMatrixRow {
  responseId: string;
  createTime: string;
  respondentEmail: string;
  answers: Record<string, string>; // Keyed by Question Title
}

export interface CompleteFormAnalytics {
  formId: string;
  title: string;
  description?: string;
  responderUri: string;
  totalSubmissions: number;
  totalQuestions: number;
  questionAnalytics: FormQuestionAnalytics[];
  submissionTimeline: { date: string; count: number }[];
  responseMatrix: ResponseMatrixRow[];
}

export type QuestionType =
  | "TEXT"
  | "PARAGRAPH"
  | "RADIO"
  | "CHECKBOX"
  | "DROP_DOWN"
  | "FILE_UPLOAD"
  | "SCALE"
  | "RATING"
  | "GRID_RADIO"
  | "GRID_CHECKBOX"
  | "DATE"
  | "TIME";

export interface CreateCustomQuestionInput {
  title: string;
  description?: string;
  type: QuestionType;
  required?: boolean;
  options?: string[]; // For RADIO, CHECKBOX, DROP_DOWN
  scaleLow?: number; // Default: 1
  scaleHigh?: number; // Default: 5
  scaleLowLabel?: string;
  scaleHighLabel?: string;
  gridRows?: string[]; // For GRID_RADIO, GRID_CHECKBOX
  gridColumns?: string[]; // For GRID_RADIO, GRID_CHECKBOX
}

// ── AUTHENTICATION HELPER ─────────────────────────────────────────────────────

/**
 * Exchanges the Google Forms Refresh Token (or fallback Meet token) for an access token.
 */
export async function getGoogleFormsAccessToken(): Promise<string> {
  const refreshToken =
    process.env.GOOGLE_FORMS_REFRESH_TOKEN?.trim() ||
    process.env.GOOGLE_MEET_REFRESH_TOKEN?.trim();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!refreshToken) {
    throw new Error(
      "Missing GOOGLE_FORMS_REFRESH_TOKEN or GOOGLE_MEET_REFRESH_TOKEN in environment variables."
    );
  }
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables."
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Failed to refresh Google Forms OAuth token (${res.status}): ${errorBody}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token.trim();
}

/**
 * Base HTTP fetch wrapper with OAuth Bearer Token for Google Forms API.
 */
async function formsApiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = await getGoogleFormsAccessToken();
  const url = endpoint.startsWith("https://")
    ? endpoint
    : `https://forms.googleapis.com/v1/${endpoint.replace(/^\//, "")}`;

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (options.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `Google Forms API error (${res.status} ${res.statusText}) on ${url}: ${errorText}`
    );
  }

  return (await res.json()) as T;
}

// ── FORM CREATION & MANAGEMENT ───────────────────────────────────────────────

/**
 * Creates a new blank Google Form with a title.
 * Google Forms API only accepts info.title when creating a form.
 */
export async function createGoogleForm(title: string): Promise<GoogleForm> {
  const form = await formsApiFetch<GoogleForm>("forms", {
    method: "POST",
    body: JSON.stringify({
      info: {
        title,
      },
    }),
  });

  return form;
}

/**
 * Sends a batchUpdate request to add or modify items/questions in a Google Form.
 */
export async function batchUpdateGoogleForm(
  formId: string,
  requests: any[]
): Promise<GoogleForm> {
  const fId = formId.replace(/^forms\//, "");
  return await formsApiFetch<GoogleForm>(`forms/${fId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

/**
 * Creates a complete Google Form with description and custom questions.
 */
export async function createCustomGoogleForm(
  title: string,
  description: string | undefined,
  questions: CreateCustomQuestionInput[]
): Promise<GoogleForm> {
  // 1. Create base form (Title only)
  const initialForm = await createGoogleForm(title);
  const formId = initialForm.formId;

  const batchRequests: any[] = [];

  // 2. Add description update if present
  if (description && description.trim()) {
    batchRequests.push({
      updateFormInfo: {
        info: {
          description: description.trim(),
        },
        updateMask: "description",
      },
    });
  }

  // 3. Build batchUpdate requests for questions
  if (questions && questions.length > 0) {
    const createItemRequests = questions.map((q, index) => {
      const isGrid = q.type === "GRID_RADIO" || q.type === "GRID_CHECKBOX";

      if (isGrid) {
        return {
          createItem: {
            item: {
              title: q.title || `Grid Pertanyaan #${index + 1}`,
              description: q.description?.trim() || undefined,
              questionGroupItem: {
                grid: {
                  columns: {
                    type: q.type === "GRID_RADIO" ? "RADIO" : "CHECKBOX",
                    options: (q.gridColumns || ["Kolom 1", "Kolom 2"]).map((c) => ({ value: c })),
                  },
                },
                questions: (q.gridRows || ["Baris 1", "Baris 2"]).map((r) => ({
                  rowQuestion: { title: r },
                  required: q.required ?? true,
                })),
              },
            },
            location: {
              index,
            },
          },
        };
      }

      const questionObj: any = {
        required: q.required ?? true,
      };

      if (q.type === "RADIO" || q.type === "CHECKBOX" || q.type === "DROP_DOWN") {
        questionObj.choiceQuestion = {
          type: q.type,
          options: (q.options || ["Pilihan 1", "Pilihan 2"]).map((opt) => ({ value: opt })),
        };
      } else if (q.type === "TEXT") {
        questionObj.textQuestion = { paragraph: false };
      } else if (q.type === "PARAGRAPH") {
        questionObj.textQuestion = { paragraph: true };
      } else if (q.type === "SCALE") {
        questionObj.scaleQuestion = {
          low: q.scaleLow ?? 1,
          high: q.scaleHigh ?? 5,
          lowLabel: q.scaleLowLabel || "Sangat Buruk",
          highLabel: q.scaleHighLabel || "Sangat Baik",
        };
      } else if (q.type === "RATING") {
        questionObj.scaleQuestion = {
          low: 1,
          high: 5,
          lowLabel: "1 Bintang",
          highLabel: "5 Bintang",
        };
      } else if (q.type === "FILE_UPLOAD") {
        questionObj.fileUploadQuestion = {
          types: ["ANY"],
          maxFiles: 1,
        };
      } else if (q.type === "DATE") {
        questionObj.dateQuestion = {
          includeTime: false,
          includeYear: true,
        };
      } else if (q.type === "TIME") {
        questionObj.timeQuestion = {
          duration: false,
        };
      }

      return {
        createItem: {
          item: {
            title: q.title || `Pertanyaan #${index + 1}`,
            description: q.description?.trim() || undefined,
            questionItem: {
              question: questionObj,
            },
          },
          location: {
            index,
          },
        },
      };
    });

    batchRequests.push(...createItemRequests);
  }

  if (batchRequests.length === 0) {
    return initialForm;
  }

  const updatedForm = await batchUpdateGoogleForm(formId, batchRequests);
  return updatedForm;
}

/**
 * Gets details and structure of a specific Google Form.
 */
export async function getGoogleForm(formId: string): Promise<GoogleForm> {
  const fId = formId.replace(/^forms\//, "");
  return await formsApiFetch<GoogleForm>(`forms/${fId}`);
}

/**
 * Lists all submitted responses for a Google Form.
 */
export async function listGoogleFormResponses(
  formId: string,
  pageSize = 500,
  pageToken?: string
): Promise<ListFormResponsesResponse> {
  const fId = formId.replace(/^forms\//, "");
  const params = new URLSearchParams({ pageSize: pageSize.toString() });
  if (pageToken) params.set("pageToken", pageToken);

  return await formsApiFetch<ListFormResponsesResponse>(
    `forms/${fId}/responses?${params.toString()}`
  );
}

// ── DATA VISUALIZATION & ANALYTICS ENGINE ─────────────────────────────────────

/**
 * Computes structured, aggregated response analytics for Recharts visualizations
 * and spreadsheet response matrices.
 */
export async function getGoogleFormAnalytics(
  formId: string
): Promise<CompleteFormAnalytics> {
  const fId = formId.replace(/^forms\//, "");

  const [form, responsesRes] = await Promise.all([
    getGoogleForm(fId),
    listGoogleFormResponses(fId).catch(() => ({ responses: [] })),
  ]);

  const rawResponses = responsesRes.responses || [];
  const items = form.items || [];

  // Map question ID -> FormItem details
  const questionItemMap = new Map<string, { title: string; item: FormItem }>();
  for (const item of items) {
    if (item.questionItem?.question?.questionId) {
      questionItemMap.set(item.questionItem.question.questionId, {
        title: item.title,
        item,
      });
    }
  }

  // 1. Question Analytics Breakdown
  const questionAnalytics: FormQuestionAnalytics[] = items
    .filter((item) => item.questionItem?.question)
    .map((item) => {
      const q = item.questionItem!.question;
      const qId = q.questionId;
      const qTitle = item.title;

      let type: "choice" | "text" | "scale" | "other" = "other";
      if (q.choiceQuestion) type = "choice";
      else if (q.scaleQuestion) type = "scale";
      else if (q.textQuestion) type = "text";

      const choiceCounts = new Map<string, number>();
      const scaleCounts = new Map<number, number>();
      const sampleTextAnswers: string[] = [];
      let totalAnswers = 0;

      for (const resp of rawResponses) {
        const ans = resp.answers?.[qId];
        if (ans?.textAnswers?.answers) {
          totalAnswers++;
          for (const aVal of ans.textAnswers.answers) {
            const valStr = aVal.value;
            if (type === "choice") {
              choiceCounts.set(valStr, (choiceCounts.get(valStr) || 0) + 1);
            } else if (type === "scale") {
              const numVal = parseInt(valStr, 10);
              if (!isNaN(numVal)) {
                scaleCounts.set(numVal, (scaleCounts.get(numVal) || 0) + 1);
              }
            } else if (type === "text") {
              if (sampleTextAnswers.length < 20 && valStr.trim()) {
                sampleTextAnswers.push(valStr);
              }
            }
          }
        }
      }

      const optionsBreakdown = type === "choice"
        ? Array.from(choiceCounts.entries()).map(([label, count]) => ({
            label,
            count,
            percentage: totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0,
          }))
        : undefined;

      const scaleDistribution = type === "scale"
        ? (q.scaleQuestion
            ? Array.from(
                { length: q.scaleQuestion.high - q.scaleQuestion.low + 1 },
                (_, i) => q.scaleQuestion!.low + i
              ).map((rating) => ({
                rating,
                count: scaleCounts.get(rating) || 0,
              }))
            : [])
        : undefined;

      return {
        questionId: qId,
        title: qTitle,
        type,
        totalAnswers,
        optionsBreakdown,
        scaleDistribution,
        sampleTextAnswers: type === "text" ? sampleTextAnswers : undefined,
      };
    });

  // 2. Submission Timeline (By Date)
  const timelineMap = new Map<string, number>();
  for (const resp of rawResponses) {
    if (resp.createTime) {
      const dateStr = resp.createTime.slice(0, 10); // yyyy-MM-dd
      timelineMap.set(dateStr, (timelineMap.get(dateStr) || 0) + 1);
    }
  }

  const submissionTimeline = Array.from(timelineMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 3. Response Matrix (Spreadsheet-style rows)
  const responseMatrix: ResponseMatrixRow[] = rawResponses.map((resp) => {
    const answersByTitle: Record<string, string> = {};

    for (const [qId, ans] of Object.entries(resp.answers || {})) {
      const qMeta = questionItemMap.get(qId);
      const qTitle = qMeta ? qMeta.title : qId;
      if (ans.textAnswers?.answers) {
        answersByTitle[qTitle] = ans.textAnswers.answers.map((a) => a.value).join(", ");
      }
    }

    return {
      responseId: resp.responseId,
      createTime: resp.createTime,
      respondentEmail: resp.respondentEmail || "Anonim",
      answers: answersByTitle,
    };
  });

  return {
    formId: fId,
    title: form.info.title,
    description: form.info.description,
    responderUri: form.responderUri,
    totalSubmissions: rawResponses.length,
    totalQuestions: items.filter((i) => i.questionItem?.question).length,
    questionAnalytics,
    submissionTimeline,
    responseMatrix,
  };
}
