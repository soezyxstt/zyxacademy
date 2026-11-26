import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards-server";
import { QuestionBankClient } from "./questions-client";
import { HistoricalQuestionsClient } from "./historical-questions-client";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { Library, MoreHorizontal, Target, Zap } from "lucide-react";
import { QuestionBankTabs } from "./question-bank-tabs";
import { readQuestionBank } from "./question-bank-read-model";
import type { QuestionSearchParams } from "./question-query-state";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminEval");
  return { title: pageTitle(t("metadata.questionBank")) };
}

export default async function AIQuestionsPage({ searchParams }: { searchParams: Promise<QuestionSearchParams> }) {
  const { user } = await assertTutorOrAdmin();
  const { query, historicalQuery, total, historicalTotal, questions, historicalQuestions, courses, courseMap, canonicalCourseMap, authoringCourses } =
    await readQuestionBank(user.id, await searchParams);
  const t = await getTranslations("adminEval");

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={Library}
        title={<TranslatedText namespace="adminEval" messageKey="routes.questionBank" />}
      />
      <QuestionBankTabs
        value={query.tab}
        tabs={
          <TabsList>
            <TabsTrigger value="ai-generated"><TranslatedText namespace="adminEval" messageKey="routes.activeQuestions" /></TabsTrigger>
            <TabsTrigger value="historical"><TranslatedText namespace="adminEval" messageKey="routes.historicalQuestions" /></TabsTrigger>
          </TabsList>
        }
        toolbarTrailing={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-lg" aria-label={t("routes.questionTools")} className="shrink-0">
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/admin/jobs">
                  <Zap className="size-4" aria-hidden />
                  <TranslatedText namespace="adminEval" messageKey="routes.generationJobs" />
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/admin/distractors">
                  <Target className="size-4" aria-hidden />
                  <TranslatedText namespace="adminEval" messageKey="routes.distractors" />
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >

        <TabsContent value="ai-generated" className="w-full space-y-4">
          {query.tab === "ai-generated" && <QuestionBankClient
            query={query}
            total={total}
            questions={questions}
            courses={courses}
            courseMap={courseMap}
            canonicalCourseMap={canonicalCourseMap}
            authoringCourses={authoringCourses}
          />}
        </TabsContent>

        <TabsContent value="historical" className="w-full space-y-4">
          {query.tab === "historical" && <HistoricalQuestionsClient
            query={{ ...historicalQuery, tab: "historical" }}
            total={historicalTotal}
            questions={historicalQuestions}
            courses={courses}
            courseMap={courseMap}
            canonicalCourseMap={canonicalCourseMap}
          />}
        </TabsContent>
      </QuestionBankTabs>
    </div>
  );
}
