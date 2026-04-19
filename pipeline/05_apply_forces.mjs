/**
 * 05_apply_forces.mjs  (ForceAtlas2 edition)
 * Pré-calcule le layout avec FA2 — cohérent avec la simulation live du browser.
 *
 * Modes :
 *   node pipeline/05_apply_forces.mjs                → recherche paramétrique + sauvegarde du meilleur
 *   node pipeline/05_apply_forces.mjs --dry           → idem mais ne modifie pas graph.json
 *   node pipeline/05_apply_forces.mjs --apply <idx>   → applique la combinaison <idx> du rapport
 *   node pipeline/05_apply_forces.mjs --iters <N>     → nombre d'itérations FA2 (défaut 500)
 */

import { readFileSync, writeFileSync } from 'fs';

// ─── Imports Node.js ──────────────────────────────────────────────────────────
const { default: Graph }   = await import('../webapp/node_modules/graphology/dist/graphology.cjs.js');
const { default: fa2 }     = await import('../webapp/node_modules/graphology-layout-forceatlas2/index.js');

const fa2Assign        = fa2.assign.bind(fa2);
const inferSettings    = fa2.inferSettings.bind(fa2);

// ─── CLI flags ────────────────────────────────────────────────────────────────
const DRY         = process.argv.includes('--dry');
const ITERS_IDX   = process.argv.indexOf('--iters');
const ITERATIONS  = ITERS_IDX !== -1 ? parseInt(process.argv[ITERS_IDX + 1]) : 500;
const APPLY_IDX   = process.argv.indexOf('--apply');
const APPLY_COMBO = APPLY_IDX !== -1 ? parseInt(process.argv[APPLY_IDX + 1]) : -1;

// ─── Grille de paramètres ─────────────────────────────────────────────────────
const GRID = {
  scalingRatio: [1.0, 2.0, 5.0, 10.0],
  gravity:      [0.02, 0.05, 0.1],
  linLogMode:   [true, false],
};

// Paramètres fixes
const FIXED = {
  barnesHutOptimize:            true,   // obligatoire pour 9k+ nœuds
  outboundAttractionDistribution: true,
  edgeWeightInfluence:          1,
  slowDown:                     1,
  adjustSizes:                  false,
};

// ─── Charger les données ──────────────────────────────────────────────────────
const DATA_PATH = 'webapp/public/data/graph.json';
const rawData = JSON.parse(readFileSync(DATA_PATH, 'utf8'));

console.log(`\n=== ForceAtlas2 pré-computation ===`);
console.log(`  ${rawData.nodes.length} nœuds, ${rawData.edges.length} arêtes`);
console.log(`  Itérations FA2 par run : ${ITERATIONS}`);

// Stocker les positions DRL d'origine (point de départ pour chaque run)
const originX = new Float64Array(rawData.nodes.length);
const originY = new Float64Array(rawData.nodes.length);
const nodeIdToIdx = new Map();
rawData.nodes.forEach((n, i) => {
  originX[i] = n.x;
  originY[i] = n.y;
  nodeIdToIdx.set(String(n.id), i);
});

// ─── Construire le graphe Graphology ─────────────────────────────────────────
function buildGraph() {
  const g = new Graph({ type: 'undirected', multi: false });

  for (const n of rawData.nodes) {
    const idx = nodeIdToIdx.get(String(n.id));
    g.addNode(String(n.id), {
      x: originX[idx],
      y: originY[idx],
      community: n.community,
      size: Math.max(1.5, Math.sqrt(n.size)),  // cohérent avec graph-store.ts Phase 3
    });
  }

  for (const e of rawData.edges) {
    const src = String(e.source);
    const tgt = String(e.target);
    if (g.hasNode(src) && g.hasNode(tgt) && !g.hasEdge(src, tgt)) {
      g.addEdge(src, tgt, { weight: e.weight ?? 1 });
    }
  }

  return g;
}

// ─── Réinitialiser les positions ──────────────────────────────────────────────
function resetPositions(graph) {
  graph.forEachNode((id) => {
    const idx = nodeIdToIdx.get(id);
    graph.setNodeAttribute(id, 'x', originX[idx]);
    graph.setNodeAttribute(id, 'y', originY[idx]);
  });
}

// ─── Métriques de séparation inter/intra communauté ──────────────────────────
function computeQuality(graph) {
  const commNodes = new Map();
  graph.forEachNode((id, attrs) => {
    const c = attrs.community;
    if (!commNodes.has(c)) commNodes.set(c, []);
    commNodes.get(c).push({ x: attrs.x, y: attrs.y });
  });

  // Intra : distance moyenne entre membres de même communauté (échantillon)
  let intraSum = 0, intraCount = 0;
  for (const [, members] of commNodes) {
    if (members.length < 2) continue;
    const sample = members.slice(0, 20);
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j < sample.length; j++) {
        intraSum += Math.hypot(sample[i].x - sample[j].x, sample[i].y - sample[j].y);
        intraCount++;
      }
    }
  }
  const avgIntra = intraCount > 0 ? intraSum / intraCount : 1;

  // Inter : distance entre centroïdes des communautés
  const centroids = [];
  for (const [, members] of commNodes) {
    if (members.length < 3) continue;
    const cx = members.reduce((s, n) => s + n.x, 0) / members.length;
    const cy = members.reduce((s, n) => s + n.y, 0) / members.length;
    centroids.push({ cx, cy });
  }
  let interSum = 0, interCount = 0;
  for (let i = 0; i < centroids.length; i++) {
    for (let j = i + 1; j < centroids.length; j++) {
      interSum += Math.hypot(centroids[i].cx - centroids[j].cx, centroids[i].cy - centroids[j].cy);
      interCount++;
    }
  }
  const avgInter = interCount > 0 ? interSum / interCount : 0;

  return { avgIntra, avgInter, ratio: avgInter / avgIntra };
}

