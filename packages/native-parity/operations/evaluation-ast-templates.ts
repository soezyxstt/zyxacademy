export const DEMO_TEMPLATES = {
  standard: `# Limit Fungsi Aljabar

:::learning_objective {bloomLevel=understand}
- Memahami definisi limit fungsi aljabar secara intuitif.
- Menghitung nilai limit fungsi aljabar menggunakan metode substitusi.
:::

Di kelas matematika kali ini kita akan mempelajari konsep [[Limit]].

:::concept {koId=limit-def}
title: Definisi Limit
Limit fungsi adalah nilai hampiran yang didekati oleh fungsi ketika variabelnya mendekati nilai tertentu.
:::

:::formula {title="Rumus Limit Dasar" koId=limit-eq}
$$\\lim_{x \\to c} f(x) = L$$
- c | Keterangan | Nilai pendekatan variabel x
- L | Keterangan | Nilai limit fungsi f(x)
Interpretasi:
Ketika x bergerak mendekati c dari kedua arah kiri dan kanan, nilai fungsi f(x) bergerak mendekati L.
:::

:::engineering_insight {discipline=general}
title: Penerapan Limit di Teknik Sipil
Limit digunakan dalam analisis lendutan maksimum jembatan beton di bawah beban lalu lintas statis.
:::

:::glossary_term {term="Limit"}
Nilai batas yang didekati oleh suatu fungsi matematika seiring dengan variabel bebasnya mendekati suatu titik tertentu.
:::
`,

  leakage: `# Leakage Test (Math Leakage Heuristics)

:::concept {koId=leak-concept}
title: Konsep Kebocoran Rumus
Di dalam konsep ini kita menulis persamaan y = mx + c secara langsung tanpa blok formula. Ini Level 2 & 3 deteksi.
Juga jika kita menulis f(x) = \\frac{a}{b} maka deteksi Level 1 langsung memicu kebocoran karena adanya keyword \\\\frac.

Hal-hal seperti nilai_a = nilai_b atau file_name = test_file tidak boleh memicu kebocoran karena tidak berada dalam konteks matematika yang valid.
:::
`,

  visual: `# Alur Pembelajaran Matematika

:::concept {koId=belajar-mat}
title: Konsep Alur
Berikut adalah visualisasi diagram alur persiapan ujian matematika. Kita mereferensikan diagram ini dengan tag [[visual:persiapan-ujian]].
:::

:::flowchart {id="persiapan-ujian" title="Alur Persiapan Ujian" caption="Siklus belajar Zyx"}
Langkah 1: Baca MTD --> Langkah 2: Latihan Soal
Langkah 2: Latihan Soal -- Sukses --> Langkah 3: Ikuti Tryout
Langkah 2: Latihan Soal -- Gagal --> Langkah 1: Baca MTD
:::
`
};
