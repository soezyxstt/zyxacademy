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

:::media src="https://www.youtube.com/watch?v=jfKfPfyJRdk" caption="Video panduan visual tentang konsep struktur data tingkat lanjut untuk pemula." sourceLabel="Data Structures Class" sourceUrl="https://youtube.com" :::

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
Menrunkan aplikasi di lingkungan produksi secara andal.

### Containerization dengan Docker
Docker mengemas aplikasi beserta dependensinya ke dalam unit independen yang disebut container. Hal ini memastikan bahwa aplikasi berjalan secara konsisten di mesin lokal developer maupun di server cloud produksi.

### CI/CD Pipeline
Continuous Integration dan Continuous Deployment secara otomatis menguji, membuild, dan mendistribusikan perubahan kode baru ke server produksi, mengurangi risiko bug manusia saat merilis fitur baru.

---

## Kesimpulan
Perjalanan menjadi software engineer adalah proses belajar seumur hidup. Kuncinya bukan menghafal sintaksis, melainkan melatih kemampuan memecahkan masalah (problem-solving) secara sistematis dan terstruktur.
  `;

  const articleId = nanoid();
  const slug = "panduan-komprehensif-software-engineering-" + nanoid(6);

  await db.insert(blogArticles).values({
    id: articleId,
    slug: slug,
    title: "Panduan Komprehensif Menjadi Software Engineer Andal dari Nol",
    summary: "Artikel panjang ini membahas lengkap panduan belajar software engineering, mulai dari dasar algoritma, pemrograman web, database, hingga DevOps untuk skala produksi.",
    content: content,
    thumbnailUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=80&w=1000",
    category: "tips_kuliah",
    readMinutes: 25,
    tags: ["Software Engineering", "Panduan", "Belajar Coding", "DevOps"],
    status: "published",
    publishedAt: new Date(),
    createdById: existingUser.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log("Inserted long article with ID:", articleId);
  console.log("Slug:", slug);
}

main().catch(console.error).finally(() => process.exit(0));