// ─── Normaliser et écrire les positions ──────────────────────────────────────
function applyPositionsToData(graph) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  graph.forEachNode((_, attrs) => {
    if (attrs.x < minX) minX = attrs.x;
    if (attrs.x > maxX) maxX = attrs.x;
    if (attrs.y < minY) minY = attrs.y;
    if (attrs.y > maxY) maxY = attrs.y;
  });
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  graph.forEachNode((id, attrs) => {
    const idx = nodeIdToIdx.get(id);
    rawData.nodes[idx].x = Math.round((attrs.x - minX) / rangeX * 30000);
    rawData.nodes[idx].y = Math.round((attrs.y - minY) / rangeY * 30000);
  });
}

// ─── Générer toutes les combinaisons ─────────────────────────────────────────
const combos = [];
for (const sr of GRID.scalingRatio) {
  for (const g of GRID.gravity) {
    for (const ll of GRID.linLogMode) {
      combos.push({ scalingRatio: sr, gravity: g, linLogMode: ll, ...FIXED });
    }
  }
}

// ─── Mode --apply : appliquer une combinaison précise ────────────────────────
if (APPLY_COMBO >= 0) {
  const combo = combos[APPLY_COMBO];
  if (!combo) {
    console.error(`Combinaison ${APPLY_COMBO} invalide (max: ${combos.length - 1})`);
    process.exit(1);
  }
  console.log(`\nApplication de la combinaison #${APPLY_COMBO} :`, combo);
  const graph = buildGraph();
  console.log(`  Inférence des paramètres de départ...`);
  const inferred = inferSettings(graph);
  console.log(`  Baseline inféré :`, { scalingRatio: inferred.scalingRatio, gravity: inferred.gravity });
  const t0 = Date.now();
  fa2Assign(graph, { iterations: ITERATIONS, settings: combo });
  console.log(`  Terminé en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const q = computeQuality(graph);
  console.log(`  Ratio inter/intra : ${q.ratio.toFixed(2)} (intra=${q.avgIntra.toFixed(0)}, inter=${q.avgInter.toFixed(0)})`);
  if (!DRY) {
    applyPositionsToData(graph);
    writeFileSync(DATA_PATH, JSON.stringify(rawData));
    console.log(`\n✓ graph.json mis à jour (${DATA_PATH})`);
  } else {
    console.log(`\n(dry run — graph.json non modifié)`);
  }
  process.exit(0);
}

// ─── Mode recherche paramétrique ─────────────────────────────────────────────
console.log(`\nRecherche paramétrique sur ${combos.length} combinaisons...`);
console.log(`${'#'.padEnd(3)} ${'scalingRatio'.padEnd(12)} ${'gravity'.padEnd(8)} ${'linLog'.padEnd(7)} ${'ratio'.padEnd(8)} ${'intra'.padEnd(8)} ${'inter'.padEnd(8)} durée`);
console.log('-'.repeat(70));

const results = [];
const graph = buildGraph();

for (let i = 0; i < combos.length; i++) {
  const combo = combos[i];

  // Repartir toujours des positions DRL d'origine
  resetPositions(graph);

  const t0 = Date.now();
  fa2Assign(graph, { iterations: ITERATIONS, settings: combo });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const q = computeQuality(graph);
  results.push({ idx: i, combo, ...q });

  const row = [
    String(i).padEnd(3),
    String(combo.scalingRatio).padEnd(12),
    String(combo.gravity).padEnd(8),
    String(combo.linLogMode).padEnd(7),
    q.ratio.toFixed(2).padEnd(8),
    q.avgIntra.toFixed(0).padEnd(8),
    q.avgInter.toFixed(0).padEnd(8),
    elapsed + 's',
  ];
  console.log(row.join(' '));
}

// ─── Sélectionner le meilleur ─────────────────────────────────────────────────
results.sort((a, b) => b.ratio - a.ratio);
const best = results[0];

console.log(`\n=== Classement (Top 5) ===`);
results.slice(0, 5).forEach((r, rank) => {
  console.log(`  ${rank + 1}. combo #${r.idx} | scaling=${r.combo.scalingRatio} gravity=${r.combo.gravity} linLog=${r.combo.linLogMode} → ratio=${r.ratio.toFixed(2)}`);
});

console.log(`\n→ Meilleure combinaison : #${best.idx} | scaling=${best.combo.scalingRatio} gravity=${best.combo.gravity} linLog=${best.combo.linLogMode}`);
console.log(`  ratio inter/intra = ${best.ratio.toFixed(2)} (intra=${best.avgIntra.toFixed(0)}, inter=${best.avgInter.toFixed(0)})`);

// ─── Appliquer le meilleur et sauvegarder ────────────────────────────────────
if (!DRY) {
  resetPositions(graph);
  console.log(`\nApplication finale du meilleur layout (#${best.idx})...`);
  const t0 = Date.now();
  fa2Assign(graph, { iterations: ITERATIONS, settings: best.combo });
  console.log(`  Terminé en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  applyPositionsToData(graph);
  writeFileSync(DATA_PATH, JSON.stringify(rawData));
  console.log(`\n✓ graph.json mis à jour avec les positions FA2 (${DATA_PATH})`);
  console.log(`\nConseil : relancer avec --apply ${best.idx} --iters 1000 pour raffiner davantage.`);
} else {
  console.log(`\n(dry run — graph.json non modifié)`);
  console.log(`Relancer avec : node pipeline/05_apply_forces.mjs --apply ${best.idx}`);
}
