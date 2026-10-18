// The fictional demo: the real family app running on in-browser fictional records.
// The app is loaded only after demo-backend.js has installed its stand-in, so that
// supabase-client.js picks it up (bundling may otherwise run shared code first).
import { resetDemo } from "./demo-backend.js";
document.addEventListener("click", (event) => {
  if (!event.target.closest("#demo-reset")) return;
  if (!confirm("Start the demo over? Your changes in this demo will be cleared.")) return;
  resetDemo();
  location.reload();
});
export const app = import("./pilot.js");
