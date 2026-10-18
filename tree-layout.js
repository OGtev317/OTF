// Arranges the family tree by generation and draws the lines between relatives.
// Positions come only from recorded parent and partner links.
import { partnersOf } from "./kinship.js";

const ids = (list) => list || [];

/** Generation of each person: eldest recorded generation is 0. */
export function generations(people) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const parentsIn = (p) => ids(p.parents).filter((x) => byId.has(x));
  const gen = new Map(people.map((p) => [p.id, 0]));
  // Relax until stable: children sit below their parents; people without recorded parents
  // sit beside their partner, or just above their children. Generations only ever increase.
  for (let round = 0; round < people.length + 2; round++) {
    let moved = false;
    for (const p of people) {
      const ps = parentsIn(p);
      let g = ps.length ? Math.max(...ps.map((x) => gen.get(x))) + 1 : gen.get(p.id);
      if (!ps.length) {
        const mates = partnersOf(people, p.id).filter((x) => byId.has(x)).map((x) => gen.get(x));
        const kids = people.filter((c) => parentsIn(c).includes(p.id)).map((c) => gen.get(c.id) - 1);
        g = Math.max(g, ...mates, ...(mates.length ? [] : kids.length ? [Math.min(...kids)] : []));
      }
      if (g > gen.get(p.id)) { gen.set(p.id, g); moved = true; }
    }
    if (!moved) break;
  }
  return gen;
}

/** People grouped into generation rows, each row ordered to keep families and partners together. */
export function layoutRows(people, gen = generations(people)) {
  const rows = [];
  for (const p of people) (rows[gen.get(p.id)] ||= []).push(p);
  const place = new Map();
  return rows.filter(Boolean).map((row) => {
    const anchor = (p) => {
      const known = ids(p.parents).filter((x) => place.has(x)).map((x) => place.get(x));
      if (known.length) return known.reduce((a, b) => a + b, 0) / known.length;
      const mates = partnersOf(people, p.id).map((x) => people.find((m) => m.id === x)).filter(Boolean);
      const via = mates.flatMap((m) => ids(m.parents)).filter((x) => place.has(x)).map((x) => place.get(x));
      // Someone who married in follows the relative they married, just after them.
      return via.length ? via.reduce((a, b) => a + b, 0) / via.length + 1e-6 : Infinity;
    };
    const sorted = [...row].sort((a, b) => anchor(a) - anchor(b) || a.name.localeCompare(b.name));
    const ordered = [];
    for (const p of sorted) {
      if (ordered.includes(p)) continue;
      ordered.push(p);
      for (const id of partnersOf(people, p.id)) {
        const mate = row.find((m) => m.id === id);
        if (mate && !ordered.includes(mate)) ordered.push(mate);
      }
    }
    ordered.forEach((p, i) => place.set(p.id, (i + 0.5) / ordered.length));
    return ordered;
  });
}

/**
 * Draws parent–child and partner lines between the cards in `.tree-canvas`, behind them.
 * Only SVG attributes are set (no inline styles), as the site's security policy requires.
 */
export function drawTreeLines(root) {
  const selected = root.querySelector(".tree-canvas .tree-node.selected")?.dataset.node || "";
  const canvas = root.querySelector(".tree-canvas"), svg = canvas?.querySelector(".tree-lines");
  if (!svg) return;
  // Hidden on phones (the focus view is shown instead): nothing to draw.
  if (getComputedStyle(canvas).display === "none") return svg.replaceChildren();
  const hint = root.querySelector(".tree-scroll-hint");
  if (hint) hint.hidden = canvas.scrollWidth <= canvas.clientWidth + 1;
  const box = canvas.getBoundingClientRect();
  const nodes = new Map([...canvas.querySelectorAll("[data-node]")].map((n) => [n.dataset.node, n]));
  const at = (n) => {
    const r = n.getBoundingClientRect(), left = r.left - box.left + canvas.scrollLeft, top = r.top - box.top + canvas.scrollTop;
    return { x: left + r.width / 2, left, right: left + r.width, top, bottom: top + r.height };
  };
  const ns = "http://www.w3.org/2000/svg", lines = [];
  const add = (d, ends, kind) => {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", `tree-line ${kind}${selected && ends.includes(selected) ? " lit" : ""}${ends.some((x) => nodes.get(x)?.dataset.ghost) ? " pending" : ""}`);
    lines.push(path);
  };
  const curve = (x1, y1, x2, y2) => { const m = (y1 + y2) / 2; return `M${x1} ${y1} C${x1} ${m} ${x2} ${m} ${x2} ${y2}`; };
  for (const [id, node] of nodes) {
    const parents = (node.dataset.parents || "").split(" ").filter((x) => nodes.has(x));
    const child = at(node);
    // Two parents who are partners side by side share one line from between them.
    const couple = parents.length === 2 && (nodes.get(parents[0]).dataset.partners || "").split(" ").includes(parents[1]);
    const [pa, pb] = couple ? parents.map((x) => at(nodes.get(x))) : [];
    if (couple && Math.abs(pa.top - pb.top) < 4) add(curve((pa.x + pb.x) / 2, Math.max(pa.bottom, pb.bottom), child.x, child.top), [...parents, id], "child");
    else for (const p of parents) { const from = at(nodes.get(p)); add(curve(from.x, from.bottom, child.x, child.top), [p, id], "child"); }
    for (const mate of (node.dataset.partners || "").split(" ")) {
      if (!nodes.has(mate) || mate < id) continue;
      const [a, b] = [child, at(nodes.get(mate))].sort((m, n) => m.left - n.left);
      if (Math.abs(a.top - b.top) < 4) { const y = a.top + 30; add(`M${a.right} ${y} L${b.left} ${y}`, [id, mate], "partner"); }
      else add(curve(a.x, a.bottom, b.x, b.top), [id, mate], "partner");
    }
  }
  svg.setAttribute("width", canvas.scrollWidth);
  svg.setAttribute("height", canvas.scrollHeight);
  svg.replaceChildren(...lines);
}
