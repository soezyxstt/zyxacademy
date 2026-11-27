import { mountMascotScene } from "../../../../../components/gamification/zyra-mascot-3d-scene";

const scene = window.zyxPetScene;
const report = value => window.ReactNativeWebView?.postMessage(value);
try {
  const handle = mountMascotScene(document.getElementById("mascot"), scene.model, scene.animated,
    () => report("unavailable"), () => report("ready"), scene.animation, scene.suit, scene.cycle, scene.flowers);
  window.updatePetMotion = (animation, animated) => {
    handle.setAnimated(animated);
    handle.setAnimation(animation);
  };
  window.addEventListener("pagehide", () => handle.dispose(), { once: true });
} catch {
  report("unavailable");
}
