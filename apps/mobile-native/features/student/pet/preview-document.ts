import { getZyraAvatar } from "../../../../../packages/student-community/zyra-cosmetics";
import { getZyraGlbMascot } from "../../../../../packages/student-community/zyra-glb-mascots";
import { PET_SUITS, petSupportsAction } from "../../../../../packages/student-community/pet-studio";

export function petSceneOptions(pet: string, suit?: string, action?: string) {
  const avatar = getZyraAvatar(pet);
  const glb = getZyraGlbMascot(avatar?.glbCharacter);
  const model = glb?.key ?? avatar?.modelKey;
  if (!model) return null;
  const outfit = PET_SUITS.find(entry => "pet-suit-" + entry.assetId === suit);
  const animation = action && petSupportsAction(pet, action) ? action.slice("pet-action-".length) : "idle";
  return { model, suit: glb && outfit ? outfit.assetId : "none", animation, cycle: animation === "cycle",
    flowers: animation === "giveFlowers" };
}

export function petSceneDocument(scene: NonNullable<ReturnType<typeof petSceneOptions>>, origin: string,
  nonce: string, script: string, animated: boolean) {
  const base = new URL(origin);
  if (base.origin !== origin || base.protocol !== "https:" || !/^[a-zA-Z0-9-]+$/.test(nonce)) throw new Error("Invalid pet asset origin");
  const policy = "default-src 'none'; base-uri 'none'; frame-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; " +
    "script-src 'nonce-" + nonce + "' 'wasm-unsafe-eval'; connect-src " + base.origin + "/gamification/mascots/";
  const config = JSON.stringify({ ...scene, animated }).replaceAll("<", "\\u003c");
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="' + policy + '"><style>*{margin:0}html,body,#mascot{width:100%;height:100%;overflow:hidden;background:transparent}</style></head>' +
    '<body><div id="mascot"></div><script nonce="' + nonce + '">window.zyxPetScene=' + config + ';\n' +
    script.replace(/<\/script/gi, "<\\/script") + '</script></body></html>';
}
