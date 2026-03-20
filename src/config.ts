export const CONFIG = {
  // Classification thresholds (inverted score: 100 = human, 0 = bot)
  THRESHOLD_HUMAN: 70, // >= this = "human"
  THRESHOLD_SUSPICIOUS: 50, // >= this = "suspicious", below = "likely_bot"

  // Account age thresholds (days)
  AGE_NEW_ACCOUNT: 30, // < this = "new account"
  AGE_YOUNG_ACCOUNT: 90, // < this = "young account"

  // Account age penalty points
  POINTS_NEW_ACCOUNT: 20,
  POINTS_YOUNG_ACCOUNT: 10,

  // Identity penalty
  POINTS_NO_IDENTITY: 15,

  // Follow ratio thresholds
  FOLLOW_RATIO_FOLLOWING_MIN: 50, // following > this AND followers < FOLLOW_RATIO_FOLLOWERS_MAX
  FOLLOW_RATIO_FOLLOWERS_MAX: 5,
  POINTS_FOLLOW_RATIO: 15,
  POINTS_ZERO_FOLLOWERS: 10,

  // Minimum events required for activity analysis
  MIN_EVENTS_FOR_ANALYSIS: 10,

  // Fork surge thresholds (time-based clustering, applies uniformly to all accounts)
  FORKS_EXTREME: 8, // >= this forks within 24 hours = "fork surge"
  FORKS_HIGH: 5, // >= this forks within 24 hours = "multiple forks"
  FORKS_SURGE_SEVERE: 20, // >= this forks within 24 hours = severe automation
  FORKS_SURGE_EXTREME_HIGH: 35, // >= this forks within 24 hours = extreme automation
  FORK_SURGE_WINDOW_HOURS: 24, // time window to detect fork clustering (spam is spam)
  POINTS_FORK_SURGE: 51, // points for 8-19 forks in 24 hours
  POINTS_FORK_SURGE_SEVERE: 70, // points for 20-34 forks in 24 hours
  POINTS_FORK_SURGE_EXTREME_HIGH: 85, // points for 35+ forks in 24 hours
  POINTS_MULTIPLE_FORKS: 26, // points for 5-7 forks in 24 hours

  // Inhuman daily activity
  HOURS_PER_DAY_INHUMAN: 16, // >= this unique hours in a day = inhuman
  CONSECUTIVE_INHUMAN_DAYS_EXTREME: 3, // consecutive days with 16+ hours
  FREQUENT_MARATHON_DAYS: 5, // non-consecutive days with 16+ hours
  POINTS_NONSTOP_ACTIVITY: 40,
  POINTS_FREQUENT_MARATHON: 25,

  // Consecutive days streak
  CONSECUTIVE_DAYS_STREAK: 21, // >= this = suspicious
  POINTS_CONTINUOUS_ACTIVITY: 25,

  // Repo spread thresholds (external repos only, young accounts only)
  REPO_SPREAD_EXTREME: 30, // >= this = extreme spread
  REPO_SPREAD_HIGH: 20, // >= this = wide spread
  POINTS_EXTREME_REPO_SPREAD_YOUNG: 30,
  POINTS_WIDE_REPO_SPREAD_YOUNG: 15,

  // External PR thresholds
  PRS_TODAY_EXTREME: 15, // >= this in 24h = PR burst
  PRS_WEEK_HIGH: 20, // >= this in 7 days = high frequency
  POINTS_PR_BURST: 20,
  POINTS_HIGH_PR_FREQUENCY: 15,

  // PR-only contributor
  EXTERNAL_PRS_MIN: 15, // external PRs threshold
  PERSONAL_REPOS_LOW: 5, // < this personal repos with many external PRs
  POINTS_PR_ONLY_CONTRIBUTOR: 20,

  // External activity ratio
  FOREIGN_RATIO_FULL: 1, // 100% external
  FOREIGN_RATIO_HIGH: 0.95, // 95%+ external
  PERSONAL_REPOS_NONE: 3, // < this with 100% external = suspicious
  POINTS_NO_PERSONAL_ACTIVITY: 30,
  POINTS_EXTERNAL_FOCUS: 20,

  // Zero repos with activity
  ZERO_REPOS_MIN_EVENTS: 20, // 0 repos but this many events = suspicious
  POINTS_ZERO_REPOS_ACTIVE: 20,

  // Activity density (events per day)
  ACTIVITY_DENSITY_HIGH: 8, // >= this events/day average
  ACTIVITY_DENSITY_EXTREME: 15, // >= this events/day average
  POINTS_HIGH_ACTIVITY_DENSITY: 15,
  POINTS_EXTREME_ACTIVITY_DENSITY: 25,

  HOURLY_ACTIVITY_HIGH: 50,
  HOURLY_ACTIVITY_EXTREME: 100,

  TIGHT_COMMIT_SECONDS: 60 * 10,
  TIGHT_COMMIT_THRESHOLD: 3,
  POINTS_TIGHT_BURST: 25,

  // Rapid repo creation (filters CreateEvent by ref_type === "repository" only)
  CREATE_EVENTS_MIN: 5, // need at least this many repo creations to analyze
  CREATE_BURST_EXTREME: 16, // >= 16 repos created in 24 hours = extreme automation
  CREATE_BURST_HIGH: 8, // >= 8 repos created in 24 hours = suspicious
  POINTS_CREATE_BURST_EXTREME: 35,
  POINTS_CREATE_BURST_HIGH: 25,

  // 24/7 activity pattern (no sleep) - adjusted for fewer false positives
  HOURS_ACTIVE_EXTREME: 21, // activity across 21+ hours = suspicious (no realistic sleep)
  EVENTS_PER_HOUR_MIN: 2.0, // minimum events per active hour for 24/7 pattern
  POINTS_24_7_ACTIVITY: 25,

  // Event type diversity (bots have narrow activity)
  EVENT_TYPE_DIVERSITY_MIN: 2, // <= 2 event types = very limited diversity
  POINTS_LOW_DIVERSITY: 20,

  // Issue comment spam (multiple comments to different repos in short timeframe)
  ISSUE_COMMENT_SPAM_WINDOW_MINUTES: 2, // time window to group comments
  ISSUE_COMMENT_SPRAY_EXTREME: 15, // >= this different repos = comment spray bot
  ISSUE_COMMENT_SPRAY_HIGH: 10, // >= this different repos in short window = suspicious
  ISSUE_COMMENT_MIN_FOR_SPRAY: 10, // need at least this many comments to analyze
  POINTS_ISSUE_COMMENT_SPRAY_EXTREME: 40,
  POINTS_ISSUE_COMMENT_SPRAY_HIGH: 30,

  // Multi-repo commit/PR bursts (context switching detection)
  // Commits happening across multiple repos in short time = context switching bot
  COMMIT_BURST_WINDOW_HOURS: 1, // time window to detect commit spikes
  COMMITS_MANY_REPOS_EXTREME: 6, // >= this commits across 5+ repos in 1 hour = extreme
  COMMITS_MANY_REPOS_HIGH: 4, // >= this commits across 4+ repos in 1 hour = suspicious
  DISTINCT_REPOS_COMMIT_EXTREME: 5, // need this many distinct repos for COMMITS_MANY_REPOS_EXTREME
  DISTINCT_REPOS_COMMIT_HIGH: 4, // need this many distinct repos for COMMITS_MANY_REPOS_HIGH
  POINTS_COMMIT_MULTI_REPO_EXTREME: 30,
  POINTS_COMMIT_MULTI_REPO_HIGH: 20,

  // PR bursts across multiple repos
  PR_BURST_WINDOW_HOURS: 6, // time window to detect PR spikes
  PRS_MANY_REPOS_EXTREME: 8, // >= this PRs across 4+ repos in 6 hours = extreme
  PRS_MANY_REPOS_HIGH: 5, // >= this PRs across 3+ repos in 6 hours = suspicious
  DISTINCT_REPOS_PR_EXTREME: 4, // need this many distinct repos for PRS_MANY_REPOS_EXTREME
  DISTINCT_REPOS_PR_HIGH: 3, // need this many distinct repos for PRS_MANY_REPOS_HIGH
  POINTS_PR_MULTI_REPO_EXTREME: 25,
  POINTS_PR_MULTI_REPO_HIGH: 15,

  // Activity-to-Asset mismatch detection (scalable pattern for dormant accounts reactivated)
  // Accounts with many repos but minimal recent activity pattern = suspicious
  REPO_ASSET_THRESHOLD: 15, // >= this many personal repos
  LOW_EVENT_THRESHOLD: 5, // <= this many events = low activity
  WATCH_EVENT_DOMINANT_RATIO: 0.5, // >= 50% of events are WatchEvent = passive surveillance pattern
  POINTS_REPO_ASSET_MISMATCH: 20,
  POINTS_WATCH_DOMINANT: 15,
} as const;
