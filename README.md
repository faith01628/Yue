# 🌸 YUE — AI Referee & osu! Multiplayer 24/7 Bot

**Yue** is an automated AI referee and assistant for **osu! Multiplayer (Bancho IRC)** and **Discord**, featuring 24/7 Autohost rotation, Star Rating enforcement, Beatmap recommendations, AI match commentary, and a Daily Peak PP Leaderboard.

---

## 🎮 1. In-Game Commands (osu! Multiplayer Chat `#mp_`)

Type these commands directly in the osu! multiplayer lobby chat:

### 👤 Player Commands (Available to Everyone)
| Command | Aliases | Description |
| :--- | :--- | :--- |
| `.r` | `.rs`, `.r <username>` | View your (or another player's) most recent play stats (Rank, Score, PP, Combo, Hits) |
| `.map` | `.m`, `.link`, `.dl` | View current beatmap info & get direct download mirror links (Beatconnect / Mino / Nerinyan) |
| `.q` | `.queue` | View the current Autohost rotation queue |
| `.skip` | `.next` (vote) | Vote to skip the current Host if they are AFK |
| `.roominfo` | `.247` | View 24/7 lobby status (Current Host, Star Rating limit, Player count) |
| `.sr` | `.stars` | Check the current Star Rating range allowed in the room |
| `.vote yes` | `.vote no` | Cast your vote when a room poll is active |
| `.help` | `.info` | Display a quick command summary in-game |

### 👑 Host Commands (Current Lobby Host Only)
| Command | Aliases | Description |
| :--- | :--- | :--- |
| `.rnd` | `.random [star]` | Ask Yue to pick a random beatmap within the lobby's Star Limit (e.g., `.rnd 5.2`) |
| `.a` | `.accept` | Apply the beatmap that Yue just recommended to the lobby |
| `.next` | `.skip` | Pass the Host crown immediately to the next player in the queue |
| `.time <sec>` | `.timer` | Start a match countdown timer (e.g., `.time 30`) |
| `.abort` | | Abort a match currently in progress |

### 🤖 Talk to Yue & AI Match Review (`.yue`)
Use `.yue <message>` to chat with Yue or ask for an AI performance analysis:
- **Chat & Recommendations:** `.yue hello!` or `.yue recommend me a fun 5 star stream map`
- **Match Evaluation:** `.yue review my last play` or `.yue how did I do on that map?`
- **Natural Language Host Control:** If you are the current Host, you can ask Yue naturally: `.yue give me a random map` or `.yue pass host to the next player`.

---

## 💬 2. Discord Commands

| Command | Description |
| :--- | :--- |
| `.mp make <room_name>` | Create a new osu! Multiplayer room managed by Yue |
| `.mp invite <osu_username>` | Send an in-game multiplayer invite to a player |
| `.mp close` | Close your multiplayer room |
| `.topmulti` | View the 24/7 Multiplayer Peak PP Leaderboard (Daily / Weekly / Monthly) |
| `.r [osu_username]` | Check recent osu! play stats on Discord |
| `.top [osu_username]` | View a player's Top 5 best osu! plays |

---

## 🏆 3. Automated 24/7 Lobby Features

- **🔄 Smart Autohost Queue:** Automatically rotates the Host crown after every match and reminds AFK hosts after 45 seconds.
- **⭐ Star Rating Guard:** Automatically checks every selected beatmap to keep it within the lobby's configured Star Rating range.
- **🎯 Verified Daily Peak PP Leaderboard:** After each match, Yue calculates and verifies official play performance (`.rs` verification) and announces the **Top 5 Daily Peak PP** right in the lobby.
- **🎙️ Post-Match AI Commentary:** Highlights the match MVP and unlucky chokes after every beatmap.
- **📅 Daily Top 10 Discord Recap:** Automatically locks and posts the Daily Top 10 Peak PP standings to Discord at `00:00 (GMT+7)` every night.
