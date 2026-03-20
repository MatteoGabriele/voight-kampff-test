<script setup lang="ts">
import { ref } from "vue";
import { identifyReplicant, getClassificationDetails } from "../../src/index";
import type { GitHubUser, GitHubEvent } from "../../src/types";

interface AnalysisResult {
  user: GitHubUser;
  classificationDetails: ReturnType<typeof getClassificationDetails>;
  totalScore: number;
  flags: Array<{ label: string; detail: string; points: number }>;
}

interface CachedData {
  user: GitHubUser;
  events: GitHubEvent[];
  timestamp: number;
}

const CACHE_KEY = "vk_cache";
const CACHE_TTL_MS = 3600000; // 1 hour

const activeTab = ref<"search" | "fixtures">("search");
const username = ref("");
const loading = ref(false);
const error = ref("");
const result = ref<AnalysisResult | null>(null);
const fixtureUsername = ref("");
const fixtureType = ref<"automation" | "user">("automation");
const fixtureLoading = ref(false);
const fixtureMessage = ref("");
const fixtureError = ref("");

function getCache(): Record<string, CachedData> {
  const stored = localStorage.getItem(CACHE_KEY);
  if (!stored) return {};

  try {
    return JSON.parse(stored) as Record<string, CachedData>;
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return {};
  }
}

