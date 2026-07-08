'use client';

export type RenderBranchSnapshot = {
  renderBranch: string;
  reason: string | null;
  component: string | null;
  at: number;
};

let lastRenderBranch: RenderBranchSnapshot | null = null;

export function recordRenderBranchSnapshot(input: {
  renderBranch: string;
  reason?: string | null;
  component?: string | null;
}): void {
  lastRenderBranch = {
    renderBranch: input.renderBranch,
    reason: input.reason ?? null,
    component: input.component ?? null,
    at: typeof performance !== 'undefined' ? performance.now() : 0,
  };
}

export function getLastRenderBranchSnapshot(): RenderBranchSnapshot | null {
  return lastRenderBranch ? { ...lastRenderBranch } : null;
}
