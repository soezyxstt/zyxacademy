const profiles = [
  { group: "Kalkulus bersama", members: ["Pelajar Demo", "Alya", "Dimas"], tutor: "Kak Nara", days: [0, 2, 5], times: [["10:00", "11:30"], ["14:00", "15:30"], ["10:00", "11:30"]], topics: ["Fungsi dan limit", "Turunan dan penerapan"] },
  { group: "Tim Newton", members: ["Pelajar Demo", "Raka", "Nadia", "Farhan"], tutor: "Kak Fajar", days: [1, 3, 5], times: [["09:00", "10:30"], ["13:00", "14:30"], ["15:00", "16:30"]], topics: ["Gaya dan gerak", "Energi dan momentum"] },
  { group: "Ikatan belajar", members: ["Pelajar Demo", "Citra", "Salsa"], tutor: "Kak Laras", days: [0, 3, 6], times: [["11:00", "12:30"], ["15:00", "16:30"], ["09:00", "10:30"]], topics: ["Ikatan kimia", "Stoikiometri dan reaksi"] },
  { group: "Logika runtut", members: ["Pelajar Demo", "Bima", "Tania", "Reza"], tutor: "Kak Rafi", days: [1, 4, 6], times: [["08:00", "09:30"], ["16:00", "17:30"], ["12:00", "13:30"]], topics: ["Dekomposisi masalah", "Algoritma dan pola"] },
];
export function demoCommunitySeed(courseId: string, courseTitle?: string) {
  const identity = courseTitle ?? courseId;
  const index = /fi1101|fisika/i.test(identity) ? 1 : /ki1101|kimia/i.test(identity) ? 2 : /wi1102|berpikir/i.test(identity) ? 3 : 0;
  return profiles[index];
}
export const demoGroupId = (courseId: string) => `demo-group-${encodeURIComponent(courseId)}`;
