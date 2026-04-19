import { getGraph } from '../data/graph-store.ts';
import { setState, getState } from '../state.ts';
import { getSigma } from '../graph/renderer.ts';
import { loadStats } from '../data/loader.ts';
import { $ } from '../utils/dom.ts';

let animationFrame: number | null = null;

export async function initTimeline(): Promise<void> {
  const startSlider = $('#year-start') as HTMLInputElement;
  const endSlider = $('#year-end') as HTMLInputElement;
  const startLabel = $('#year-start-label');
  const endLabel = $('#year-end-label');
  const playBtn = $('#btn-play');

  // Render histogram
  renderHistogram();

  const updateFilter = () => {
    const start = parseInt(startSlider.value);
    const end = parseInt(endSlider.value);

    // Ensure start <= end
    if (start > end) {
      startSlider.value = endSlider.value;
    }

    const actualStart = Math.min(start, end);
    const actualEnd = Math.max(start, end);

    startLabel.textContent = String(actualStart);
    endLabel.textContent = String(actualEnd);

    setState({ yearRange: [actualStart, actualEnd] });
    applyTimelineFilter(actualStart, actualEnd);
  };

  startSlider.addEventListener('input', updateFilter);
  endSlider.addEventListener('input', updateFilter);

  // Play animation
  let playing = false;
  playBtn.addEventListener('click', () => {
    if (playing) {
      playing = false;
      playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
      if (animationFrame) cancelAnimationFrame(animationFrame);
      return;
    }

    playing = true;
    playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>';

    startSlider.value = '2000';
    endSlider.value = '2000';
    startLabel.textContent = '2000';

    let currentYear = 2000;
    const animate = () => {
      if (!playing || currentYear > 2025) {
        playing = false;
        playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
        return;
      }
      endSlider.value = String(currentYear);
      endLabel.textContent = String(currentYear);
      setState({ yearRange: [2000, currentYear] });
      applyTimelineFilter(2000, currentYear);
      currentYear++;
      setTimeout(() => {
        animationFrame = requestAnimationFrame(animate);
      }, 200);
    };
    animate();
  });
}

function applyTimelineFilter(startYear: number, endYear: number): void {
  const graph = getGraph();
  const hiddenEdges = new Set<string>();
  const visibleNodes = new Set<string>();

  // If full range, show everything
  if (startYear <= 2000 && endYear >= 2025) {
    setState({ hiddenNodes: null, hiddenEdges: null });
    getSigma().refresh();
    return;
  }

  graph.forEachEdge((edge, attrs, source, target) => {
    const year = attrs.minYear;
    if (year && year > 0 && (year < startYear || year > endYear)) {
      hiddenEdges.add(edge);
    } else {
      visibleNodes.add(source);
      visibleNodes.add(target);
    }
  });

  // Hide nodes with no visible edges
  const hiddenNodes = new Set<string>();
  graph.forEachNode((node) => {
    if (!visibleNodes.has(node)) {
      hiddenNodes.add(node);
    }
  });

  setState({ hiddenNodes, hiddenEdges });
  getSigma().refresh();
}

async function renderHistogram(): Promise<void> {
  try {
    const stats = await loadStats();
    const histogram = stats.yearHistogram;
    const container = $('#year-histogram');

    const years = Object.keys(histogram).map(Number).filter(y => y >= 2000 && y <= 2025).sort((a, b) => a - b);
    if (years.length === 0) return;

    const maxCount = Math.max(...years.map(y => histogram[String(y)] || 0));

    container.innerHTML = years.map(y => {
      const count = histogram[String(y)] || 0;
      const height = Math.max(2, (count / maxCount) * 30);
      return `<div class="histogram-bar" style="height:${height}px" title="${y}: ${count} collabs"></div>`;
    }).join('');
  } catch { /* ignore */ }
}
