// Decorative, locally drawn artwork; never populated with private family records.
import { treeNetwork } from './tree-network.js';
export function memoryScene() {
  return `<div class="memory-scene" aria-hidden="true">
    <span class="scrap-note note-top">a little of yesterday.<br>a little of today.</span>
    <svg class="living-tree" viewBox="0 0 560 390" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="286" cy="352" rx="173" ry="18" fill="#d8ddbd" opacity=".5"/><circle cx="300" cy="178" r="143" fill="#e8dfbf" opacity=".35"/>
      <g class="tree-sway">
        <path d="M275 350C291 298 287 238 283 165M284 263C246 245 219 212 202 173M286 225C322 208 348 178 365 141M281 197C259 168 250 137 254 104M284 176C301 151 310 122 310 91" stroke="#927454" stroke-width="12" stroke-linecap="round"/><path d="M277 345L251 360M282 343L310 357" stroke="#927454" stroke-width="6" stroke-linecap="round"/>
        <g fill="#718660"><ellipse cx="194" cy="155" rx="48" ry="64" transform="rotate(-42 194 155)"/><ellipse cx="363" cy="137" rx="43" ry="63" transform="rotate(43 363 137)"/><ellipse cx="266" cy="98" rx="48" ry="65" transform="rotate(-16 266 98)"/></g>
        <g fill="#9ba778"><ellipse cx="228" cy="204" rx="41" ry="54" transform="rotate(-58 228 204)"/><ellipse cx="328" cy="191" rx="40" ry="60" transform="rotate(52 328 191)"/><ellipse cx="317" cy="85" rx="38" ry="53" transform="rotate(24 317 85)"/></g>
        <g stroke="#e1e3c7" stroke-width="1.5" opacity=".6"><path d="M203 177L168 125M253 126L268 56M310 118L326 55M344 165L389 110M244 220L195 191M305 216L352 175"/></g>
        <g fill="#c6a477"><ellipse cx="174" cy="207" rx="11" ry="20" transform="rotate(-65 174 207)"/><ellipse cx="391" cy="184" rx="10" ry="19" transform="rotate(35 391 184)"/></g>
      </g><g class="drifting-leaf"><path d="M406 227Q432 219 426 245Q409 248 406 227" fill="#bd895d"/><path d="M408 229L425 246" stroke="#f4dfb8"/></g>
    </svg>
    <div class="memory-card memory-home"><span class="paper-tape"></span><svg viewBox="0 0 150 115"><rect width="150" height="115" fill="#dce1cc"/><circle cx="117" cy="27" r="15" fill="#e9c889"/><path d="M0 93Q40 65 84 90T150 77V115H0Z" fill="#a6b28e"/><path d="M38 63L72 33L105 63" fill="#a66f51"/><path d="M44 62H99V104H44Z" fill="#f1e7cf"/><path d="M66 79H80V104H66Z" fill="#867653"/><path d="M51 70H60V81H51ZM85 70H94V81H85Z" fill="#bcc7ac"/><path d="M17 105V60M132 103V66" stroke="#7b7954" stroke-width="3"/><ellipse cx="17" cy="59" rx="13" ry="22" fill="#718660"/><ellipse cx="132" cy="67" rx="12" ry="20" fill="#84986e"/></svg><span>where we belong</span></div>
    <div class="memory-card memory-sunset"><span class="paper-tape"></span><svg viewBox="0 0 150 110"><rect width="150" height="110" fill="#ead8b8"/><circle cx="84" cy="44" r="23" fill="#c89365"/><path d="M0 88Q35 38 79 80T150 61V110H0Z" fill="#a6ad87"/><path d="M0 110Q45 67 91 94T150 87V110Z" fill="#6e8467"/><path d="M37 77L43 98M41 69L48 98M105 81L109 105" stroke="#f4e6ca" stroke-width="2"/></svg><span>the little moments ♡</span></div>
    <span class="scrap-note note-bottom">Different branches. Same roots.</span>
  </div>`;
}
export function decorateWelcome(root) {
  setNetworkScene('network-welcome', treeNetwork);
  const welcome = root.querySelector(".welcome");
  if (!welcome) return;
  welcome.querySelector("h1").innerHTML =
    "Different branches.<br><em>One family.</em>";
  welcome.querySelector(".eyebrow").textContent =
    "EVERY LIFE CONNECTED. EVERY STORY KEPT.";
  welcome.querySelector(":scope > p").textContent =
    "A home for your everyday moments, your shared stories, and the people who make you, you.";
  welcome.querySelector(".hero")?.remove();
  updateMotion();
}
export function decorateMember() {
  setNetworkScene('network-member');
}
export function decoratePublic() {
  setNetworkScene('network-public');
  document.body.classList.add('network-member');
  updateMotion();
}
function setNetworkScene(scene, markup) {
  const backdrop=document.querySelector('.network-backdrop');
  if (!markup) {
    backdrop?.remove();
  } else if (backdrop?.dataset.scene !== scene) {
    backdrop?.remove();
    document.body.insertAdjacentHTML('afterbegin',markup());
    document.querySelector('.network-backdrop').dataset.scene=scene;
  }
  document.body.classList.remove('photo-welcome','network-welcome','network-member','network-public');
  document.body.classList.add(scene);
  updateMotion();
}
let paused = false;
try {
  paused = localStorage.getItem("otf-motion-paused") === "true";
} catch {}
function updateMotion() {
  document.documentElement.dataset.motion = paused ? "paused" : "playing";
  document.querySelectorAll("[data-motion-toggle]").forEach((button) => {
    button.hidden = !document.body.classList.contains('network-welcome');
    button.setAttribute("aria-pressed", String(paused));
    const scene = document.body.matches('.network-welcome,.network-member') ? 'signals' : 'scenery';
    button.textContent = `${paused ? 'Resume' : 'Pause'} ${scene}`;
  });
}
const header = document.querySelector("header");
if (header) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "motion-toggle quiet";
  button.dataset.motionToggle = "";
  header.append(button);
  button.addEventListener("click", () => {
    paused = !paused;
    try {
      localStorage.setItem("otf-motion-paused", String(paused));
    } catch {}
    updateMotion();
  });
}
updateMotion();
