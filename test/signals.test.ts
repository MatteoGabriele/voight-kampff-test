import { expect, describe, it, beforeEach, afterEach, vi } from "vitest";
import { identifyReplicant } from "../src/identify-replicant";
import { getFixtures } from "./utils/get-fixtures";
import type { GitHubEvent } from "../src/types";

const date = new Date(2026, 2, 10, 12);

describe("Signals", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(getFixtures())("analysis $1", (fixture) => {
    vi.setSystemTime(date);

    const identity = identifyReplicant({
      createdAt: fixture.user.created_at,
      reposCount: fixture.user.public_repos,
      accountName: fixture.user.login,
      events: fixture.events,
    });

    expect(identity).toMatchSnapshot();
  });
});

// Helper: build a closed+merged PullRequestEvent into an external repo
function mergedPREvent(repo: string, eventDate: string): GitHubEvent {
  return {
    type: "PullRequestEvent",
    created_at: eventDate,
    repo: { id: 0, name: repo, url: "" },
    payload: {
      action: "closed",
      pull_request: { merged: true },
    },
  } as unknown as GitHubEvent;
}

// Pad an event list to at least `total` events with no-op PushEvents on own repos.
// Required because behavioral signals are gated on events.length >= MIN_EVENTS_FOR_ANALYSIS (10).
function padToMinEvents(
  events: GitHubEvent[],
  accountName: string,
  total = 12,
): GitHubEvent[] {
  const extra = Array.from(
    { length: Math.max(0, total - events.length) },
    (_, i) =>
      ({
        type: "PushEvent",
        created_at: `2025-12-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
        repo: { id: 0, name: `${accountName}/own-repo`, url: "" },
        payload: {},
      }) as unknown as GitHubEvent,
  );
  return [...events, ...extra];
}

// Established contributor: account created 2015, few personal repos, lots of external PRs
// mirrors the real false-positive pattern (high external activity + low personal repos)
const ESTABLISHED_CREATED_AT = "2015-01-01T00:00:00Z"; // ~4000 days old at fake timer date
const ESTABLISHED_REPOS = 3; // below PERSONAL_REPOS_LOW (5)

describe("Merged external PR mitigating signal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies high mitigation (-20 pts) when 8+ distinct repos merged PRs", () => {
    const externalRepos = [
      "org-a/repo-1",
      "org-b/repo-2",
      "org-c/repo-3",
      "org-d/repo-4",
      "org-e/repo-5",
      "org-f/repo-6",
      "org-g/repo-7",
      "org-h/repo-8",
    ];
    const events = padToMinEvents(
      externalRepos.map((repo) => mergedPREvent(repo, "2026-01-15T10:00:00Z")),
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) => f.label === "Accepted contributions across many repos",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-20);
  });

  it("applies base mitigation (-10 pts) when 3–7 distinct repos merged PRs", () => {
    const externalRepos = ["org-a/repo-1", "org-b/repo-2", "org-c/repo-3"];
    const events = padToMinEvents(
      externalRepos.map((repo) => mergedPREvent(repo, "2026-01-15T10:00:00Z")),
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) => f.label === "Accepted contributions across repos",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-10);
  });

  it("does not trigger when fewer than 3 distinct repos merged PRs", () => {
    const externalRepos = ["org-a/repo-1", "org-b/repo-2"];
    const events = padToMinEvents(
      externalRepos.map((repo) => mergedPREvent(repo, "2026-01-15T10:00:00Z")),
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const mitigationFlag = result.flags.find(
      (f) => f.label.startsWith("Accepted contributions"),
    );
    expect(mitigationFlag).toBeUndefined();
  });

  it("deduplicates: multiple merged PRs into the same repo count once", () => {
    // 2 merged PRs into same repo = only 1 unique repo = below threshold
    const events = [
      mergedPREvent("org-a/repo-1", "2026-01-10T10:00:00Z"),
      mergedPREvent("org-a/repo-1", "2026-01-15T10:00:00Z"),
    ];

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const mitigationFlag = result.flags.find(
      (f) => f.label.startsWith("Accepted contributions"),
    );
    expect(mitigationFlag).toBeUndefined();
  });

  it("counts PRs with action=merged (real-world API format)", () => {
    const externalRepos = ["org-a/repo-1", "org-b/repo-2", "org-c/repo-3"];
    const events = padToMinEvents(
      externalRepos.map(
        (repo) =>
          ({
            type: "PullRequestEvent",
            created_at: "2026-01-15T10:00:00Z",
            repo: { id: 0, name: repo, url: "" },
            payload: { action: "merged" },
          }) as unknown as GitHubEvent,
      ),
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) => f.label === "Accepted contributions across repos",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-10);
  });

  it("ignores own-repo PRs when account name matches repo owner", () => {
    const ownRepos = ["testuser/repo-1", "testuser/repo-2", "testuser/repo-3"];
    const events = padToMinEvents(
      ownRepos.map((repo) => mergedPREvent(repo, "2026-01-15T10:00:00Z")),
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const mitigationFlag = result.flags.find(
      (f) => f.label.startsWith("Accepted contributions"),
    );
    expect(mitigationFlag).toBeUndefined();
  });

  it("ignores opened PRs and closed-but-not-merged PRs", () => {
    const events: GitHubEvent[] = [
      // opened PR — not merged
      {
        type: "PullRequestEvent",
        created_at: "2026-01-10T10:00:00Z",
        repo: { id: 0, name: "org-a/repo-1", url: "" },
        payload: { action: "opened" },
      } as unknown as GitHubEvent,
      // closed PR, not merged (rejected)
      {
        type: "PullRequestEvent",
        created_at: "2026-01-11T10:00:00Z",
        repo: { id: 0, name: "org-b/repo-2", url: "" },
        payload: {
          action: "closed",
          pull_request: { merged: false },
        },
      } as unknown as GitHubEvent,
      // closed PR, merged field absent
      {
        type: "PullRequestEvent",
        created_at: "2026-01-12T10:00:00Z",
        repo: { id: 0, name: "org-c/repo-3", url: "" },
        payload: { action: "closed" },
      } as unknown as GitHubEvent,
    ];

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const mitigationFlag = result.flags.find(
      (f) => f.label.startsWith("Accepted contributions"),
    );
    expect(mitigationFlag).toBeUndefined();
  });
});

describe("Account age mitigating signal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies veteran mitigation (-20 pts) when account is 5+ years old", () => {
    const result = identifyReplicant({
      createdAt: "2015-01-01T00:00:00Z",
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
    });

    const flag = result.flags.find((f) => f.label === "Long-standing account");
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-20);
  });

  it("applies senior mitigation (-10 pts) when account is 3–4 years old", () => {
    const result = identifyReplicant({
      createdAt: "2022-01-01T00:00:00Z",
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
    });

    const flag = result.flags.find((f) => f.label === "Established account");
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-10);
  });

  it("does not apply age mitigation to young accounts (< 90 days)", () => {
    const result = identifyReplicant({
      createdAt: "2026-02-01T00:00:00Z",
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
    });

    const mitigationFlag = result.flags.find(
      (f) => f.label === "Long-standing account" || f.label === "Established account",
    );
    expect(mitigationFlag).toBeUndefined();
  });

  it("age penalty and age mitigation are mutually exclusive", () => {
    const result = identifyReplicant({
      createdAt: "2026-03-01T00:00:00Z",
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
    });

    const penaltyFlag = result.flags.find((f) => f.label === "Recently created");
    const mitigationFlag = result.flags.find(
      (f) => f.label === "Long-standing account" || f.label === "Established account",
    );
    expect(penaltyFlag).toBeDefined();
    expect(mitigationFlag).toBeUndefined();
  });
});

describe("Repos created before AI era mitigating signal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies high mitigation (-20 pts) when 8+ repos predate 2025", () => {
    const repos = Array.from({ length: 8 }, (_, i) => ({
      created_at: `${2015 + i}-01-01T00:00:00Z`,
    }));

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: repos.length,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
      repos,
    });

    const flag = result.flags.find(
      (f) => f.label === "Pre-AI development history",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-20);
  });

  it("applies base mitigation (-10 pts) when 3–7 repos predate 2025", () => {
    const repos = [
      { created_at: "2020-01-01T00:00:00Z" },
      { created_at: "2021-06-15T00:00:00Z" },
      { created_at: "2022-03-01T00:00:00Z" },
    ];

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: repos.length,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
      repos,
    });

    const flag = result.flags.find((f) => f.label === "Pre-AI activity");
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-10);
  });

  it("does not trigger when fewer than 3 repos predate 2025", () => {
    const repos = [
      { created_at: "2020-01-01T00:00:00Z" },
      { created_at: "2021-06-15T00:00:00Z" },
    ];

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: repos.length,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
      repos,
    });

    const mitigationFlag = result.flags.find(
      (f) =>
        f.label === "Pre-AI development history" || f.label === "Pre-AI activity",
    );
    expect(mitigationFlag).toBeUndefined();
  });

  it("does not trigger when repos field is absent", () => {
    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: 10,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
    });

    const mitigationFlag = result.flags.find(
      (f) =>
        f.label === "Pre-AI development history" || f.label === "Pre-AI activity",
    );
    expect(mitigationFlag).toBeUndefined();
  });

  it("does not trigger when all repos postdate 2025", () => {
    const repos = [
      { created_at: "2025-01-01T00:00:00Z" },
      { created_at: "2025-06-15T00:00:00Z" },
      { created_at: "2026-01-01T00:00:00Z" },
    ];

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: repos.length,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
      repos,
    });

    const mitigationFlag = result.flags.find(
      (f) =>
        f.label === "Pre-AI development history" || f.label === "Pre-AI activity",
    );
    expect(mitigationFlag).toBeUndefined();
  });

  it("counts only repos with created_at before 2025 (mixed dates)", () => {
    const repos = [
      { created_at: "2020-01-01T00:00:00Z" },
      { created_at: "2021-06-15T00:00:00Z" },
      { created_at: "2022-03-01T00:00:00Z" },
      { created_at: "2025-01-01T00:00:00Z" },
      { created_at: "2025-06-15T00:00:00Z" },
      { created_at: "2026-01-01T00:00:00Z" },
    ];

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: repos.length,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
      repos,
    });

    // 3 pre-2025 repos → base tier only
    const baseFlag = result.flags.find((f) => f.label === "Pre-AI activity");
    expect(baseFlag).toBeDefined();
    expect(baseFlag?.points).toBe(-10);

    const highFlag = result.flags.find(
      (f) => f.label === "Pre-AI development history",
    );
    expect(highFlag).toBeUndefined();
  });
});
