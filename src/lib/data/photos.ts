import type { Photo, PhotoAlbum, PhotoServer } from "../types";
import { addDays } from "../dates";
import { TODAY } from "./anchor";

export const PHOTO_SERVERS: PhotoServer[] = [
  { id: "immich-home", kind: "immich", name: "Family server", url: "https://photos.mueller.home", status: "connected" },
  { id: "immich-grand", kind: "immich", name: "Oma & Opa", url: "https://immich.schmidt-family.de", status: "connected" },
];

export const ALBUMS: PhotoAlbum[] = [
  { id: "al-2026", serverId: "immich-home", name: `Family ${TODAY.getFullYear()}`, count: 412, selected: true, weight: 50 },
  { id: "al-kids", serverId: "immich-home", name: "Kids", count: 1280, selected: true, weight: 30 },
  { id: "al-hol", serverId: "immich-home", name: "Holidays", count: 655, selected: true, weight: 0 },
  { id: "al-house", serverId: "immich-home", name: "House & garden", count: 98, selected: false, weight: 0 },
  { id: "al-shared", serverId: "immich-grand", name: "Shared family", count: 233, selected: true, weight: 20 },
  { id: "al-fav", serverId: "immich-grand", name: "Favourites", count: 61, selected: false, weight: 0 },
];

const places = ["Baltic Sea, Rügen", "Garden", "Allgäu", "Oma's kitchen", "Lake Constance", "Black Forest", "Home", "Zoo Leipzig", "Amrum"];
export const PHOTOS: Photo[] = Array.from({ length: 18 }, (_, k) => ({
  id: `p${k}`,
  albumId: ["al-2026", "al-kids", "al-hol", "al-shared"][k % 4],
  seed: k * 7 + 3,
  takenAt: addDays(TODAY, -(k * 23 + 5)),
  place: places[k % places.length],
}));
