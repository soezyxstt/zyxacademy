import { useCallback, useContext, useState } from "react";
import { View } from "react-native";
import type { TutorSupportClient } from "../../../../../packages/academic/tutor-support";
import type { AdminVideoRemover } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import type { AdminCourseSectionResult } from "../../../../../packages/native-parity/academic/courses/sections";
import { CourseVideoDialog } from "../../course-video/CourseVideoDialog";
import { CourseVideoManagement } from "../../course-video/Management";
import { LiveCourseDelete } from "./live-delete";
import { Action, CourseStatus, CourseTheme, DataRow, SearchBox, layout } from "./ui";

type Videos = Extract<AdminCourseSectionResult, { type: "videos" }>;
type Props = {
  data: Videos;
  player?: TutorSupportClient["videoPlayer"];
  remove?: AdminVideoRemover;
  refresh(): void;
};

export function LiveVideos({ data, player, remove, refresh }: Props) {
  const theme = useContext(CourseTheme);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.playlists.flatMap(list => list.videos).find(video => video.id === selectedId);
  const load = useCallback((signal: AbortSignal) => {
    if (!player || !selectedId) return Promise.reject(new Error("VIDEO_NOT_FOUND"));
    return player.load(selectedId, signal);
  }, [player, selectedId]);
  const matches = (title: string) => title.toLocaleLowerCase("id").includes(search.trim().toLocaleLowerCase("id"));
  const playlists = data.playlists.filter(list => matches(list.title) || list.videos.some(video => matches(video.title)));
  return <>
    <SearchBox label="Cari video atau daftar putar" value={search} onChange={setSearch} />
    {remove ? <CourseVideoManagement role="admin" courseId={data.course.id} theme={theme} refresh={refresh} /> : null}
    {playlists.length ? playlists.map(list => <View key={list.id}>
      <DataRow title={list.title} description={list.description} detail={`${list.videos.length} video`}
        expanded={open === list.id} onPress={() => setOpen(open === list.id ? null : list.id)} />
      {open === list.id ? <View style={layout.group}>
        {remove && list.revision ? <LiveCourseDelete label="Hapus daftar putar" name={list.title}
          detail={`Penghapusan juga menghapus ${list.videos.length} entri video dari mata kuliah.`}
          revision={list.revision} target={remove(data.course.id, list.id)} refresh={refresh} /> : null}
        {list.videos.map(video => <View key={video.id}>
          <DataRow title={video.title} description={video.description} />
          <View style={layout.row}>
            {video.playable && player ? <Action label="Putar video" onPress={() => setSelectedId(video.id)} /> : null}
            {remove && video.revision ? <LiveCourseDelete label="Hapus video" name={video.title}
              revision={video.revision} target={remove(data.course.id, list.id, video.id)} refresh={refresh} /> : null}
          </View>
        </View>)}
      </View> : null}
    </View>) : <CourseStatus label="Tidak ada daftar putar pada pilihan ini." />}
    {selected && player ? <CourseVideoDialog key={selected.id} title={selected.title} locale={player.locale} theme={theme}
      origin={player.origin} load={load} close={() => setSelectedId(null)} /> : null}
  </>;
}
