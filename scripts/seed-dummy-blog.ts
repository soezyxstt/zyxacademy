import { db } from "../db";
import { user, blogArticles } from "../db/schema";
import { nanoid } from "nanoid";

async function main() {
  const existingUser = await db.query.user.findFirst();
  
  if (!existingUser) {
    console.log("No user found. Please ensure there is at least one user in the database.");
    return;
  }

  const dummyArticles = [
    {
      title: "Strategi Belajar Efektif Menjelang UTS dan UAS di ITB",
      summary: "Menghadapi pekan ujian di ITB membutuhkan persiapan matang. Berikut adalah rangkuman metode belajar terbaik yang terbukti efektif bagi mahasiswa TPB.",
      category: "tips_kuliah" as const,
      content: `
# Strategi Belajar Efektif Menjelang Ujian

Ujian di perguruan tinggi, terutama di ITB, terkenal dengan tingkat kesulitannya yang tinggi. Namun, dengan strategi yang tepat, Anda tidak hanya bisa lulus tetapi juga meraih indeks yang memuaskan.

## 1. Pahami Konsep Dasar, Bukan Sekadar Menghafal
Materi kalkulus, fisika dasar, dan kimia dasar di tahun pertama kuliah membutuhkan pemahaman logika yang kuat. Cobalah menjelaskan konsep tersebut kepada teman Anda. Jika Anda berhasil menjelaskannya dengan bahasa sederhana, berarti Anda sudah memahaminya.

:::media src="https://www.youtube.com/watch?v=jfKfPfyJRdk" caption="Gunakan musik instrumen lembut untuk menjaga fokus otak tetap tajam saat belajar kalkulus." sourceLabel="Lofi Girl" sourceUrl="https://www.youtube.com/@LofiGirl" :::

## 2. Latihan Soal dari Tahun-Tahun Sebelumnya
Mengerjakan soal ujian tahun lalu (repro) membantu Anda memahami pola soal yang sering keluar serta melatih manajemen waktu saat ujian berlangsung.
      `,
      thumbnailUrl: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80&w=1000",
      readMinutes: 7,
      tags: ["Study Tips", "UTS", "UAS", "ITB"],
    },
    {
      title: "10 Fakta Menarik Mengenai Sejarah Kampus Ganesha ITB",
      summary: "Tahukah Anda bahwa kampus ITB Ganesha memiliki sejarah panjang sejak zaman kolonial Belanda? Mari simak beberapa fakta tersembunyi yang jarang diketahui.",
      category: "fakta_seru" as const,
      content: `
# Sejarah Kampus Ganesha ITB yang Jarang Diketahui

Kampus ITB Ganesha tidak hanya sekadar tempat belajar, tetapi juga merupakan saksi bisu perkembangan arsitektur dan perjuangan bangsa Indonesia.

## Bangunan Beratap Kebudayaan Nusantara
Aula Barat dan Aula Timur ITB dirancang oleh arsitek kenamaan Henri Maclaine Pont. Keunikan dari bangunan ini terletak pada struktur atap kayu yang menyerupai rumah tradisional Indonesia namun menggunakan prinsip teknik sipil modern barat.

:::media src="https://www.youtube.com/watch?v=jfKfPfyJRdk" caption="Eksplorasi virtual keindahan visual bangunan bersejarah di Kampus ITB." sourceLabel="Virtual Tour" sourceUrl="https://youtube.com" :::

## Tokoh Penting Dunia
Banyak tokoh besar dunia, termasuk presiden pertama kita Ir. Soekarno, menyelesaikan pendidikan tingginya di kampus ini ketika masih bernama Technische Hoogeschool te Bandoeng.
      `,
      thumbnailUrl: "https://images.unsplash.com/photo-1592280771190-3e2e4d571952?auto=format&fit=crop&q=80&w=1000",
      readMinutes: 6,
      tags: ["Sejarah", "ITB", "Ganesha", "Fakta"],
    },
    {
      title: "Keseruan Workshop Coding Bersama Mentor Zyx Academy",
      summary: "Dokumentasi keseruan acara workshop pemrograman dasar menggunakan Next.js dan Tailwind CSS yang diselenggarakan oleh Zyx Academy akhir pekan lalu.",
      category: "kegiatan_zyx" as const,
      content: `
# Workshop Coding Zyx Academy: Membangun Aplikasi Pertama Anda

Minggu lalu, Zyx Academy mengadakan workshop intensif gratis bagi mahasiswa yang ingin belajar dasar-dasar pemrograman web modern.

## Antusiasme Peserta yang Sangat Tinggi
Diikuti oleh lebih dari 100 peserta dari berbagai universitas di Bandung, workshop ini dipandu langsung oleh mentor berpengalaman dari industri IT.

:::media src="https://www.youtube.com/watch?v=jfKfPfyJRdk" caption="Dokumentasi keseruan sesi tanya jawab intensif selama workshop coding Zyx." sourceLabel="Zyx Academy" sourceUrl="https://zyxacademy.com" :::

Peserta tidak hanya mendengarkan teori, tetapi juga langsung mempraktikkan pembuatan proyek web interaktif sederhana mereka sendiri.
      `,
      thumbnailUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=80&w=1000",
      readMinutes: 8,
      tags: ["Workshop", "Coding", "Zyx Academy", "Next.js"],
    },
  ];

  for (const item of dummyArticles) {
    const articleId = nanoid();
    const slug = `seeder-${item.category}-${nanoid(6)}`;
    
    await db.insert(blogArticles).values({
      id: articleId,
      slug: slug,
      title: item.title,
      summary: item.summary,
      content: item.content,
      thumbnailUrl: item.thumbnailUrl,
      category: item.category,
      readMinutes: item.readMinutes,
      tags: item.tags,
      status: "published",
      publishedAt: new Date(),
      createdById: existingUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`Inserted: ${item.title} | Slug: ${slug}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
