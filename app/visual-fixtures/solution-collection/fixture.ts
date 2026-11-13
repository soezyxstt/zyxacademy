import { parseSolutionCollection } from "@/lib/materials/solution-collection";

const original = { kind: "original", attribution: "Tim materi Zyx", sources: [] } as const;

export const solutionCollectionFixture = parseSolutionCollection({
  schemaVersion: "solution_collection.v1",
  productType: "solution_collection",
  release: "released_learning_content",
  id: "collection-demo",
  title: "Pembahasan soal pilihan",
  course: { id: "course-foundations", title: "Dasar matematika dan pemrograman" },
  chapter: { id: "chapter-foundations", title: "Penalaran dasar" },
  items: [
    {
      id: "triangle-area", title: "Luas segitiga", questionType: "single_choice", discipline: "mathematics", template: "calculation",
      prompt: [{ id: "triangle-prompt", kind: "markdown", markdown: "Sebuah segitiga memiliki alas $6$ cm dan tinggi $4$ cm. Berapa luasnya?" }],
      options: [
        { id: "triangle-a", parts: [{ id: "triangle-a-text", kind: "markdown", markdown: "$10\\text{ cm}^2$" }] },
        { id: "triangle-b", parts: [{ id: "triangle-b-text", kind: "markdown", markdown: "$12\\text{ cm}^2$" }] },
        { id: "triangle-c", parts: [{ id: "triangle-c-text", kind: "markdown", markdown: "$24\\text{ cm}^2$" }] },
      ],
      answer: { optionIds: ["triangle-b"], parts: [{ id: "triangle-answer", kind: "markdown", markdown: "Luas segitiga adalah $12\\text{ cm}^2$." }] },
      hintMarkdown: "Cari rumus yang menghubungkan alas dan tinggi segitiga.",
      strategy: [{ id: "triangle-strategy", kind: "markdown", markdown: "Gunakan alas dan tinggi yang saling tegak lurus." }],
      steps: [
        { id: "triangle-formula", operationMarkdown: "Tuliskan rumus luas: $L=\\frac{1}{2}at$.", reasonMarkdown: "Segitiga adalah setengah dari jajar genjang dengan alas dan tinggi yang sama.", parts: [{ id: "triangle-visual-ref", kind: "visual_ref", visualId: "triangle-diagram" }] },
        { id: "triangle-calculate", operationMarkdown: "Substitusikan $a=6$ dan $t=4$: $L=\\frac{1}{2}(6)(4)=12$.", reasonMarkdown: "Alas dan tinggi dalam sentimeter, sehingga satuan luasnya sentimeter persegi." },
      ],
      verification: [{ id: "triangle-check", kind: "markdown", markdown: "Luas jajar genjangnya $24\\text{ cm}^2$, sehingga setengahnya $12\\text{ cm}^2$." }],
      misconceptions: [{ id: "triangle-misconception", misconceptionMarkdown: "Mengalikan alas dan tinggi tanpa membagi dua menghasilkan luas jajar genjang.", correctionMarkdown: "Bagi hasilnya dengan dua untuk memperoleh luas segitiga." }],
      visuals: [{
        id: "triangle-diagram", kind: "geometry_2d", label: "Segitiga dengan alas dan tinggi", description: "Pada gambar ini, AC tegak lurus AB. Segitiga lain dengan alas dan tinggi yang sama memiliki luas yang sama.",
        bounds: { xMin: -1, xMax: 7, yMin: -1, yMax: 5 },
        geometry: { points: [{ id: "A", x: 0, y: 0, labelLatex: "A" }, { id: "B", x: 6, y: 0, labelLatex: "B" }, { id: "C", x: 0, y: 4, labelLatex: "C" }], segments: [{ id: "base", from: "A", to: "B", labelLatex: "6" }, { id: "height", from: "A", to: "C", labelLatex: "4" }], circles: [], polygons: [{ id: "triangle", pointIds: ["A", "B", "C"] }] },
        staticFallback: { type: "text", summary: "AB = 6 cm dan AC = 4 cm.", content: "Panjang BC tidak diperlukan untuk menghitung luas." },
      }],
      provenance: { problem: original, solution: original },
    },
    {
      id: "python-loop", title: "Menelusuri perulangan Python", questionType: "programming", discipline: "computer_science", template: "code_trace",
      prompt: [{ id: "loop-prompt", kind: "markdown", markdown: "Apa keluaran program berikut?" }, { id: "loop-code", kind: "code_example", language: "python", code: "total = 0\nfor n in [1, 2, 3]:\n    total += n\nprint(total)", runnable: false }],
      options: [],
      answer: { optionIds: [], parts: [{ id: "loop-answer", kind: "markdown", markdown: "Program mencetak `6`." }] },
      hintMarkdown: "Catat nilai `total` setelah satu iterasi.",
      strategy: [{ id: "loop-strategy", kind: "markdown", markdown: "Ikuti perubahan `total` pada setiap iterasi." }],
      steps: [
        { id: "loop-first", operationMarkdown: "Mulai dengan `total = 0`, lalu tambahkan `1`.", reasonMarkdown: "Elemen pertama daftar adalah `1`, sehingga `total` menjadi `1`." },
        { id: "loop-rest", operationMarkdown: "Tambahkan `2`, lalu `3`.", reasonMarkdown: "Nilai `total` berturut-turut menjadi `3` dan `6`." },
      ],
      verification: [{ id: "loop-check", kind: "markdown", markdown: "Jumlah elemen daftar adalah $1+2+3=6$." }],
      visuals: [], provenance: { problem: original, solution: original },
    },
  ],
});

