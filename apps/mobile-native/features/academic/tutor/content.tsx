import { useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { tutorLiveQuestions, type TutorFixtureRepository } from "../../../../../packages/native-parity/academic/tutor/fixture-interactions";
import { Button } from "../../../components/Button";
import type { AcademicScreenProps } from "../contracts";
import { Empty, Heading, Label, Row, TutorPage, tutorLayout } from "./ui";

type Props = Pick<AcademicScreenProps, "theme" | "navigate" | "back"> & { courseTitle: string; populated: boolean };

export function TutorMaterials({ theme, back, courseTitle, populated }: Props) {
  return <TutorPage title="Dokumen" subtitle={courseTitle} theme={theme} onBack={back}>
    <Heading theme={theme} title="Materi pengajaran" count={populated ? "2 dokumen" : "0 dokumen"} />
    {populated ? <View>
      <Row theme={theme} title="Struktur dan fungsi sel" subtitle="Organel, membran sel, dan mekanisme perpindahan zat." />
      <Row theme={theme} title="Dasar genetika" subtitle="Pewarisan sifat dan persilangan monohibrid." />
    </View> : <Empty theme={theme} title="Belum ada materi" />}
  </TutorPage>;
}

export function TutorVideos({ theme, back, courseTitle, populated }: Props) {
  const [expanded, setExpanded] = useState(false);
  return <TutorPage title="Video" subtitle={courseTitle} theme={theme} onBack={back}>
    <Heading theme={theme} title="Playlist" count={populated ? "1 playlist" : "0 playlist"} />
    {populated ? <View>
      <Button theme={theme} variant="outline" style={tutorLayout.action} accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)}>
        Struktur dan fungsi sel · 2 video
      </Button>
      {expanded ? <>
        <Row theme={theme} title="Pengenalan organel" meta="08:24" />
        <Row theme={theme} title="Difusi dan osmosis" meta="05:12" />
      </> : null}
    </View> : <Empty theme={theme} title="Belum ada playlist" />}
  </TutorPage>;
}

export function TutorLive({ theme, back, navigate, courseTitle, populated, courseId, repository }: Props & { courseId: string; repository: TutorFixtureRepository }) {
  const [selected, setSelected] = useState(false);
  const { live } = useSyncExternalStore(repository.subscribe, repository.getSnapshot, repository.getSnapshot);
  const { phase, currentQuestion } = populated ? live : { phase: "setup", currentQuestion: 0 };
  const quizPath = `/tutor/${encodeURIComponent(courseId)}/quizzes`;

  return <TutorPage title="Kuis langsung" subtitle={courseTitle} theme={theme} onBack={back}>
    {phase === "setup" ? <>
      <Heading theme={theme} title="Siapkan kuis langsung" />
      {populated ? <>
        <Button theme={theme} variant="outline" style={tutorLayout.action} accessibilityState={{ selected }} onPress={() => setSelected((value) => !value)}>
          {selected ? "✓ Kuis struktur dan fungsi sel" : "Kuis struktur dan fungsi sel"}
        </Button>
        <Button theme={theme} style={tutorLayout.action} disabled={!selected} onPress={() => repository.updateLive(courseId, "open")}>
          Buka ruang tunggu
        </Button>
      </> : <>
        <Empty theme={theme} title="Belum ada kuis terbit" />
        <Button theme={theme} variant="outline" style={tutorLayout.action} onPress={() => navigate(quizPath)}>Kelola kuis</Button>
      </>}
    </> : null}
    {phase === "lobby" ? <>
      <Heading theme={theme} title="Ruang tunggu" count="0 peserta" />
      <Row theme={theme} title="Kode gabung" meta="BIO101" />
      <Button theme={theme} style={tutorLayout.action} onPress={() => repository.updateLive(courseId, "start")}>Mulai kuis</Button>
      <Button theme={theme} variant="outline" style={tutorLayout.action} onPress={() => repository.updateLive(courseId, "close")}>Tutup ruang tunggu</Button>
    </> : null}
    {phase === "question" ? <>
      <Heading theme={theme} title={`Soal ${currentQuestion + 1}/${tutorLiveQuestions.length}`} count="0 jawaban" />
      <Label theme={theme}>{tutorLiveQuestions[currentQuestion]}</Label>
      <Button theme={theme} style={tutorLayout.action} onPress={() => repository.updateLive(courseId, "next")}>
        {currentQuestion === tutorLiveQuestions.length - 1 ? "Akhiri kuis" : "Soal berikutnya"}
      </Button>
    </> : null}
    {phase === "result" ? <>
      <Heading theme={theme} title="Hasil kuis" />
      <Empty theme={theme} title="Tidak ada jawaban peserta" />
      <Button theme={theme} variant="outline" style={tutorLayout.action} onPress={() => repository.updateLive(courseId, "close")}>Kembali ke persiapan</Button>
    </> : null}
  </TutorPage>;
}
