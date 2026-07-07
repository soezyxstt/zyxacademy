import { db } from "../db";
import { user, blogArticles } from "../db/schema";
import { nanoid } from "nanoid";

async function main() {
  const existingUser = await db.query.user.findFirst();
  if (!existingUser) {
    console.log("No user found.");
    return;
  }

  const content = `
# Kupas Tuntas Jalur Masuk ITB: Dari Seleksi Nasional Hingga Jalur Mandiri

Institut Teknologi Bandung (ITB) selalu menjadi universitas impian bagi calon mahasiswa teknik dan sains di seluruh penjuru Indonesia. Persaingan untuk memperebutkan kursi di kampus ganesha ini sangatlah ketat, sehingga Anda perlu merencanakan strategi masuk sejak jauh-jauh hari sebelum ujian dimulai.

Pada artikel kali ini, kita akan membedah secara mendalam tiga jalur penerimaan utama di ITB serta bagaimana cara terbaik mempersiapkan diri untuk masing-masing seleksi tersebut.

:::media src="https://www.youtube.com/watch?v=jfKfPfyJRdk" caption="Tur Virtual Kampus Ganesha ITB - Mengenal Fasilitas dan Lingkungan Belajar Mahasiswa Baru." sourceLabel="ITB Official" sourceUrl="https://youtube.com" :::

## 1. Jalur SNBP (Seleksi Nasional Berdasarkan Prestasi)
Jalur pertama adalah SNBP yang berfokus pada prestasi akademik Anda selama di sekolah menengah. Seleksi ini menyaring nilai rapor semester satu hingga lima, serta memperhitungkan piagam penghargaan kompetisi akademik tingkat nasional maupun internasional yang relevan.

Penting untuk dipahami bahwa portofolio prestasi Anda harus linear dengan fakultas yang Anda pilih di ITB. Misalnya, jika Anda mengincar Sekolah Teknik Elektro dan Informatika (STEI), pastikan Anda memiliki nilai matematika dan fisika yang menonjol serta sertifikat olimpiade sains yang mendukung.

## 2. Jalur SNBT (Seleksi Nasional Berdasarkan Tes)
Jika Anda tidak lolos di jalur prestasi, SNBT adalah pertempuran berikutnya yang berbasis pada hasil Ujian Tulis Berbasis Komputer (UTBK). Materi ujian UTBK berfokus pada Tes Potensi Skolastik (TPS), Penalaran Matematika, Literasi Bahasa Indonesia, serta Literasi Bahasa Inggris.

:::media src="https://www.youtube.com/watch?v=jfKfPfyJRdk" caption="Panduan Strategi Latihan Soal UTBK untuk Meraih Skor Tinggi di Subtes Penalaran Matematika." sourceLabel="EduChannel" sourceUrl="https://youtube.com" :::

Untuk menaklukkan ujian UTBK, Anda harus melatih kecepatan berpikir serta ketelitian dalam memahami soal-soal bernalar tinggi (*High Order Thinking Skills* atau HOTS). Pastikan Anda meluangkan waktu minimal dua jam setiap hari untuk mencoba melakukan simulasi tryout mandiri.

## 3. Jalur Seleksi Mandiri (SM-ITB)
Jalur terakhir adalah SM-ITB yang diselenggarakan secara independen oleh pihak kampus. Seleksi Mandiri ITB ini menggunakan kombinasi nilai UTBK Anda, nilai rapor sekolah, serta hasil ujian daring matematika khusus yang diadakan oleh panitia internal ITB.

:::media src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80&w=1000" caption="Ilustrasi suasana belajar mandiri yang terstruktur dengan mencatat poin-poin rumus penting secara rapi." sourceLabel="Unsplash Education" sourceUrl="https://unsplash.com" :::

Sebagai penutup, kunci utama untuk lolos ke ITB melalui jalur mana pun adalah konsistensi belajar dan manajemen stres yang baik. Jangan menunda belajar hingga mendekati hari ujian, mulailah mencicil materi dari sekarang demi masa depan akademik yang gemilang.
  `;

  const articleId = nanoid();
  const slug = "kupas-tuntas-jalur-masuk-itb-" + nanoid(6);

  await db.insert(blogArticles).values({
    id: articleId,
    slug: slug,
    title: "Kupas Tuntas 3 Jalur Utama Masuk ITB Beserta Strategi Belajarnya",
    summary: "Artikel ini membahas secara rinci jalur SNBP, SNBT, dan Ujian Mandiri ITB lengkap dengan tips praktis serta media pendukung agar Anda siap menghadapinya.",
    content: content,
    thumbnailUrl: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&q=80&w=1000",
    category: "pojok_kampus",
    readMinutes: 12,
    tags: ["Masuk ITB", "SNBP", "SNBT", "Ujian Mandiri", "Kuliah"],
    status: "published",
    publishedAt: new Date(),
    createdById: existingUser.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log("Inserted article with ID:", articleId);
  console.log("Slug:", slug);
}

main().catch(console.error).finally(() => process.exit(0));
