"use client";

import Link from "next/link";
import Image from "next/image";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Reveal } from "@/components/ui/reveal";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { Globe } from "lucide-react";
import { FaLinkedin, FaInstagram } from "react-icons/fa6";

const founders = [
  {
    id: "adi",
    name: "Adi Haditya Nursyam",
    role: "Co-Founder & Academic Lead",
    image: "/founders/adi.jpeg",
    fullBio: "Adi merupakan mahasiswa Teknik Mesin ITB angkatan 2022 yang menyelesaikan Tahap Persiapan Bersama (TPB) dengan predikat akademis tertinggi. Dipercaya menjadi asisten akademik untuk beberapa mata kuliah sains dan teknik di internal ITB, ia memiliki pemahaman matang mengenai celah dan strategi taktis menaklukkan kurikulum perkuliahan. Selain di ranah akademis, Adi konsisten memegang kendali kepemimpinan sebagai ketua tim di berbagai kepanitiaan pusat KM ITB, HMM ITB, hingga organisasi kemahasiswaan daerah dan lintas kampus. Kombinasi ini ia tuangkan untuk membangun tutor center yang tidak hanya unggul secara materi, tetapi juga adaptif dalam membimbing mahasiswa mencapai performa akademis puncaknya.",
    socials: {
      website: "https://adihnursyam.com",
      linkedin: "https://www.linkedin.com/in/adihnursyam/",
      instagram: "https://instagram.com/adihnursyam",
    },
  },
  {
    id: "dawam",
    name: "Nur Dawam Abdan Syakuro",
    role: "Co-Founder & Hardware Systems Lead",
    image: "/founders/dawam.jpeg",
    fullBio: "Mahasiswa Teknik Elektro yang berfokus pada spesialisasi FPGA, mikrokontroler, dan desain semikonduktor. Memiliki latar belakang yang kuat dalam desain sistem digital, bahasa deskripsi perangkat keras (VHDL, Verilog), serta sistem tertanam (embedded systems). Berpengalaman dalam pembelajaran berbasis proyek, kepemimpinan, dan komunikasi teknis.",
    socials: {
      linkedin: "https://www.linkedin.com/in/mawadrun/",
      instagram: "https://www.instagram.com/mawadrun/",
    },
  },
  {
    id: "heidi",
    name: "Heidi Schan Andriana",
    role: "Co-Founder & Robotics Specialist",
    image: "/founders/heidi.jpeg",
    fullBio: "Mahasiswa Teknik Elektro dengan spesialisasi di bidang robotika dan sistem otonom, memiliki pengalaman dalam pengembangan UAV (Unmanned Aerial Vehicle) dan ROV (Remotely Operated Vehicle), integrasi ROS (Robotics Operating System), serta kontrol berbasis visi (vision-based control). Memiliki ketertarikan besar dalam merancang sistem robotika otonom yang andal untuk aplikasi dunia nyata di udara maupun laut.",
    socials: {
      linkedin: "https://www.linkedin.com/in/heidischan/",
      instagram: "https://www.instagram.com/heidischan/",
    },
  },
  {
    id: "raihan",
    name: "Muhammad Raihan Fasya Mian",
    role: "Co-Founder & Fullstack Tech Lead",
    image: "/founders/raihan.png",
    fullBio: "Mahasiswa Teknik Informatika yang berfokus pada spesialisasi Blockchain Development, Smart Contracts, dan Fullstack Web Development. Memiliki latar belakang yang kuat dalam arsitektur sistem terdesentralisasi, analisis performa algoritma kriptografi, serta pengembangan aplikasi modern menggunakan framework terbaru. Berpengalaman dalam membangun dan memimpin bisnis di sektor event organizing dan startup edukasi teknologi, serta memiliki kemampuan komunikasi teknis dan kepemimpinan yang teruji.",
    socials: {
      linkedin: "https://www.linkedin.com/in/raihanmian/",
      instagram: "https://www.instagram.com/raihan_mianz/",
    },
  },
];

