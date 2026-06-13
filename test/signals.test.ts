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

// ─── helpers for the new signal tests ────────────────────────────────────────

function reviewEvent(repo: string, eventDate: string): GitHubEvent {
  return {
    type: "PullRequestReviewEvent",
    created_at: eventDate,
    repo: { id: 0, name: repo, url: "" },
    payload: { action: "submitted" },
  } as unknown as GitHubEvent;
}

function reviewCommentEvent(repo: string, eventDate: string): GitHubEvent {
  return {
    type: "PullRequestReviewCommentEvent",
    created_at: eventDate,
    repo: { id: 0, name: repo, url: "" },
    payload: {},
  } as unknown as GitHubEvent;
}

function syncEvent(repo: string, eventDate: string): GitHubEvent {
  return {
    type: "PullRequestEvent",
    created_at: eventDate,
    repo: { id: 0, name: repo, url: "" },
    payload: { action: "synchronize" },
  } as unknown as GitHubEvent;
}

function gistEvent(eventDate: string): GitHubEvent {
  return {
    type: "GistEvent",
    created_at: eventDate,
    repo: { id: 0, name: "gist", url: "" },
    payload: {},
  } as unknown as GitHubEvent;
}

function pushEventAt(repo: string, eventDate: string): GitHubEvent {
  return {
    type: "PushEvent",
    created_at: eventDate,
    repo: { id: 0, name: repo, url: "" },
    payload: {},
  } as unknown as GitHubEvent;
}

// ─── outbound PR review ───────────────────────────────────────────────────────

describe("Outbound PR review mitigating signal", () => {
  it("applies high mitigation (-10 pts) when 15+ outbound reviews submitted", () => {
    const events = padToMinEvents(
      Array.from({ length: 15 }, (_, i) =>
        reviewEvent(`org-${i}/repo`, "2026-01-15T10:00:00Z"),
      ),
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find((f) => f.label === "Active code reviewer");
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-10);
  });

  it("applies base mitigation (-5 pts) when 5–14 outbound reviews submitted", () => {
    const events = padToMinEvents(
      Array.from({ length: 5 }, (_, i) =>
        reviewEvent(`org-${i}/repo`, "2026-01-15T10:00:00Z"),
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
      (f) => f.label === "Code review contributor",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-5);
  });

  it("does not trigger when fewer than 5 outbound reviews", () => {
    const events = padToMinEvents(
      Array.from({ length: 4 }, (_, i) =>
        reviewEvent(`org-${i}/repo`, "2026-01-15T10:00:00Z"),
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
      (f) =>
        f.label === "Active code reviewer" ||
        f.label === "Code review contributor",
    );
    expect(flag).toBeUndefined();
  });

  it("ignores review events on own repos", () => {
    const events = padToMinEvents(
      Array.from({ length: 15 }, (_, i) =>
        reviewEvent(`testuser/repo-${i}`, "2026-01-15T10:00:00Z"),
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
      (f) =>
        f.label === "Active code reviewer" ||
        f.label === "Code review contributor",
    );
    expect(flag).toBeUndefined();
  });
});

// ─── inline review comments ───────────────────────────────────────────────────

describe("Inline review comment mitigating signal", () => {
  it("applies high mitigation (-10 pts) when 10+ inline review comments", () => {
    const events = padToMinEvents(
      Array.from({ length: 10 }, (_, i) =>
        reviewCommentEvent(`org-${i}/repo`, "2026-01-15T10:00:00Z"),
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
      (f) => f.label === "Frequent inline reviewer",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-10);
  });

  it("applies base mitigation (-5 pts) when 3–9 inline review comments", () => {
    const events = padToMinEvents(
      Array.from({ length: 3 }, (_, i) =>
        reviewCommentEvent(`org-${i}/repo`, "2026-01-15T10:00:00Z"),
      ),
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find((f) => f.label === "Inline code reviewer");
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-5);
  });

  it("does not trigger when fewer than 3 inline review comments", () => {
    const events = padToMinEvents(
      Array.from({ length: 2 }, (_, i) =>
        reviewCommentEvent(`org-${i}/repo`, "2026-01-15T10:00:00Z"),
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
      (f) =>
        f.label === "Frequent inline reviewer" ||
        f.label === "Inline code reviewer",
    );
    expect(flag).toBeUndefined();
  });

  it("ignores inline review comments on own repos", () => {
    const events = padToMinEvents(
      Array.from({ length: 10 }, (_, i) =>
        reviewCommentEvent(`testuser/repo-${i}`, "2026-01-15T10:00:00Z"),
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
      (f) =>
        f.label === "Frequent inline reviewer" ||
        f.label === "Inline code reviewer",
    );
    expect(flag).toBeUndefined();
  });
});

// ─── follower count ───────────────────────────────────────────────────────────

describe("Follower count mitigating signal", () => {
  it("applies high mitigation (-10 pts) when 200+ followers", () => {
    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
      profile: { followers: 200 },
    });

    const flag = result.flags.find(
      (f) => f.label === "Established community presence",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-10);
  });

  it("applies base mitigation (-5 pts) when 50–199 followers", () => {
    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
      profile: { followers: 50 },
    });

    const flag = result.flags.find((f) => f.label === "Community presence");
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-5);
  });

  it("does not trigger when fewer than 50 followers", () => {
    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
      profile: { followers: 49 },
    });

    const flag = result.flags.find(
      (f) =>
        f.label === "Established community presence" ||
        f.label === "Community presence",
    );
    expect(flag).toBeUndefined();
  });

  it("does not trigger when profile is absent", () => {
    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
    });

    const flag = result.flags.find(
      (f) =>
        f.label === "Established community presence" ||
        f.label === "Community presence",
    );
    expect(flag).toBeUndefined();
  });
});

