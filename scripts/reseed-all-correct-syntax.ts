import { db } from "../db";
import { user, blogArticles } from "../db/schema";
import { nanoid } from "nanoid";

async function main() {
  const existingUser = await db.query.user.findFirst();
  if (!existingUser) {
    console.log("No user found.");
    return;
  }

  // Clear existing articles to avoid duplicates/outdated syntax
  await db.delete(blogArticles);
  console.log("Cleared existing blog articles.");

  const articles = [
    {
      slug: "kupas-tuntas-jalur-masuk-itb-X0ZPTJ",
      title: "Kupas Tuntas 3 Jalur Utama Masuk ITB Beserta Strategi Belajarnya",
      summary: "Artikel ini membahas secara rinci jalur SNBP, SNBT, dan Ujian Mandiri ITB lengkap dengan tips praktis serta media pendukung agar Anda siap menghadapinya.",
      category: "pojok_kampus" as const,
      thumbnailUrl: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&q=80&w=1000",
      readMinutes: 12,
      tags: ["Masuk ITB", "SNBP", "SNBT", "Ujian Mandiri", "Kuliah"],
      content: `
# Kupas Tuntas Jalur Masuk ITB: Dari Seleksi Nasional Hingga Jalur Mandiri

Institut Teknologi Bandung (ITB) selalu menjadi universitas impian bagi calon mahasiswa teknik dan sains di seluruh penjuru Indonesia. Persaingan untuk memperebutkan kursi di kampus ganesha ini sangatlah ketat, sehingga Anda perlu merencanakan strategi masuk sejak jauh-jauh hari sebelum ujian dimulai.

Pada artikel kali ini, kita akan membedah secara mendalam tiga jalur penerimaan utama di ITB serta bagaimana cara terbaik mempersiapkan diri untuk masing-masing seleksi tersebut.

:::media {src="https://www.youtube.com/watch?v=jfKfPfyJRdk" caption="Tur Virtual Kampus Ganesha ITB - Mengenal Fasilitas dan Lingkungan Belajar Mahasiswa Baru." sourceLabel="ITB Official" sourceUrl="https://youtube.com"}
:::

## 1. Jalur SNBP (Seleksi Nasional Berdasarkan Prestasi)
Jalur pertama adalah SNBP yang berfokus pada prestasi akademik Anda selama di sekolah menengah. Seleksi ini menyaring nilai rapor semester satu hingga lima, serta memperhitungkan piagam penghargaan kompetisi akademik tingkat nasional maupun internasional yang relevan.

Penting untuk dipahami bahwa portofolio prestasi Anda harus linear dengan fakultas yang Anda pilih di ITB. Misalnya, jika Anda mengincar Sekolah Teknik Elektro dan Informatika (STEI), pastikan Anda memiliki nilai matematika dan fisika yang menonjol serta sertifikat olimpiade sains yang mendukung.

## 2. Jalur SNBT (Seleksi Nasional Berdasarkan Tes)
Jika Anda tidak lolos di jalur prestasi, SNBT adalah pertempuran berikutnya yang berbasis pada hasil Ujian Tulis Berbasis Komputer (UTBK). Materi ujian UTBK berfokus pada Tes Potensi Skolastik (TPS), Penalaran Matematika, Literasi Bahasa Indonesia, serta Literasi Bahasa Inggris.

:::media {src="https://www.youtube.com/watch?v=jfKfPfyJRdk" caption="Panduan Strategi Latihan Soal UTBK untuk Meraih Skor Tinggi di Subtes Penalaran Matematika." sourceLabel="EduChannel" sourceUrl="https://youtube.com"}
:::

Untuk menaklukkan ujian UTBK, Anda harus melatih kecepatan berpikir serta ketelitian dalam memahami soal-soal bernalar tinggi (*High Order Thinking Skills* atau HOTS). Pastikan Anda meluangkan waktu minimal dua jam setiap hari untuk mencoba melakukan simulasi tryout mandiri.

## 3. Jalur Seleksi Mandiri (SM-ITB)
Jalur terakhir adalah SM-ITB yang diselenggarakan secara independen oleh pihak kampus. Seleksi Mandiri ITB ini menggunakan kombinasi nilai UTBK Anda, nilai rapor sekolah, serta hasil ujian daring matematika khusus yang diadakan oleh panitia internal ITB.

:::media {src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80&w=1000" caption="Ilustrasi suasana belajar mandiri yang terstruktur dengan mencatat poin-poin rumus penting secara rapi." sourceLabel="Unsplash Education" sourceUrl="https://unsplash.com"}
:::

Sebagai penutup, kunci utama untuk lolos ke ITB melalui jalur mana pun adalah konsistensi belajar dan manajemen stres yang baik. Jangan menunda belajar hingga mendekati hari ujian, mulailah mencicil materi dari sekarang demi masa depan akademik yang gemilang.
      `,
    },
    {
      slug: "panduan-komprehensif-software-engineering-RR5Z2C",
      title: "Panduan Komprehensif Menjadi Software Engineer Andal dari Nol",
      summary: "Artikel panjang ini membahas lengkap panduan belajar software engineering, mulai dari dasar algoritma, pemrograman web, database, hingga DevOps untuk skala produksi.",
      category: "tips_kuliah" as const,
      thumbnailUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=80&w=1000",
      readMinutes: 25,
      tags: ["Software Engineering", "Panduan", "Belajar Coding", "DevOps"],
      content: `
# Panduan Lengkap dan Komprehensif: Peta Jalan Menuju Dunia Software Engineering

## Pengenalan
Dunia software engineering terus berkembang dengan sangat cepat. Artikel panjang ini dirancang khusus untuk memandu Anda memahami setiap fase krusial, mulai dari pemrograman dasar hingga arsitektur sistem tingkat lanjut yang terdistribusi secara global.

---

## Bagian 1: Dasar Pemrograman & Algoritma
Sebelum melangkah ke framework modern, fondasi yang kokoh adalah kunci mutlak.

### Memahami Struktur Data
Anda harus menguasai bagaimana data disimpan dan diakses secara efisien:
- **Array & List**: Struktur dasar untuk menyimpan urutan data linear.
- **Hash Table**: Penting untuk pencarian data dengan kompleksitas waktu konstan O(1).
- **Tree & Graph**: Digunakan untuk merepresentasikan hubungan hierarkis dan jaringan kompleks.

:::media {src="https://www.youtube.com/watch?v=jfKfPfyJRdk" caption="Video panduan visual tentang konsep struktur data tingkat lanjut untuk pemula." sourceLabel="Data Structures Class" sourceUrl="https://youtube.com"}
:::

### Desain Algoritma
Memahami efisiensi algoritma sangat krusial melalui notasi Big-O. Algoritma sorting seperti Merge Sort dan Quick Sort, serta algoritma pencarian seperti Binary Search, adalah materi wajib bagi setiap mahasiswa ilmu komputer.

---

## Bagian 2: Pemrograman Berorientasi Objek & Fungsional
Dua paradigma utama dalam pengembangan perangkat lunak modern.

### Pemrograman Berorientasi Objek (OOP)
OOP membantu kita menyusun kode program menjadi modular menggunakan empat pilar utama:
1. **Encapsulation**: Menyembunyikan detail implementasi internal suatu objek.
2. **Inheritance**: Mewarisi sifat dan perilaku dari kelas induk ke kelas anak.
3. **Polymorphism**: Kemampuan objek mengambil banyak bentuk perilaku.
4. **Abstraction**: Menyederhanakan representasi dunia nyata yang kompleks.

### Pemrograman Fungsional (FP)
FP menekankan pada penggunaan fungsi murni (pure functions) dan menghindari perubahan state (immutability). Konsep seperti map, filter, dan reduce sekarang diadopsi di hampir semua bahasa modern termasuk JavaScript dan Python.

---

## Bagian 3: Pengembangan Aplikasi Web Modern
Bagaimana web bekerja di era komputasi awan.

### Sisi Klien (Frontend)
Frontend berpusat pada pengalaman pengguna langsung. HTML5, CSS3, dan JavaScript adalah fondasi utamanya. Di era modern, kita menggunakan framework deklaratif seperti React, Next.js, Vue, atau Svelte untuk mengelola UI yang dinamis dan interaktif secara efisien.

### Sisi Server (Backend)
Backend menangani logika bisnis, otentikasi, dan manipulasi database. Teknologi populer mencakup Node.js, Go, Python (Django/FastAPI), serta Rust untuk sistem dengan performa ekstrem.

---

## Bagian 4: Manajemen Database & Data Persistence
Menyimpan data dengan aman dan efisien adalah tanggung jawab utama software engineer.

### Database Relasional (SQL)
Menggunakan tabel terstruktur dan relasi kunci asing (foreign key). Contohnya mencakup PostgreSQL, MySQL, dan SQLite (yang kami gunakan dalam sistem Zyx Academy ini).

### Database Non-Relasional (NoSQL)
Cocok untuk data yang tidak terstruktur atau membutuhkan skalabilitas horizontal yang masif. Contohnya adalah MongoDB (document-based), Redis (key-value), dan Cassandra (wide-column).

---

## Bagian 5: DevOps, Deployment, dan Skalabilitas
Menjalankan aplikasi di lingkungan produksi secara andal.

### Containerization dengan Docker
Docker mengemas aplikasi beserta dependensinya ke dalam unit independen yang disebut container. Hal ini memastikan bahwa aplikasi berjalan secara konsisten di mesin lokal developer maupun di server cloud produksi.

### CI/CD Pipeline
Continuous Integration dan Continuous Deployment secara otomatis menguji, membuild, dan mendistribusikan perubahan kode baru ke server produksi, mengurangi risiko bug manusia saat merilis fitur baru.

---

## Kesimpulan
Perjalanan menjadi software engineer adalah proses belajar seumur hidup. Kuncinya bukan menghafal sintaksis, melainkan melatih kemampuan memecahkan masalah (problem-solving) secara sistematis dan terstruktur.
      `,
    },
    {
      slug: "seeder-tips_kuliah-tKat2m",
      title: "Strategi Belajar Efektif Menjelang UTS dan UAS di ITB",
      summary: "Menghadapi pekan ujian di ITB membutuhkan persiapan matang. Berikut adalah rangkuman metode belajar terbaik yang terbukti efektif bagi mahasiswa TPB.",
      category: "tips_kuliah" as const,
      thumbnailUrl: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80&w=1000",
      readMinutes: 7,
      tags: ["Study Tips", "UTS", "UAS", "ITB"],
      content: `
# Strategi Belajar Efektif Menjelang Ujian

Ujian di perguruan tinggi, terutama di ITB, terkenal dengan tingkat kesulitannya yang tinggi. Namun, dengan strategi yang tepat, Anda tidak hanya bisa lulus tetapi juga meraih indeks yang memuaskan.

## 1. Pahami Konsep Dasar, Bukan Sekadar Menghafal
Materi kalkulus, fisika dasar, dan kimia dasar di tahun pertama kuliah membutuhkan pemahaman logika yang kuat. Cobalah menjelaskan konsep tersebut kepada teman Anda. Jika Anda berhasil menjelaskannya dengan bahasa sederhana, berarti Anda sudah memahaminya.

:::media {src="https://www.youtube.com/watch?v=jfKfPfyJRdk" caption="Gunakan musik instrumen lembut untuk menjaga fokus otak tetap tajam saat belajar kalkulus." sourceLabel="Lofi Girl" sourceUrl="https://www.youtube.com/@LofiGirl"}
:::

## 2. Latihan Soal dari Tahun-Tahun Sebelumnya
Mengerjakan soal ujian tahun lalu (repro) membantu Anda memahami pola soal yang sering keluar serta melatih manajemen waktu saat ujian berlangsung.
      `,
    },
    {
      slug: "seeder-fakta_seru-LsSuqp",
      title: "10 Fakta Menarik Mengenai Sejarah Kampus Ganesha ITB",
      summary: "Tahukah Anda bahwa kampus ITB Ganesha memiliki sejarah panjang sejak zaman kolonial Belanda? Mari simak beberapa fakta tersembunyi yang jarang diketahui.",
      category: "fakta_seru" as const,
      thumbnailUrl: "https://images.unsplash.com/photo-1592280771190-3e2e4d571952?auto=format&fit=crop&q=80&w=1000",
      readMinutes: 6,
      tags: ["Sejarah", "ITB", "Ganesha", "Fakta"],
      content: `
# Sejarah Kampus Ganesha ITB yang Jarang Diketahui

Kampus ITB Ganesha tidak hanya sekadar tempat belajar, tetapi juga merupakan saksi bisu perkembangan arsitektur dan perjuangan bangsa Indonesia.

## Bangunan Beratap Kebudayaan Nusantara
Aula Barat dan Aula Timur ITB dirancang oleh arsitek kenamaan Henri Maclaine Pont. Keunikan dari bangunan ini terletak pada struktur atap kayu yang menyerupai rumah tradisional Indonesia namun menggunakan prinsip teknik sipil modern barat.

:::media {src="https://www.youtube.com/watch?v=jfKfPfyJRdk" caption="Eksplorasi virtual keindahan visual bangunan bersejarah di Kampus ITB." sourceLabel="Virtual Tour" sourceUrl="https://youtube.com"}
:::

## Tokoh Penting Dunia
Banyak tokoh besar dunia, termasuk presiden pertama kita Ir. Soekarno, menyelesaikan pendidikan tingginya di kampus ini ketika masih bernama Technische Hoogeschool te Bandoeng.
      `,
    },
    {
      slug: "seeder-kegiatan_zyx-YMEVKN",
      title: "Keseruan Workshop Coding Bersama Mentor Zyx Academy",
      summary: "Dokumentasi keseruan acara workshop pemrograman dasar menggunakan Next.js dan Tailwind CSS yang diselenggarakan oleh Zyx Academy akhir pekan lalu.",
      category: "kegiatan_zyx" as const,
      thumbnailUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=80&w=1000",
      readMinutes: 8,
      tags: ["Workshop", "Coding", "Zyx Academy", "Next.js"],
      content: `
# Workshop Coding Zyx Academy: Membangun Aplikasi Pertama Anda

Minggu lalu, Zyx Academy mengadakan workshop intensif gratis bagi mahasiswa yang ingin belajar dasar-dasar pemrograman web modern.

## Antusiasme Peserta yang Sangat Tinggi
Diikuti oleh lebih dari 100 peserta dari berbagai universitas di Bandung, workshop ini dipandu langsung oleh mentor berpengalaman dari industri IT.

:::media {src="https://www.youtube.com/watch?v=jfKfPfyJRdk" caption="Dokumentasi keseruan sesi tanya jawab intensif selama workshop coding Zyx." sourceLabel="Zyx Academy" sourceUrl="https://zyxacademy.com"}
:::

Peserta tidak hanya mendengarkan teori, tetapi juga langsung mempraktikkan pembuatan proyek web interaktif sederhana mereka sendiri.
      `,
    },
  ];

  for (const item of articles) {
    const articleId = nanoid();
    await db.insert(blogArticles).values({
      id: articleId,
      slug: item.slug,
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
    console.log(`Reseeded: ${item.title}`);
  }

  console.log("Database reseeded successfully!");
}

main().catch(console.error).finally(() => process.exit(0));