export function AboutClient() {
  return (
    <div className="flex flex-col relative overflow-hidden">
      <PageOrnaments variant="about" />

      {/* Section A: Hero Section with centered title text */}
      <Reveal>
        <header className="relative z-10 overflow-hidden border-b border-border bg-background/50 backdrop-blur-xs py-20 md:py-28 text-center">
          <div className="marketing-container space-y-4">
            <h1 className="font-heading text-h2 md:text-h1 font-extrabold tracking-tight text-foreground max-w-4xl mx-auto">
              Tentang kami
            </h1>
            <p className="mx-auto max-w-2xl text-body-base text-muted-foreground leading-relaxed font-normal">
              Kami membangun pengalaman belajar yang tenang dan terukur - dari TPB hingga jurusan.
            </p>
          </div>
        </header>
      </Reveal>

      {/* Section B: Visi Kami (Spacious centered flow, text-center, max-w-4xl) */}
      <Reveal>
      <SectionContainer className="relative z-10 border-b border-border bg-background/30 backdrop-blur-xs py-20 md:py-28">
        <div className="mx-auto max-w-4xl space-y-8 text-center">
          <div className="space-y-3">
            <span className="text-body-xs font-bold text-primary uppercase tracking-widest">Visi Kami</span>
            <SectionHeading as="h2" tier="primary" className="text-foreground leading-tight font-extrabold tracking-tight text-center">
              Zyx Academy: Learn Deep, Fly High
            </SectionHeading>
          </div>
          <div className="space-y-6 text-body-base text-muted-foreground leading-relaxed text-center">
            <p>
              Berdiri sejak 2022, Zyx lahir dari satu keresahan sederhana: pendidikan seringkali terasa seperti beban,
              padahal seharusnya menjadi pintu pembuka peluang.
            </p>
            <p>
              Di ITB, masa TPB adalah fondasi. Namun seringkali fondasi ini terkubur di bawah tumpukan rumus rumit
              dan materi yang tidak terstruktur. Zyx hadir sebagai jembatan bagi mahasiswa untuk melewati fase ini
              dengan cara yang lebih <span className="font-semibold text-foreground">smart</span>. Kami memangkas
              penjelasan yang bertele-tele dan menyederhanakan kompleksitas tanpa mengurangi kedalaman materi.
            </p>
            <p>
              Bersama Zyx, kamu tidak hanya menghafal informasi, kamu membangun{" "}
              <span className="font-semibold text-foreground italic">Tree of Knowledge</span> versimu sendiri sebagai
              kerangka berpikir yang kokoh, sistematis, dan relevan.
            </p>
            <p>
              Bukan hanya untuk ujian minggu depan, tapi untuk seluruh perjalanan akademik yang akan kamu hadapi. Kami percaya
              bahwa setiap orang memiliki kesempatan untuk mempertemukan minatnya dengan arahan yang tepat.
            </p>
          </div>
        </div>
      </SectionContainer>
      </Reveal>

      {/* Section C: Latar Belakang & Quote (Consistent text-left layout on desktop columns, max-w-5xl) */}
      <Reveal>
      <SectionContainer className="relative z-10 border-b border-border bg-stone-50/40 dark:bg-stone-900/5 backdrop-blur-xs py-20 md:py-28 overflow-hidden">
        <div className="max-w-5xl mx-auto grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Left Column: Quote Statement */}
          <div className="lg:col-span-5 space-y-6 text-left relative">
            <span className="absolute -left-4 -top-12 text-[140px] font-serif font-black text-stone-200/50 dark:text-stone-800/15 select-none pointer-events-none leading-none" aria-hidden>
              &ldquo;
            </span>
            <blockquote className="font-heading text-body-base font-extrabold italic text-foreground leading-relaxed tracking-tight relative z-10 text-left">
              Pendidikan seharusnya menjadi pembuka peluang, bukan tumpukan beban akademis yang menjemukan.
            </blockquote>
            <span className="block text-[10px] font-extrabold text-[var(--zx-accent)] uppercase tracking-[0.25em] text-left pt-2">
              Filosofi Pendirian Zyx
            </span>
          </div>

          {/* Right Column: Origin Background Narrative */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <div>
              <span className="text-body-xs font-bold text-primary uppercase tracking-widest text-left">Kisah Di Balik Zyx</span>
              <SectionHeading as="h2" tier="primary" className="text-foreground font-extrabold tracking-tight text-left mt-2">
                Mengapa Zyx Lahir?
              </SectionHeading>
            </div>
            <div className="space-y-6 text-body-base text-muted-foreground leading-relaxed text-left">
              <p>
                Zyx lahir di tengah kampus Ganesha sebagai jawaban atas keresahan mahasiswa ITB dalam menghadapi
                budaya akademik yang keras di tengah tuntutan modern yang semakin tinggi. Budaya kompetitif dan kurikulum
                yang cepat sering kali meninggalkan mahasiswa dalam kondisi cemas dan kelelahan mental tanpa adanya
                sistem pendampingan yang ramah.
              </p>
              <p>
                Kami juga melihat bahwa alternatif program tutorial atau <span className="italic">tutor center</span>{" "}
                yang telah ada dan berkembang belum mampu memberikan solusi yang cocok. Sebagian besar masih dikelola
                dengan manajemen yang seadanya, serta beroperasi murni sebagai bisnis penghasil uang belaka.
              </p>
              <p>
                Akibatnya, proses tutorial terasa transaksional dan kurang menghargai sisi manusiawi. Zyx didirikan untuk
                mendobrak paradigma ini dengan menghadirkan ekosistem belajar yang benar-benar{" "}
                <span className="font-semibold text-foreground">mahasiswa-sentris</span> sekaligus{" "}
                <span className="font-semibold text-foreground">tutor-sentris</span>. Bagi kami, empati terhadap proses
                belajar dan kesejahteraan tutor adalah pilar utama keberhasilan akademik.
              </p>
            </div>
          </div>
        </div>
      </SectionContainer>
      </Reveal>

      {/* Section D: Untuk Siapa Zyx (Full centered alignment, max-w-4xl) */}
      <Reveal>
      <SectionContainer className="relative z-10 border-b border-border bg-background/30 backdrop-blur-xs py-20 md:py-28">
        <div className="max-w-4xl mx-auto space-y-6 text-center">
          <span className="text-body-xs font-bold text-primary uppercase tracking-widest text-center">Relevansi</span>
          <SectionHeading as="h2" tier="primary" className="text-foreground font-extrabold tracking-tight text-center">
            Untuk Siapa Zyx?
          </SectionHeading>
          <div className="space-y-6 text-body-base text-muted-foreground leading-relaxed text-center">
            <p>
              Zyx dirancang untuk mahasiswa ITB tahun pertama (TPB) dan tahun kedua yang menginginkan arah belajar yang
              terarah, materi yang selaras dengan perkuliahan, serta tutorial yang memahami ritme akademik kampus.
            </p>
            <p>
              Kami mendampingi mereka yang merasa terbebani oleh tumpukan teori instan dan ingin beralih membangun
              kerangka berpikir yang kokoh. Zyx bukan sekadar tempat persiapan ujian, melainkan sistem pendukung bagi
              mahasiswa untuk menavigasi masa perkuliahan dengan tenang, percaya diri, dan hasil optimal.
            </p>
          </div>
        </div>
      </SectionContainer>
      </Reveal>

      {/* Section E: Pilar Penggagas (Grid Layout, non-sticky) */}
      <Reveal>
      <SectionContainer className="relative z-10 bg-background/50 backdrop-blur-xs py-20 md:py-28">
        <div className="max-w-5xl mx-auto space-y-12">
          {/* Header block */}
          <div className="space-y-4 max-w-3xl text-left">
            <span className="text-body-xs font-bold text-primary uppercase tracking-widest">Tim Kami</span>
            <SectionHeading as="h2" tier="primary" className="text-foreground font-extrabold tracking-tight mt-2 text-left">
              Pilar Penggagas Zyx
            </SectionHeading>
            <p className="text-body-base text-muted-foreground leading-relaxed font-normal text-left">
              Zyx digerakkan oleh mahasiswa yang telah menaklukkan kurikulum ketat ITB, berkomitmen menyalurkan
              pemahaman taktis mereka untuk kesuksesan akademik Anda.
            </p>
          </div>

          {/* Profiles Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            {founders.map((founder) => (
              <article
                key={founder.id}
                className="group flex flex-col sm:flex-row gap-6 p-6 md:p-8 bg-card border border-border shadow-xs hover:shadow-md hover:border-primary/20 dark:hover:border-primary/10 transition-all duration-300 rounded-2xl items-start"
              >
                {/* Founder Photo - 3:4 Aspect ratio, styled borders/shadows */}
                <div className="relative w-32 sm:w-40 aspect-[3/4] rounded-xl overflow-hidden shrink-0 border border-border/50 self-start">
                  <Image
                    src={founder.image}
                    alt={`Foto ${founder.name}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 160px"
                    className="object-cover transition-transform duration-500 group-hover:scale-103"
                    priority
                  />
                </div>

                {/* Founder details (Left-aligned, informative) */}
                <div className="flex-1 flex flex-col justify-between pt-1 w-full self-stretch">
                  <div>
                    {/* Editorial left-border accent badge */}
                    <div className="border-l-2 border-[var(--zx-accent)] pl-3">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-primary">
                        {founder.role}
                      </span>
                      <h3 className="font-heading text-body-base font-bold text-foreground leading-tight mt-0.5">
                        {founder.name}
                      </h3>
                    </div>
                    
                    {/* Biography details */}
                    <p className="text-body-sm text-muted-foreground leading-relaxed mt-4">
                      {founder.fullBio}
                    </p>
                  </div>

                  {/* Highlighted Social Accounts - Minimalist but clearly visible links with text */}
                  {Object.keys(founder.socials).length > 0 && (
                    <div className="mt-6 pt-4 border-t border-border/50 flex flex-wrap gap-x-5 gap-y-2 w-full">
                      {founder.socials.website && (
                        <Link
                          href={founder.socials.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-body-xs text-muted-foreground hover:text-primary transition-all duration-200 group/link"
                          title="Website Pribadi"
                        >
                          <Globe className="size-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                          <span className="font-medium underline underline-offset-2">
                            {founder.socials.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                          </span>
                        </Link>
                      )}
                      {founder.socials.linkedin && (
                        <Link
                          href={founder.socials.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-body-xs text-muted-foreground hover:text-[#0077B5] transition-all duration-200 group/link"
                          title="LinkedIn Profile"
                        >
                          <FaLinkedin className="size-3.5 text-muted-foreground group-hover/link:text-[#0077B5] transition-colors" />
                          <span className="font-medium underline underline-offset-2">LinkedIn</span>
                        </Link>
                      )}
                      {founder.socials.instagram && (
                        <Link
                          href={founder.socials.instagram}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-body-xs text-muted-foreground hover:text-[#E1306C] transition-all duration-200 group/link"
                          title="Instagram Profile"
                        >
                          <FaInstagram className="size-3.5 text-muted-foreground group-hover/link:text-[#E1306C] transition-colors" />
                          <span className="font-medium underline underline-offset-2">
                            @{founder.socials.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "")}
                          </span>
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </SectionContainer>
      </Reveal>
    </div>
  );
}