function setCache(key: string, data: CachedData): void {
  const cache = getCache();
  cache[key] = data;
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function getCachedData(username: string): CachedData | null {
  const cache = getCache();
  const cached = cache[username.toLowerCase()];
  if (!cached) return null;

  const isExpired = Date.now() - cached.timestamp > CACHE_TTL_MS;
  if (isExpired) {
    delete cache[username.toLowerCase()];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    return null;
  }

  return cached;
}

function getCachedAccounts(): string[] {
  const cache = getCache();
  return Object.keys(cache)
    .filter((key) => getCachedData(key) !== null)
    .map((key) => ({
      username: cache[key].user.login,
      timestamp: cache[key].timestamp,
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((item) => item.username);
}

async function selectCachedAccount(usernameToAnalyze: string) {
  username.value = usernameToAnalyze;
  await analyzeUser();
}

async function analyzeUser() {
  if (!username.value.trim()) {
    error.value = "Please enter a username";
    return;
  }

  loading.value = true;
  error.value = "";
  result.value = null;

  try {
    const usernameLower = username.value.toLowerCase();
    const cached = getCachedData(usernameLower);

    let user: GitHubUser;
    let events: GitHubEvent[] = [];

    if (cached) {
      user = cached.user;
      events = cached.events;
    } else {
      // Fetch user data
      const userResponse = await fetch(
        `https://api.github.com/users/${username.value}`,
      );
      if (!userResponse.ok) {
        throw new Error("User not found");
      }
      user = await userResponse.json();

      // Fetch last 200 public events (2 pages of 100 each)
      const MIN_PAGE = 1;
      const MAX_PAGE = 2;

      for (let page = MIN_PAGE; page <= MAX_PAGE; page++) {
        const eventsResponse = await fetch(
          `https://api.github.com/users/${username.value}/events/public?per_page=100&page=${page}`,
        );
        if (!eventsResponse.ok) {
          throw new Error("Failed to fetch events");
        }
        const pageEvents: GitHubEvent[] = await eventsResponse.json();
        if (pageEvents.length === 0) break; // Stop if no more events
        events.push(...pageEvents);
      }

      // Cache the data
      setCache(usernameLower, {
        user,
        events,
        timestamp: Date.now(),
      });
    }

    // Identify replicant
    const identifyResult = identifyReplicant({
      createdAt: user.created_at,
      reposCount: user.public_repos,
      accountName: user.login,
      events,
    });

    const classificationDetails = getClassificationDetails(
      identifyResult.classification,
    );

    result.value = {
      user,
      classificationDetails,
      totalScore: identifyResult.score,
      flags: identifyResult.flags,
    };
  } catch (err) {
    error.value = err instanceof Error ? err.message : "An error occurred";
  } finally {
    loading.value = false;
  }
}

async function generateFixture() {
  if (!fixtureUsername.value.trim()) {
    fixtureError.value = "Please enter a username";
    return;
  }

  fixtureLoading.value = true;
  fixtureError.value = "";
  fixtureMessage.value = "";

  try {
    const response = await fetch("http://localhost:3001/api/generate-fixture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: fixtureUsername.value,
        type: fixtureType.value,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to generate fixture");
    }

    fixtureMessage.value = `✓ Fixture generated successfully!\n${data.message}`;
    fixtureUsername.value = "";
  } catch (err) {
    fixtureError.value =
      err instanceof Error ? err.message : "An error occurred";
  } finally {
    fixtureLoading.value = false;
  }
}
</script>

<template>
  <div class="container">
    <h1>Voight-Kampff Test</h1>

    <div class="tabs">
      <button
        :class="['tab-btn', { active: activeTab === 'search' }]"
        @click="activeTab = 'search'"
      >
        Search
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'fixtures' }]"
        @click="activeTab = 'fixtures'"
      >
        Fixtures
      </button>
    </div>

    <!-- Search Tab -->
    <div v-if="activeTab === 'search'" class="tab-content">
      <div class="form-group">
        <input
          v-model="username"
          type="text"
          placeholder="Enter GitHub username..."
          @keyup.enter="analyzeUser"
          :disabled="loading"
        />
        <button @click="analyzeUser" :disabled="loading">
          {{ loading ? "Analyzing..." : "Analyze" }}
        </button>
      </div>

      <div v-if="getCachedAccounts().length > 0" class="cached-accounts">
        <div class="cached-label">Cached Accounts</div>
        <div class="cached-list">
          <button
            v-for="account in getCachedAccounts()"
            :key="account"
            class="cached-account-btn"
            @click="selectCachedAccount(account)"
            :disabled="loading"
          >
            {{ account }}
          </button>
        </div>
      </div>

      <div v-if="loading" class="loading">
        <span class="spinner"></span>
        Fetching GitHub data...
      </div>

      <div v-if="error" class="error">
        {{ error }}
      </div>

      <div v-if="result" class="results">
        <div class="user-info">
          <div class="user-header">
            <img
              v-if="result.user.avatar_url"
              :src="result.user.avatar_url"
              :alt="result.user.login"
              class="user-avatar"
            />
            <div class="user-header-info">
              <h3>{{ result.user.login }}</h3>
              <p class="user-name">{{ result.user.name || "N/A" }}</p>
            </div>
          </div>
          <div class="user-details">
            <p>
              <strong>Created:</strong>
              {{ new Date(result.user.created_at).toLocaleDateString() }}
            </p>
            <p><strong>Repositories:</strong> {{ result.user.public_repos }}</p>
            <p><strong>Followers:</strong> {{ result.user.followers }}</p>
          </div>
        </div>

        <div class="classification-result">
          <h3>Classification Result</h3>
          <div class="score">
            {{ result.classificationDetails.label }}
          </div>
          <div class="classification-text">
            {{ result.classificationDetails.description }}
          </div>
          <div class="score-detail">
            Automation Score: <span>{{ result.totalScore }}</span> / 100
          </div>

          <div v-if="result.flags.length > 0" class="flags-list">
            <h4>Detected Flags ({{ result.flags.length }})</h4>
            <div v-for="flag in result.flags" :key="flag.label" class="flag">
              <div class="flag-label">{{ flag.label }}</div>
              <div class="flag-detail">{{ flag.detail }}</div>
              <div class="flag-points">+{{ flag.points }} points</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Fixtures Tab -->
    <div v-if="activeTab === 'fixtures'" class="tab-content">
      <div class="fixture-generator">
        <div class="fixture-label">Generate Fixture</div>
        <div class="fixture-form">
          <input
            v-model="fixtureUsername"
            type="text"
            placeholder="GitHub username..."
            class="fixture-input"
            :disabled="fixtureLoading"
          />
          <div class="fixture-toggle">
            <button
              :class="['toggle-btn', { active: fixtureType === 'user' }]"
              @click="fixtureType = 'user'"
              :disabled="fixtureLoading"
            >
              User
            </button>
            <button
              :class="['toggle-btn', { active: fixtureType === 'automation' }]"
              @click="fixtureType = 'automation'"
              :disabled="fixtureLoading"
            >
              Automation
            </button>
          </div>
          <button
            class="generate-btn"
            @click="generateFixture"
            :disabled="!fixtureUsername.trim() || fixtureLoading"
          >
            {{ fixtureLoading ? "Generating..." : "Generate" }}
          </button>
        </div>
        <div v-if="fixtureMessage" class="fixture-success">
          {{ fixtureMessage }}
        </div>
        <div v-if="fixtureError" class="fixture-error">
          {{ fixtureError }}
        </div>
      </div>
    </div>
  </div>
</template>