// Additional independently authored examples exercise different reasoning tasks.
export const expandedSolutionCollectionFixture = parseSolutionCollection({
  ...solutionCollectionFixture,
  course: { id: "course-foundations", title: "Dasar penalaran" },
  items: [
    ...solutionCollectionFixture.items.map((item) => item.id === "triangle-area" ? {
      ...item,
      misconceptions: [
        ...(item.misconceptions ?? []),
        { id: "triangle-sum", misconceptionMarkdown: "Menjumlahkan $6+4$ menghasilkan 10, tetapi itu menjumlahkan panjang, bukan luas.", correctionMarkdown: "Kalikan alas dan tinggi yang tegak lurus, lalu bagi dua. Satuannya menjadi $\\text{cm}^2$." },
      ],
    } : item),
    {
      id: "school-claim", title: "Menilai klaim dan bukti", questionType: "single_choice", discipline: "social_science", template: "conceptual",
      prompt: [{ id: "claim-prompt", kind: "markdown", markdown: "Sekolah mengubah jam mulai dari 07.00 menjadi 08.00. Rata-rata keterlambatan turun dari 30 menjadi 18 siswa per hari. Kesimpulan mana yang paling didukung oleh data ini?" }],
      options: [
        { id: "claim-a", parts: [{ id: "claim-a-text", kind: "markdown", markdown: "Perubahan jam pasti menjadi satu-satunya penyebab turunnya keterlambatan." }] },
        { id: "claim-b", parts: [{ id: "claim-b-text", kind: "markdown", markdown: "Keterlambatan menurun setelah perubahan, tetapi data ini belum memastikan penyebabnya." }] },
        { id: "claim-c", parts: [{ id: "claim-c-text", kind: "markdown", markdown: "Semua siswa tiba tepat waktu setelah perubahan." }] },
      ],
      answer: { optionIds: ["claim-b"], parts: [{ id: "claim-answer", kind: "markdown", markdown: "Data menunjukkan penurunan setelah perubahan, bukan bukti tunggal hubungan sebab akibat." }] },
      hintMarkdown: "Apakah data hanya menunjukkan perubahan, atau juga membuktikan penyebabnya?",
      strategy: [{ id: "claim-strategy", kind: "markdown", markdown: "Pisahkan pola yang diamati dari klaim tentang penyebab." }],
      steps: [
        { id: "claim-evidence", operationMarkdown: "Bandingkan rata-rata: $30-18=12$ siswa lebih sedikit per hari.", reasonMarkdown: "Kedua angka menunjukkan perubahan rata-rata keterlambatan." },
        { id: "claim-limit", operationMarkdown: "Batasi kesimpulan pada penurunan yang diamati.", reasonMarkdown: "Faktor lain, seperti perubahan transportasi, juga dapat memengaruhi hasil.", conditionsMarkdown: "Perbandingan mengandaikan pencatatan kedua periode setara." },
      ],
      verification: [{ id: "claim-check", kind: "markdown", markdown: "Angka 18 masih lebih besar dari nol, sehingga tidak mendukung klaim bahwa semua siswa tepat waktu." }],
      misconceptions: [{ id: "claim-cause", misconceptionMarkdown: "Peristiwa yang terjadi lebih dahulu selalu menjadi penyebab.", correctionMarkdown: "Gunakan kelompok pembanding dan pertimbangkan faktor lain sebelum menyimpulkan sebab akibat." }],
      visuals: [], provenance: { problem: original, solution: original },
    },
    {
      id: "constant-speed", title: "Gerak dengan kelajuan tetap", questionType: "numeric", discipline: "natural_science", template: "calculation",
      prompt: [{ id: "speed-prompt", kind: "markdown", markdown: "Sebuah benda bergerak lurus dengan kelajuan tetap $20\\text{ m/s}$ selama $3\\text{ s}$. Berapa jarak yang ditempuh?" }], options: [],
      answer: { optionIds: [], parts: [{ id: "speed-answer", kind: "markdown", markdown: "Jaraknya $60\\text{ m}$." }] },
      hintMarkdown: "Apa arti kelajuan dalam meter per detik?",
      strategy: [{ id: "speed-strategy", kind: "markdown", markdown: "Gunakan hubungan jarak, kelajuan, dan waktu untuk gerak lurus berkelajuan tetap." }],
      steps: [
        { id: "speed-model", operationMarkdown: "Gunakan $s=vt$.", reasonMarkdown: "Kelajuan tetap menyatakan jarak yang ditempuh tiap satuan waktu.", conditionsMarkdown: "Arah gerak tidak berubah dan kelajuan dianggap tetap." },
        { id: "speed-evaluate", operationMarkdown: "Hitung $s=(20\\text{ m/s})(3\\text{ s})=60\\text{ m}$.", reasonMarkdown: "Satuan detik saling menghilangkan.", parts: [{ id: "speed-visual-ref", kind: "visual_ref", visualId: "speed-line" }] },
      ],
      verification: [{ id: "speed-check", kind: "markdown", markdown: "Dalam setiap detik benda menempuh 20 m; selama 3 detik, jarak 60 m masuk akal dan satuannya panjang." }],
      visuals: [{
        id: "speed-line", kind: "geometry_2d", label: "Posisi awal dan akhir benda", description: "Garis menunjukkan jarak antara posisi awal dan akhir pada satu lintasan lurus.",
        bounds: { xMin: -5, xMax: 65, yMin: -6, yMax: 6 },
        geometry: { points: [{ id: "start", x: 0, y: 0, labelLatex: "0" }, { id: "end", x: 60, y: 0, labelLatex: "60" }], segments: [{ id: "distance", from: "start", to: "end", labelLatex: "60\\,\\mathrm{m}" }], circles: [], polygons: [] },
        staticFallback: { type: "text", summary: "Posisi awal 0 m, posisi akhir 60 m.", content: "Tidak ada perubahan arah, sehingga panjang lintasan sama dengan perubahan posisi." },
      }], provenance: { problem: original, solution: original },
    },
    {
      id: "parity-proof", title: "Membuktikan sifat bilangan genap", questionType: "essay", discipline: "mathematics", template: "conceptual",
      prompt: [{ id: "parity-prompt", kind: "markdown", markdown: "Buktikan bahwa jika $n^2$ genap untuk suatu bilangan bulat $n$, maka $n$ genap." }], options: [],
      answer: { optionIds: [], parts: [{ id: "parity-answer", kind: "markdown", markdown: "Jika $n^2$ genap, maka $n$ genap." }] },
      hintMarkdown: "Pertimbangkan kuadrat bilangan ganjil.",
      strategy: [{ id: "parity-strategy", kind: "markdown", markdown: "Buktikan kontrapositifnya: jika $n$ ganjil, maka $n^2$ ganjil." }],
      steps: [
        { id: "parity-hypothesis", operationMarkdown: "Ambil bilangan bulat ganjil $n=2k+1$, dengan $k$ bilangan bulat.", reasonMarkdown: "Setiap bilangan bulat ganjil memiliki bentuk ini.", conditionsMarkdown: "Hipotesis berlaku untuk $n$ bilangan bulat." },
        { id: "parity-square", operationMarkdown: "Kuadratkan, lalu kelompokkan suku genap.", reasonMarkdown: "$2k^2+2k$ bilangan bulat, jadi hasilnya berbentuk ganjil.", parts: [{ id: "parity-derivation", kind: "math_unit", layout: "derivation", meaningMarkdown: "Kuadrat bilangan ganjil kembali berbentuk dua kali bilangan bulat ditambah satu.", relations: [{ id: "parity-expand", latex: "n^2=4k^2+4k+1", meaningMarkdown: "Gunakan sifat distributif pada kuadrat." }, { id: "parity-factor", latex: "n^2=2(2k^2+2k)+1", meaningMarkdown: "Faktorkan dua dari suku yang genap." }] }] },
        { id: "parity-conclude", operationMarkdown: "Karena $n$ ganjil mengakibatkan $n^2$ ganjil, jika $n^2$ genap maka $n$ genap.", reasonMarkdown: "Jika $n^2$ genap tetapi $n$ tidak genap, maka $n$ harus ganjil. Langkah sebelumnya memaksa $n^2$ ganjil, bertentangan dengan hipotesis. Karena itu $n$ harus genap." },
      ],
      verification: [{ id: "parity-check", kind: "markdown", markdown: "Kasus $n=3$ menghasilkan $n^2=9$ yang ganjil, sesuai argumen. Satu contoh saja bukan bukti untuk semua bilangan bulat." }],
      misconceptions: [{ id: "parity-example", misconceptionMarkdown: "Memeriksa beberapa bilangan genap sudah membuktikan implikasi.", correctionMarkdown: "Buktikan kontrapositif untuk setiap bilangan bulat ganjil, bukan hanya beberapa contoh." }],
      visuals: [], provenance: { problem: original, solution: original },
    },
    {
      id: "shortest-subarray", title: "Subarray dengan jumlah minimal $k$", questionType: "programming", discipline: "computer_science", template: "code_construction",
      prompt: [{ id: "subarray-prompt", kind: "markdown", markdown: "Buat fungsi Python yang menerima daftar bilangan bulat tidak negatif `nums` dan bilangan bulat positif $k$. Kembalikan panjang subarray berurutan terpendek dengan jumlah paling sedikit $k$, atau `0` jika tidak ada. Daftar boleh kosong dan boleh mengandung nol." }],
      options: [],
      answer: { optionIds: [], parts: [
        { id: "subarray-answer", kind: "markdown", markdown: "Gunakan jendela geser. Fungsi berikut mengembalikan panjang minimum atau `0` jika tidak ada jendela yang memenuhi." },
        { id: "subarray-code", kind: "code_example", language: "python", runnable: false, code: "def shortest_subarray(nums, k):\n    left = 0\n    total = 0\n    best = len(nums) + 1\n    for right, value in enumerate(nums):\n        total += value\n        while total >= k:\n            best = min(best, right - left + 1)\n            total -= nums[left]\n            left += 1\n    return 0 if best == len(nums) + 1 else best" },
      ] },
      hintMarkdown: "Pikirkan bagaimana jumlah berubah saat ujung kanan suatu jendela ditambah.",
      strategy: [{ id: "subarray-strategy", kind: "markdown", markdown: "Perluas ujung kanan untuk menambah jumlah, lalu geser ujung kiri selama syarat masih terpenuhi. Simpan panjang terkecil yang ditemukan." }],
      steps: [
        { id: "subarray-expand", operationMarkdown: "Tambahkan elemen pada ujung kanan ke `total`.", reasonMarkdown: "`total` selalu menyimpan jumlah elemen dari `left` sampai `right`." },
        { id: "subarray-shrink", operationMarkdown: "Selama `total >= k`, catat panjang jendela, kurangi elemen paling kiri, dan majukan `left`.", reasonMarkdown: "Setiap jendela yang memenuhi dicatat sebelum diperkecil. Awal yang sudah dilewati pernah menghasilkan jendela valid yang lebih pendek daripada jendela baru dengan awal yang sama. Elemen tidak negatif menjamin perluasan tidak menurunkan jumlah.", conditionsMarkdown: "Cara ini bergantung pada elemen tidak negatif dan $k>0$. Dengan bilangan negatif diperlukan pendekatan lain." },
        { id: "subarray-trace", operationMarkdown: "Gunakan daftar lengkap `[2, 3, 1, 2, 4, 3]` dengan $k=7$ dan indeks mulai dari `0`. Telusuri empat elemen pertamanya, `[2, 3, 1, 2]`.", reasonMarkdown: "Saat `right=2`, `left=0` dan `total=6`, belum cukup. Setelah `right=3`, `total=8`: catat panjang `4`, lalu buang `nums[0]=2`. Kini `left=1` dan `total=6`, sehingga penyusutan berhenti. Pada daftar lengkap, proses ini akhirnya menemukan `[4, 3]` sepanjang `2`." },
        { id: "subarray-complexity", operationMarkdown: "Kembalikan panjang terkecil, atau `0` jika tidak pernah ditemukan.", reasonMarkdown: "Kedua ujung hanya bergerak ke kanan, masing-masing paling banyak sebanyak jumlah elemen. Waktunya $O(n)$ dan ruang tambahannya $O(1)$." },
      ],
      verification: [{ id: "subarray-check", kind: "markdown", markdown: "Untuk `[2, 3, 1, 2, 4, 3]` dan $k=7$, jawabannya `2` dari `[4, 3]`. Untuk `[0, 0, 5]` dan $k=5$, jawabannya `1`; untuk `[]` atau `[1, 2]` dengan $k=5$, jawabannya `0`." }],
      misconceptions: [{ id: "subarray-negative", misconceptionMarkdown: "Jendela geser ini selalu benar walaupun ada bilangan negatif.", correctionMarkdown: "Bilangan negatif dapat menurunkan jumlah ketika jendela diperluas, sehingga asumsi yang menjamin pergeseran kiri tidak berlaku." }],
      visuals: [], provenance: { problem: original, solution: original },
    },
  ],
});

