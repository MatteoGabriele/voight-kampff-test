## This project has been archived. Use https://github.com/unveil-project/identity instead.




### voight-kampff-test

Identifying potential automation patterns in GitHub accounts

This is the core logic behind [AgentScan](https://agentscan.netlify.app), an app I didn’t expect to build, but ended up creating after reading [this article](https://socket.dev/blog/ai-agent-lands-prs-in-major-oss-projects-targets-maintainers-via-cold-outreach) about open source projects being targeted by AI agents.

It applies an opinionated scoring system to GitHub activity signals to classify accounts as human, bot, or potentially suspicious.
The results are indicators, not verdicts. There’s no AI involved, just event analysis looking for patterns that feel a little off.

In case you don't know what is a Voight-Kampff test [watch here](https://www.youtube.com/watch?v=Umc9ezAyJv0)

### Install

```bash
npm install voight-kampff-test
```

### Usage

```js
import { identifyReplicant } from "voight-kampff-test";

const user = {}; // <-- `https://api.github.com/users/${username}`
const events = []; // <-- `https://api.github.com/users/${username}/events?per_page=100`

const analysis = identifyReplicant({
  createdAt: user.created_at,
  reposCount: user.public_repos,
  accountName: user.login,
  events,
});
```

### Issues and features requests

Please drop an issue, if you find something that doesn't work, or have an idea for something that works better.
