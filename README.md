# voight-kampff-test
Programmatically detect humans, bots, and suspicious actors on Github.


This is the core logic powering [AgentScan](https://agentscan.netlify.app/), an app I didn't know I needed to build in the first place.

It applies an opinionated scoring system to GitHub activity signals to classify accounts as human, bot, or potentially suspicious.
The results are indicators, not verdicts. There’s no AI involved, just structured event analysis looking for patterns that feel a little off.

### Install
```bash
npm install voight-kampff-test
```

### Usage
```js
import { identifyReplicant } from 'voight-kampff-test'

const user = {} // <-- `https://api.github.com/users/${username}`
const events = [] // <-- `https://api.github.com/users/${username}/events?per_page=100`

const analysis = identifyReplicant(user, events)
```
