import Image from "next/image";
import { testimonialStories } from "@/lib/testimonials";

export function TestimonialCarousel({ excludeStoryIds = [] }: { excludeStoryIds?: string[] }) {
  const stories = testimonialStories.filter((story) => !excludeStoryIds.includes(story.id));

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {stories.map((story) => (
        <figure
          key={story.id}
          itemScope
          itemType="https://schema.org/Review"
          className="flex min-h-full flex-col rounded-2xl border border-border/70 bg-card/70 backdrop-blur-md p-5 shadow-xs ring-1 ring-black/[0.03]"
        >
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <Image
              src={story.avatarSrc}
              alt={`Foto ${story.name}`}
              width={56}
              height={56}
              className="photo-thumb size-14 ring-1 ring-border"
            />
            <figcaption className="min-w-0">
              <span itemProp="author" itemScope itemType="https://schema.org/Person">
                <span itemProp="name" className="block truncate font-heading text-body-base font-semibold text-foreground">
                  {story.name}
                </span>
              </span>
              <span className="block truncate text-body-sm text-muted-foreground">
                {story.program} / {story.location}
              </span>
            </figcaption>
          </div>

          <blockquote itemProp="reviewBody" className="mt-5 flex-1 text-body-base leading-relaxed text-foreground/90">
            &ldquo;{story.quote}&rdquo;
          </blockquote>
        </figure>
      ))}
    </div>
  );
}
