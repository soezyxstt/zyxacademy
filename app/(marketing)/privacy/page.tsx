import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalDocumentPage,
  type LegalSection,
} from "@/components/legal-document-page";
import { env } from "@/lib/env";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Kebijakan Privasi"),
  description:
    "Pelajari cara Zyx Academy mengumpulkan, menggunakan, menyimpan, dan melindungi data pribadi pengguna.",
};

const sections: LegalSection[] = [
  {
    id: "cakupan",
    title: "Cakupan kebijakan",
    content: (
      <>
        <p>
          Kebijakan ini menjelaskan cara Zyx Academy mengelola data pribadi saat
          Anda menggunakan situs, akun, materi belajar, kuis, tutorial, Zyra,
          notifikasi, dan fitur lain yang kami sediakan.
        </p>
        <p>
          Dengan menggunakan layanan, Anda memahami bahwa data akan diproses
          sesuai kebijakan ini dan ketentuan hukum yang berlaku.
        </p>
      </>
    ),
  },
  {
    id: "data-yang-dikumpulkan",
    title: "Data yang kami kumpulkan",
    content: (
      <>
        <p>Kami dapat mengumpulkan kategori data berikut:</p>
        <ul>
          <li>
            <strong>Data akun</strong>, seperti nama, alamat email, foto profil,
            peran, serta informasi autentikasi dan sesi.
          </li>
          <li>
            <strong>Data akademik</strong>, seperti kelas yang diikuti, progres
            materi, jawaban kuis, hasil asesmen, riwayat flashcard, jadwal, dan
            aktivitas belajar.
          </li>
          <li>
            <strong>Konten dan komunikasi</strong>, seperti pertanyaan kepada
            Zyra, pesan terkait tutorial, umpan balik, dan berkas yang Anda
            unggah melalui fitur yang tersedia.
          </li>
          <li>
            <strong>Data teknis</strong>, seperti informasi perangkat dan
            peramban, alamat IP, catatan akses, token notifikasi, serta data
            diagnostik dan analitik penggunaan.
          </li>
          <li>
            <strong>Data lokal perangkat</strong>, seperti preferensi tampilan,
            catatan belajar, penanda, dan status fitur yang disimpan melalui
            penyimpanan peramban.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "penggunaan-data",
    title: "Cara kami menggunakan data",
    content: (
      <>
        <p>Kami menggunakan data secara wajar dan terbatas untuk:</p>
        <ul>
          <li>menyediakan, mengamankan, dan memelihara layanan;</li>
          <li>mengelola akun, akses kelas, jadwal, dan komunikasi layanan;</li>
          <li>
            menampilkan progres, rekomendasi belajar, umpan balik, dan fitur
            pembelajaran yang relevan;
          </li>
          <li>
            memproses permintaan yang melibatkan tutor, kecerdasan buatan, atau
            integrasi layanan lain;
          </li>
          <li>
            mencegah penyalahgunaan, menangani gangguan, dan meningkatkan mutu
            serta keandalan layanan;
          </li>
          <li>memenuhi kewajiban hukum yang berlaku.</li>
        </ul>
        <p>
          Dasar pemrosesan dapat berupa persetujuan, pelaksanaan layanan yang
          Anda minta, kepentingan sah yang seimbang, atau kewajiban hukum,
          sesuai konteks pemrosesan.
        </p>
      </>
    ),
  },
  {
    id: "ai-dan-pihak-ketiga",
    title: "Kecerdasan buatan dan penyedia layanan",
    content: (
      <>
        <p>
          Sebagian fitur menggunakan penyedia layanan untuk autentikasi,
          hosting, penyimpanan, basis data, analitik, notifikasi, integrasi
          akademik, dan pemrosesan kecerdasan buatan. Data hanya dibagikan
          sejauh diperlukan untuk menjalankan fungsi tersebut atau memenuhi
          kewajiban hukum.
        </p>
        <p>
          Masukan yang Anda kirim ke fitur kecerdasan buatan dapat diproses
          bersama konteks pembelajaran yang relevan untuk menghasilkan jawaban.
          Jangan mengirim data pribadi sensitif atau informasi rahasia yang
          tidak diperlukan untuk kegiatan belajar.
        </p>
        <p>
          Penyedia layanan dapat memproses data di lokasi yang berbeda. Jika
          terjadi pemrosesan lintas batas, kami akan menerapkan langkah yang
          diperlukan sesuai hukum yang berlaku.
        </p>
      </>
    ),
  },
  {
    id: "cookie-dan-penyimpanan-lokal",
    title: "Cookie dan penyimpanan lokal",
    content: (
      <>
        <p>
          Kami menggunakan cookie dan teknologi serupa untuk menjaga sesi
          masuk, menyimpan preferensi, mengaktifkan fitur, mengingat pilihan,
          dan memahami penggunaan layanan. Sebagian data disimpan hanya di
          perangkat Anda melalui penyimpanan lokal peramban.
        </p>
        <p>
          Anda dapat mengatur cookie melalui peramban. Pemblokiran cookie atau
          penghapusan penyimpanan lokal dapat membuat sesi berakhir atau
          menyebabkan sebagian fitur tidak berfungsi sebagaimana mestinya.
        </p>
      </>
    ),
  },
  {
    id: "penyimpanan-dan-keamanan",
    title: "Penyimpanan dan keamanan",
    content: (
      <>
        <p>
          Kami menyimpan data selama diperlukan untuk menyediakan layanan,
          memenuhi kewajiban hukum, menyelesaikan sengketa, dan menjaga
          keamanan. Masa penyimpanan dapat berbeda berdasarkan jenis data dan
          tujuan pemrosesan.
        </p>
        <p>
          Kami menerapkan langkah teknis dan organisasi yang wajar untuk
          melindungi data. Namun, tidak ada sistem elektronik yang sepenuhnya
          bebas risiko. Segera hubungi kami jika Anda menduga ada akses tidak
          sah terhadap akun Anda.
        </p>
      </>
    ),
  },
  {
    id: "hak-pengguna",
    title: "Hak dan pilihan Anda",
    content: (
      <>
        <p>
          Sesuai hukum yang berlaku, Anda dapat meminta informasi mengenai
          pemrosesan data, akses, koreksi, penghapusan, penghentian atau
          pembatasan pemrosesan, penarikan persetujuan, serta mengajukan
          keberatan. Hak tertentu dapat memiliki batasan atau memerlukan
          verifikasi identitas.
        </p>
        <p>
          Preferensi komunikasi tertentu dapat dikelola melalui pengaturan
          notifikasi akun. Permintaan lain dapat diajukan melalui kontak yang
          tercantum di bawah.
        </p>
      </>
    ),
  },
  {
    id: "pengguna-di-bawah-umur",
    title: "Pengguna di bawah umur",
    content: (
      <p>
        Jika menurut hukum Anda memerlukan persetujuan orang tua atau wali untuk
        menggunakan layanan atau memberikan data pribadi, pastikan persetujuan
        tersebut telah diperoleh sebelum menggunakan Zyx Academy.
      </p>
    ),
  },
  {
    id: "perubahan-kebijakan",
    title: "Perubahan kebijakan",
    content: (
      <p>
        Kami dapat memperbarui kebijakan ini ketika layanan, praktik data, atau
        ketentuan hukum berubah. Tanggal pembaruan terbaru akan ditampilkan di
        halaman ini. Untuk perubahan material, kami dapat memberikan
        pemberitahuan tambahan melalui layanan atau kanal komunikasi yang
        tersedia.
      </p>
    ),
  },
  {
    id: "kontak",
    title: "Kontak",
    content: (
      <>
        <p>
          Untuk pertanyaan atau permintaan terkait privasi, hubungi kami di{" "}
          <a href={`mailto:${env.NEXT_PUBLIC_BRAND_EMAIL}`}>
            {env.NEXT_PUBLIC_BRAND_EMAIL}
          </a>
          .
        </p>
        <p>
          Penggunaan layanan juga tunduk pada{" "}
          <Link href="/terms">Syarat dan Ketentuan</Link> Zyx Academy.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      documentId="privacy"
      title="Kebijakan Privasi"
      description="Cara Zyx Academy mengelola dan melindungi data pribadi Anda."
      updatedAt="30 Agustus 2026"
      sections={sections}
    />
  );
}