export const longSolutionCollectionFixture = {
  ...solutionCollectionFixture,
  items: Array.from({ length: 500 }, (_, index) => {
    const suffix = String(index + 1);
    return {
      ...solutionCollectionFixture.items[1],
      id: `long-${suffix}`,
      title: `Perulangan ${suffix}`,
      prompt: [{ id: `long-prompt-${suffix}`, kind: "markdown" as const, markdown: "Berapa hasil $1+2+3$?" }],
      answer: { optionIds: [], parts: [{ id: `long-answer-${suffix}`, kind: "markdown" as const, markdown: "Hasilnya $6$." }] },
      hintMarkdown: "Mulai dari dua suku pertama.",
      strategy: [{ id: `long-strategy-${suffix}`, kind: "markdown" as const, markdown: "Jumlahkan setiap suku." }],
      steps: [{ id: `long-step-${suffix}`, operationMarkdown: "Hitung $1+2+3=6$.", reasonMarkdown: "Tambahkan setiap suku satu kali." }],
      verification: [{ id: `long-check-${suffix}`, kind: "markdown" as const, markdown: "$1+2=3$, lalu $3+3=6$." }],
    };
  }),
};

/** Fenced code in a question and step must use the same static reading controls. */
export const markdownCodeSolutionCollectionFixture = {
  ...expandedSolutionCollectionFixture,
  items: expandedSolutionCollectionFixture.items.map(item => item.id !== "python-loop" ? item : {
    ...item,
    prompt: item.prompt.map(part => part.kind !== "code_example" ? part : { id: part.id, kind: "markdown" as const, markdown: "```\n# Catat perubahan total pada setiap iterasi sebelum menentukan keluaran program ini.\n" + part.code + "\n```" }),
    steps: item.steps.map((step, index) => index !== 0 ? step : { ...step, operationMarkdown: step.operationMarkdown + "\n\n```python\ntotal += 1  # Iterasi pertama menambahkan elemen pertama daftar ke nilai total yang semula nol.\n```" }),
  }),
};
