"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchBar } from "@/components/ui/search-bar";
import { PageHeader } from "@/components/page-header";
import { Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelectField } from "@/components/ui/select-field";
import { CourseCombobox } from "@/components/admin/course-combobox";

const courseOptions = [
  { value: "math", label: "Matematika dasar" },
  { value: "physics", label: "Fisika dasar" },
];

export default function ControlContrastFixture() {
  const [dark, setDark] = useState(false);
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("all");
  return (
    <main className={dark ? "dark" : ""}>
      <div className="min-h-screen space-y-4 bg-background p-6 text-foreground">
        <Button variant="outline" onClick={() => setDark(!dark)}>Ganti tema</Button>
        <div className="flex flex-wrap gap-3">
          <Button data-testid="primary">Simpan</Button>
          <Button data-testid="secondary" variant="secondary">Lanjutkan</Button>
          <Button data-testid="brand" className="bg-brand-primary text-primary-foreground hover:bg-brand-primary/90">Kelola</Button>
          <Button data-testid="destructive" variant="destructive">Hapus</Button>
          <Button variant="outline">Batal</Button>
          <Badge variant="secondary">Mata kuliah</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Select defaultValue="all">
            <SelectTrigger variant="inline" aria-label="Filter mata kuliah">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua mata kuliah</SelectItem>
              <SelectItem value="math">Matematika dasar</SelectItem>
              <SelectItem value="physics">Fisika dasar dan pengantar mekanika untuk mahasiswa tahun pertama</SelectItem>
              <SelectItem value="chemistry" disabled>Kimia dasar</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="week" disabled>
            <SelectTrigger variant="inline" aria-label="Rentang waktu">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Minggu ini</SelectItem>
            </SelectContent>
          </Select>
          <CourseCombobox
            courses={courseOptions.map(({ value, label }) => ({ id: value, title: label }))}
            value={course}
            onValueChange={setCourse}
            placeholder="Cari dan pilih mata kuliah"
          />
        </div>
        <div className="grid max-w-2xl grid-cols-2 items-start gap-3 border-t border-border pt-3">
          <SelectField label="Mata kuliah pilihan" defaultValue="math" options={courseOptions} />
          <SelectField label="Mata kuliah wajib" required error="Pilih mata kuliah." options={courseOptions} />
          <Select>
            <SelectTrigger variant="outline" aria-label="Jawaban formulir">
              <SelectValue placeholder="Pilih jawaban" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Ya</SelectItem>
              <SelectItem value="no">Tidak</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <section className="border-t border-border pt-3">
          <PageHeader title="Mata kuliah" backHref="#courses" backLabel="Kembali ke mata kuliah" actions={
            <>
              <SearchBar collapsible size="sm" placeholder="Cari mata kuliah" value={query} onSearch={setQuery} />
              <Button size="icon-lg" aria-label="Tambah mata kuliah"><Plus aria-hidden /></Button>
            </>
          } />
          <ul id="courses" aria-label="Daftar mata kuliah" className="divide-y divide-border">
            {["Matematika dasar", "Fisika dasar"].filter((course) => course.toLowerCase().includes(query.toLowerCase())).map((course) => (
              <li key={course} className="py-2 text-body-sm">{course}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