// ─── identity completeness ────────────────────────────────────────────────────

describe("Identity completeness mitigating signal", () => {
  it("applies high mitigation (-10 pts) when all 5 fields filled and bio is substantive", () => {
    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
      profile: {
        name: "Alice Developer",
        company: "OSS Corp",
        location: "Berlin, Germany",
        bio: "Building open source software and contributing to the ecosystem.",
        blog: "https://alice.dev",
      },
    });

    const flag = result.flags.find(
      (f) => f.label === "Complete developer identity",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-10);
  });

  it("applies base mitigation (-5 pts) when 3 fields filled", () => {
    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
      profile: {
        name: "Alice Developer",
        company: "OSS Corp",
        location: "Berlin, Germany",
      },
    });

    const flag = result.flags.find(
      (f) => f.label === "Established developer identity",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-5);
  });

  it("does not apply high mitigation when all fields filled but bio is short", () => {
    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
      profile: {
        name: "Alice",
        company: "Corp",
        location: "Berlin",
        bio: "Dev",
        blog: "https://alice.dev",
      },
    });

    const highFlag = result.flags.find(
      (f) => f.label === "Complete developer identity",
    );
    expect(highFlag).toBeUndefined();

    // base tier fires because 5 fields are filled (>= 3)
    const baseFlag = result.flags.find(
      (f) => f.label === "Established developer identity",
    );
    expect(baseFlag).toBeDefined();
  });

  it("does not trigger when fewer than 3 fields filled", () => {
    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
      profile: {
        name: "Alice",
        company: null,
        location: "",
        bio: null,
        blog: "",
      },
    });

    const flag = result.flags.find(
      (f) =>
        f.label === "Complete developer identity" ||
        f.label === "Established developer identity",
    );
    expect(flag).toBeUndefined();
  });

  it("does not trigger when profile is absent", () => {
    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: padToMinEvents([], "testuser"),
    });

    const flag = result.flags.find(
      (f) =>
        f.label === "Complete developer identity" ||
        f.label === "Established developer identity",
    );
    expect(flag).toBeUndefined();
  });
});

// ─── activity dormancy gap ────────────────────────────────────────────────────

describe("Activity dormancy gap mitigating signal", () => {
  it("applies high mitigation (-10 pts) when a 60+ day gap exists", () => {
    // Aug 1 → Dec 1 = 122 days ≥ 60
    const events = padToMinEvents(
      [pushEventAt("external/repo", "2025-08-01T10:00:00Z")],
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) => f.label === "Extended activity hiatus",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-10);
  });

  it("applies base mitigation (-5 pts) when a 30–59 day gap exists", () => {
    // Oct 20 → Dec 1 = 42 days ≥ 30
    const events = padToMinEvents(
      [pushEventAt("external/repo", "2025-10-20T10:00:00Z")],
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find((f) => f.label === "Activity hiatus");
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-5);
  });

  it("does not trigger when no gap exceeds 29 days", () => {
    // padToMinEvents produces Dec 1–12, max gap = 1 day
    const events = padToMinEvents([], "testuser");

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) =>
        f.label === "Extended activity hiatus" || f.label === "Activity hiatus",
    );
    expect(flag).toBeUndefined();
  });

  it("uses the largest gap in the event history", () => {
    // Three gaps: Nov1→Dec1 (30 days), Dec1→Dec2 (1 day), Dec2→Dec3 (1 day)
    // The 30-day gap should trigger base tier
    const events = padToMinEvents(
      [pushEventAt("external/repo", "2025-11-01T10:00:00Z")],
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) =>
        f.label === "Activity hiatus" ||
        f.label === "Extended activity hiatus",
    );
    expect(flag).toBeDefined();
  });
});

