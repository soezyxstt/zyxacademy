import type { Metadata } from "next";
import {
  LandingClosingCta,
  LandingCoursePreview,
  LandingDemoFlashcards,
  LandingDemoPath,
  LandingDemoQuiz,
  LandingDemoTutor,
  LandingForTutors,
  LandingHero,
  LandingLearningLoop,
  LandingFaq,
  LandingProof,
  LandingPricingPreview,
  LandingTutorSupport,
} from "@/components/landing";
import { pageTitle, siteDescription } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle(),
  description: siteDescription,
};

export default function Home() {
  return (
    <div className="flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Zyx Academy",
            "alternateName": ["Zyx", "Zyx Academy"],
            "url": "https://www.zyxacademy.com",
          }),
        }}
      />
      <LandingHero />
      <LandingProof />
      <LandingLearningLoop />
      <LandingDemoQuiz />
      <LandingDemoTutor />
      <LandingDemoFlashcards />
      <LandingDemoPath />
      <LandingTutorSupport />
      <LandingForTutors />
      <LandingCoursePreview />
      <LandingPricingPreview />
      <LandingFaq />
      <LandingClosingCta />
    </div>
  );
}
