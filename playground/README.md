# Voight-Kampff Playground

A quick Vue + Vite app to test the Voight-Kampff identification system in real-time.

## Setup

1. Install dependencies (from the root directory):

```bash
pnpm install
```

2. From the playground directory, run both servers together:

```bash
cd playground
pnpm dev:all
```

The app will open at `http://localhost:5173`
The backend API runs at `http://localhost:3001`

**Alternative:** Run them separately in different terminals:

```bash
# Terminal 1
pnpm dev

# Terminal 2
pnpm dev:server
```

## Usage

### Analyze Users

- Enter a GitHub username in the input field
- Click "Analyze" to fetch the user's data and events from GitHub's public APIs
- The app will query:
  - User profile information
  - Last 200 public events
- Results are piped through the `identifyReplicant` method
- Classification scores and detected flags are displayed below

### Cached Accounts

- Previously analyzed accounts are cached in localStorage
- Cached accounts appear as quick-select buttons below the search form
- Click on a cached account to instantly re-analyze it

### Generate Fixtures

- Use the "Generate Fixture" section to create test fixtures
- Enter a GitHub username
- Toggle between "User" or "Automation" type
- Click "Generate" to create the fixture and save it to `test/fixtures/`
- The server will execute the `pnpm add:fixture` command
- Results display directly in the app

## How It Works

1. **GitHub API Queries**: Fetches user data and public events
2. **Identification**: Uses the `identifyReplicant` function to analyze the account
3. **Classification**: Generates a classification score and details
4. **Display**: Shows user info, flags, and classification results

No API keys required - uses GitHub's public APIs!