// ─── gist activity ────────────────────────────────────────────────────────────

describe("Gist activity mitigating signal", () => {
  it("applies mitigation (-5 pts) when any GistEvent is present", () => {
    const events = padToMinEvents(
      [gistEvent("2026-01-15T10:00:00Z")],
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find((f) => f.label === "Gist activity");
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-5);
  });

  it("does not trigger when no GistEvent is present", () => {
    const events = padToMinEvents([], "testuser");

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find((f) => f.label === "Gist activity");
    expect(flag).toBeUndefined();
  });

  it("only needs one GistEvent to trigger (multiple do not stack)", () => {
    const events = padToMinEvents(
      [
        gistEvent("2026-01-10T10:00:00Z"),
        gistEvent("2026-01-15T10:00:00Z"),
        gistEvent("2026-01-20T10:00:00Z"),
      ],
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const gistFlags = result.flags.filter((f) => f.label === "Gist activity");
    expect(gistFlags).toHaveLength(1);
    expect(gistFlags[0].points).toBe(-5);
  });
});

// ─── PR iteration cycles ──────────────────────────────────────────────────────

describe("PR iteration cycle mitigating signal", () => {
  it("applies high mitigation (-10 pts) when synchronize events span 5+ external repos", () => {
    const externalRepos = [
      "org-a/repo-1",
      "org-b/repo-2",
      "org-c/repo-3",
      "org-d/repo-4",
      "org-e/repo-5",
    ];
    const events = padToMinEvents(
      externalRepos.map((repo) => syncEvent(repo, "2026-01-15T10:00:00Z")),
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) => f.label === "Active PR iteration across many repos",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-10);
  });

  it("applies base mitigation (-5 pts) when synchronize events span 2–4 external repos", () => {
    const events = padToMinEvents(
      [
        syncEvent("org-a/repo-1", "2026-01-15T10:00:00Z"),
        syncEvent("org-b/repo-2", "2026-01-15T10:00:00Z"),
      ],
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find((f) => f.label === "Active PR iteration");
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-5);
  });

  it("does not trigger when synchronize events span only 1 external repo", () => {
    const events = padToMinEvents(
      [syncEvent("org-a/repo-1", "2026-01-15T10:00:00Z")],
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) =>
        f.label === "Active PR iteration across many repos" ||
        f.label === "Active PR iteration",
    );
    expect(flag).toBeUndefined();
  });

  it("deduplicates: multiple synchronize events to the same repo count once", () => {
    // 3 sync events but all to the same repo = 1 unique repo = below threshold
    const events = padToMinEvents(
      [
        syncEvent("org-a/repo-1", "2026-01-10T10:00:00Z"),
        syncEvent("org-a/repo-1", "2026-01-12T10:00:00Z"),
        syncEvent("org-a/repo-1", "2026-01-15T10:00:00Z"),
      ],
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) =>
        f.label === "Active PR iteration across many repos" ||
        f.label === "Active PR iteration",
    );
    expect(flag).toBeUndefined();
  });

  it("ignores synchronize events on own repos", () => {
    const events = padToMinEvents(
      [
        syncEvent("testuser/repo-1", "2026-01-15T10:00:00Z"),
        syncEvent("testuser/repo-2", "2026-01-15T10:00:00Z"),
        syncEvent("testuser/repo-3", "2026-01-15T10:00:00Z"),
        syncEvent("testuser/repo-4", "2026-01-15T10:00:00Z"),
        syncEvent("testuser/repo-5", "2026-01-15T10:00:00Z"),
      ],
      "testuser",
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) =>
        f.label === "Active PR iteration across many repos" ||
        f.label === "Active PR iteration",
    );
    expect(flag).toBeUndefined();
  });
});

// ─── long-span repo engagement ────────────────────────────────────────────────

