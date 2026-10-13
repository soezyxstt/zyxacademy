import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalDocumentPage,
  type LegalSection,
} from "@/components/legal-document-page";
import { env } from "@/lib/env";
import { createMetadata, pageTitle } from "@/lib/site";

export const metadata: Metadata = createMetadata({
  title: "Syarat dan Ketentuan",
  description:
    "Ketentuan penggunaan situs, materi, akun, dan layanan pembelajaran Zyx Academy.",
  path: "/terms",
});


const sections: LegalSection[] = [
  {
    id: "penerimaan",
    title: "Penerimaan ketentuan",
    content: (
      <>
        <p>
          Syarat dan Ketentuan ini mengatur penggunaan situs, akun, materi
          belajar, kuis, tutorial, Zyra, dan layanan lain yang disediakan oleh
          Zyx Academy.
        </p>
        <p>
          Dengan membuat akun atau menggunakan layanan, Anda menyatakan telah
          membaca dan menyetujui ketentuan ini serta{" "}
          <Link href="/privacy">Kebijakan Privasi</Link> kami. Jika Anda tidak
          setuju, jangan menggunakan layanan.
        </p>
      </>
    ),
  },
  {
    id: "akun-dan-kelayakan",
    title: "Akun dan kelayakan pengguna",
    content: (
      <ul>
        <li>
          Anda wajib memberikan informasi yang akurat dan menjaga keamanan
          akun serta sesi masuk.
        </li>
        <li>
          Akun, tautan akses, kode, atau token pendaftaran tidak boleh
          dipindahtangankan tanpa izin.
        </li>
        <li>
          Anda bertanggung jawab atas aktivitas yang dilakukan melalui akun
          Anda, kecuali aktivitas tersebut terjadi akibat kesalahan Zyx Academy.
        </li>
        <li>
          Jika menurut hukum Anda memerlukan persetujuan orang tua atau wali,
          Anda harus memperoleh persetujuan tersebut sebelum menggunakan
          layanan.
        </li>
      </ul>
    ),
  },
  {
    id: "penggunaan-layanan",
    title: "Penggunaan yang diperbolehkan",
    content: (
      <>
        <p>
          Layanan hanya boleh digunakan untuk tujuan belajar dan tujuan sah
          lain yang sesuai dengan fungsi yang tersedia. Anda dilarang:
        </p>
        <ul>
          <li>
            mengakses akun, data, kelas, atau sistem tanpa kewenangan;
          </li>
          <li>
            mengganggu keamanan, kinerja, atau ketersediaan layanan;
          </li>
          <li>
            melakukan scraping, penyalinan massal, rekayasa balik, atau
            pengujian kerentanan tanpa izin tertulis;
          </li>
          <li>
            mengunggah malware, konten melanggar hukum, atau materi yang
            melanggar hak pihak lain;
          </li>
          <li>
            menggunakan layanan untuk menipu, menyamar, melecehkan, atau
            merugikan pengguna lain.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "integritas-akademik",
    title: "Integritas akademik",
    content: (
      <>
        <p>
          Materi, latihan, kuis, dan fitur bantuan belajar dirancang untuk
          mendukung proses belajar. Anda tetap bertanggung jawab mematuhi aturan
          akademik kampus, dosen, kelas, dan penyelenggara asesmen.
        </p>
        <p>
          Anda tidak boleh menggunakan Zyx Academy untuk melakukan kecurangan,
          membagikan jawaban asesmen aktif, menyamarkan karya orang lain sebagai
          karya sendiri, atau menghindari ketentuan evaluasi akademik.
        </p>
      </>
    ),
  },
  {
    id: "fitur-ai",
    title: "Fitur kecerdasan buatan",
    content: (
      <>
        <p>
          Jawaban yang dihasilkan oleh kecerdasan buatan dapat tidak lengkap,
          tidak akurat, atau tidak sesuai dengan konteks terbaru. Gunakan hasil
          tersebut sebagai bantuan belajar, periksa kembali sumber dan
          perhitungan, serta jangan menjadikannya satu-satunya dasar untuk
          keputusan penting.
        </p>
        <p>
          Anda tidak boleh mencoba melewati pembatasan keamanan, kuota, akses,
          atau instruksi sistem. Kami dapat membatasi penggunaan untuk menjaga
          mutu, biaya, keamanan, dan ketersediaan layanan.
        </p>
      </>
    ),
  },
  {
    id: "konten-dan-kekayaan-intelektual",
    title: "Konten dan kekayaan intelektual",
    content: (
      <>
        <p>
          Situs, merek, perangkat lunak, desain, bank soal, diktat, dan materi
          yang disediakan melalui layanan dilindungi oleh hak kekayaan
          intelektual Zyx Academy atau pemberi lisensinya. Akses yang diberikan
          bersifat terbatas, pribadi, tidak eksklusif, dan tidak dapat dialihkan.
        </p>
        <p>
          Anda tetap memiliki hak atas konten yang Anda kirimkan. Anda memberi
          kami izin terbatas untuk menyimpan, memproses, menampilkan, dan
          mengirimkan konten tersebut sejauh diperlukan untuk menyediakan dan
          mengamankan layanan. Anda bertanggung jawab memastikan bahwa Anda
          berhak mengirimkan konten tersebut.
        </p>
      </>
    ),
  },
  {
    id: "layanan-pihak-ketiga",
    title: "Layanan pihak ketiga",
    content: (
      <p>
        Sebagian fungsi bergantung pada layanan pihak ketiga, seperti
        autentikasi, konferensi video, penyimpanan, notifikasi, analitik, dan
        pemrosesan kecerdasan buatan. Penggunaan layanan pihak ketiga dapat
        tunduk pada syarat dan kebijakan privasi mereka sendiri. Kami tidak
        mengendalikan layanan pihak ketiga tersebut.
      </p>
    ),
  },
  {
    id: "pembayaran",
    title: "Paket dan pembayaran",
    content: (
      <>
        <p>
          Jika Anda memilih layanan berbayar, harga, masa akses, cakupan, dan
          ketentuan pembayaran yang ditampilkan pada saat pemesanan menjadi
          bagian dari ketentuan ini. Anda bertanggung jawab memeriksa rincian
          pesanan sebelum menyetujui pembayaran.
        </p>
        <p>
          Ketentuan pembatalan atau pengembalian dana, jika tersedia, mengikuti
          informasi yang diberikan untuk paket atau transaksi terkait dan
          ketentuan hukum yang berlaku.
        </p>
      </>
    ),
  },
  {
    id: "ketersediaan-dan-penghentian",
    title: "Ketersediaan dan penghentian akses",
    content: (
      <>
        <p>
          Kami dapat memelihara, mengubah, membatasi, atau menghentikan bagian
          layanan untuk alasan operasional, keamanan, hukum, atau pengembangan
          produk. Jika memungkinkan, perubahan material akan diberitahukan
          melalui kanal yang tersedia.
        </p>
        <p>
          Kami dapat menangguhkan atau menghentikan akses yang melanggar
          ketentuan ini, membahayakan pengguna lain, atau menimbulkan risiko bagi
          layanan. Tindakan akan dilakukan secara proporsional sesuai keadaan.
        </p>
      </>
    ),
  },
  {
    id: "batas-tanggung-jawab",
    title: "Batas tanggung jawab",
    content: (
      <>
        <p>
          Zyx Academy menyediakan sarana pendukung belajar dan tidak menjamin
          nilai, kelulusan, penerimaan, atau hasil akademik tertentu. Hasil
          belajar dipengaruhi oleh banyak faktor di luar kendali layanan.
        </p>
        <p>
          Sejauh diizinkan hukum, layanan disediakan berdasarkan ketersediaan.
          Ketentuan ini tidak membatasi hak konsumen atau tanggung jawab yang
          tidak dapat dikecualikan berdasarkan hukum yang berlaku.
        </p>
      </>
    ),
  },
  {
    id: "perubahan-ketentuan",
    title: "Perubahan ketentuan",
    content: (
      <p>
        Kami dapat memperbarui ketentuan ini agar sesuai dengan perubahan
        layanan atau hukum. Tanggal pembaruan terbaru akan ditampilkan di
        halaman ini. Penggunaan layanan setelah ketentuan baru berlaku berarti
        Anda menerima ketentuan yang diperbarui, sejauh diizinkan hukum.
      </p>
    ),
  },
  {
    id: "hukum-dan-kontak",
    title: "Hukum yang berlaku dan kontak",
    content: (
      <>
        <p>
          Ketentuan ini diatur oleh hukum Republik Indonesia. Perselisihan akan
          diupayakan terlebih dahulu melalui komunikasi dan musyawarah, tanpa
          mengurangi hak para pihak berdasarkan hukum yang berlaku.
        </p>
        <p>
          Untuk pertanyaan mengenai ketentuan ini, hubungi{" "}
          <a href={`mailto:${env.NEXT_PUBLIC_BRAND_EMAIL}`}>
            {env.NEXT_PUBLIC_BRAND_EMAIL}
          </a>
          .
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocumentPage
      documentId="terms"
      title="Syarat dan Ketentuan"
      description="Ketentuan yang berlaku saat Anda menggunakan layanan Zyx Academy."
      updatedAt="30 Agustus 2026"
      sections={sections}
    />
  );
}