describe("Long-span repo engagement mitigating signal", () => {
  it("applies high mitigation (-10 pts) when 4+ repos have 4+ month engagement span", () => {
    // each repo has events 8 months apart (Jul 2025 and Mar 2026 = ~243 days ≥ 120)
    const spanEvents = ["org-a/r", "org-b/r", "org-c/r", "org-d/r"].flatMap(
      (repo) => [
        pushEventAt(repo, "2025-07-01T10:00:00Z"),
        pushEventAt(repo, "2026-03-01T10:00:00Z"),
      ],
    );
    const events = padToMinEvents(spanEvents, "testuser");

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) => f.label === "Deep long-term project engagement",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-10);
  });

  it("applies base mitigation (-5 pts) when 2–3 repos have 4+ month engagement span", () => {
    const spanEvents = ["org-a/r", "org-b/r"].flatMap((repo) => [
      pushEventAt(repo, "2025-07-01T10:00:00Z"),
      pushEventAt(repo, "2026-03-01T10:00:00Z"),
    ]);
    const events = padToMinEvents(spanEvents, "testuser");

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) => f.label === "Long-term project engagement",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-5);
  });

  it("does not trigger when only 1 repo has a 4+ month span", () => {
    const spanEvents = [
      pushEventAt("org-a/r", "2025-07-01T10:00:00Z"),
      pushEventAt("org-a/r", "2026-03-01T10:00:00Z"),
    ];
    const events = padToMinEvents(spanEvents, "testuser");

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) =>
        f.label === "Deep long-term project engagement" ||
        f.label === "Long-term project engagement",
    );
    expect(flag).toBeUndefined();
  });

  it("does not count repos with a span shorter than 4 months", () => {
    // Two repos but each only has a 2-month span (60 days < 120)
    const spanEvents = ["org-a/r", "org-b/r"].flatMap((repo) => [
      pushEventAt(repo, "2025-10-01T10:00:00Z"),
      pushEventAt(repo, "2025-12-01T10:00:00Z"),
    ]);
    const events = padToMinEvents(spanEvents, "testuser");

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find(
      (f) =>
        f.label === "Deep long-term project engagement" ||
        f.label === "Long-term project engagement",
    );
    expect(flag).toBeUndefined();
  });
});

// ─── day-of-week variance ─────────────────────────────────────────────────────

describe("Day-of-week variance mitigating signal", () => {
  // Jan 1 2026 = Thursday, so:
  // Sun = Jan 4, Mon = Jan 5, Tue = Jan 6, Wed = Jan 7,
  // Thu = Jan 8, Fri = Jan 9, Sat = Jan 10

  it("applies mitigation (-5 pts) when activity is concentrated on weekdays (CV ≥ 0.3)", () => {
    // 8 events each on Mon–Thu (32 total), none on Fri/Sat/Sun
    // CV ≈ 0.87 ≥ 0.3
    const monThu: GitHubEvent[] = [];
    for (let week = 0; week < 4; week++) {
      const base = 5 + week * 7; // Jan 5, 12, 19, 26 for Monday
      monThu.push(
        pushEventAt("org/repo", `2026-01-${String(base).padStart(2, "0")}T10:00:00Z`),     // Mon
        pushEventAt("org/repo", `2026-01-${String(base + 1).padStart(2, "0")}T10:00:00Z`), // Tue
        pushEventAt("org/repo", `2026-01-${String(base + 2).padStart(2, "0")}T10:00:00Z`), // Wed
        pushEventAt("org/repo", `2026-01-${String(base + 3).padStart(2, "0")}T10:00:00Z`), // Thu
      );
    }
    // 16 events so far; add 16 more for Feb to hit 32 total
    for (let week = 0; week < 4; week++) {
      const base = 2 + week * 7; // Feb 2, 9, 16, 23 for Monday
      monThu.push(
        pushEventAt("org/repo", `2026-02-${String(base).padStart(2, "0")}T10:00:00Z`),
        pushEventAt("org/repo", `2026-02-${String(base + 1).padStart(2, "0")}T10:00:00Z`),
        pushEventAt("org/repo", `2026-02-${String(base + 2).padStart(2, "0")}T10:00:00Z`),
        pushEventAt("org/repo", `2026-02-${String(base + 3).padStart(2, "0")}T10:00:00Z`),
      );
    }

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: monThu,
    });

    const flag = result.flags.find((f) => f.label === "Human activity patterns");
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(-5);
  });

  it("does not trigger when activity is evenly spread across all 7 days (CV < 0.3)", () => {
    // 4 events per day of week = 28 total, CV = 0
    const uniform: GitHubEvent[] = [];
    for (let week = 0; week < 4; week++) {
      const base = 4 + week * 7; // starts on Sunday
      for (let d = 0; d < 7; d++) {
        uniform.push(
          pushEventAt("org/repo", `2026-01-${String(base + d).padStart(2, "0")}T10:00:00Z`),
        );
      }
    }

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events: uniform,
    });

    const flag = result.flags.find((f) => f.label === "Human activity patterns");
    expect(flag).toBeUndefined();
  });

  it("does not trigger when fewer than 20 events (sample too small)", () => {
    // 15 events — below DOW_EVENTS_MIN
    const events = Array.from({ length: 15 }, (_, i) =>
      pushEventAt("org/repo", `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`),
    );

    const result = identifyReplicant({
      createdAt: ESTABLISHED_CREATED_AT,
      reposCount: ESTABLISHED_REPOS,
      accountName: "testuser",
      events,
    });

    const flag = result.flags.find((f) => f.label === "Human activity patterns");
    expect(flag).toBeUndefined();
  });
});
