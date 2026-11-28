export default {
    // --- STAR LIMIT & ROOM 24/7 ---
    starLimitInfo: (min, max) => `YUE 24/7: Current room star limit: ${min.toFixed(1)}★ - ${max.toFixed(1)}★. Usage: .sr <min>-<max> (e.g. .sr 4.5-5.5)`,
    starLimitInvalidSyntax: "YUE 24/7: Invalid syntax! Please use format: .sr <min>-<max> (e.g. .sr 4.0-5.5)",
    starLimitInvalidRange: "YUE 24/7: Invalid star range! Please select between 0.0★ - 10.0★.",
    starLimitForced: (user, min, max) => `YUE 24/7: Ref/Admin ${user} forced updated Star Limit to: ${min.toFixed(1)}★ - ${max.toFixed(1)}★! (Room renamed)`,
    starLimitUpdated: (min, max) => `YUE 24/7: Updated room Star Limit to: ${min.toFixed(1)}★ - ${max.toFixed(1)}★! (Room renamed)`,
    voteStarted: (user, min, max, req, total) => `YUE 24/7: [VOTE] ${user} proposed changing Star Limit to ${min.toFixed(1)}★ - ${max.toFixed(1)}★. Type ".vote yes" or ".vote no" to vote! (${req}/${total} votes required | Current: 1/${total})`,
    voteNoActive: "YUE 24/7: There is currently no active vote in this room!",
    votePromptOptions: "YUE 24/7: Please vote using .vote yes or .vote no!",
    votePassed: (min, max) => `YUE 24/7: 🎉 VOTE PASSED (>50%)! Room Star Limit updated to: ${min.toFixed(1)}★ - ${max.toFixed(1)}★! (Room renamed)`,
    voteProgress: (user, actionStr, yesCount, req, total) => `YUE 24/7: ${user} voted ${actionStr}. Vote progress: ${yesCount}/${req} votes needed (Total players: ${total}).`,
    roomInfo: (host, min, max, activeCount) => `YUE 24/7 ROOM INFO: Host: ${host} | Star Limit: ${min.toFixed(1)}★ - ${max.toFixed(1)}★ | Players: ${activeCount}/16 | Auto Start: On`,
    yuePrompt: (user) => `YUE: Need something ${user}? Type ".yue <question>" to chat!`,
    yueError: "YUE: Unable to process that right now...",

    // --- PLAYER COMMANDS (.rs / .tm) ---
    rsNoScore: (user) => `YUE: No recent play found for ${user}!`,
    rsError: (user) => `YUE: Failed to fetch recent play for ${user}!`,

    // --- HOST & AUTOHOST COMMANDS ---
    queueEmpty: "Queue is empty",
    queueMore: (visible, count) => `${visible} , ... (+${count} players)`,
    ahOn: "YUE: Autohost is now ON!",
    ahOff: "YUE: Autohost is now OFF!",
    ahAlreadyOn: "YUE: Autohost is already enabled!",
    ahAlreadyOff: "YUE: Autohost is already disabled!",
    nextNoHost: "YUE: Queue is empty or no next player available!",
    nextSuccess: (user) => `YUE: Transferred Host to ${user}!`,
    skipVoteStarted: (user, current, req) => `YUE: ${user} voted to skip! (${current}/${req} votes)`,
    skipVotePassed: "YUE: Skip vote passed! Rotating Host...",
    queueList: (qText) => `YUE Autohost Queue: ${qText}`,
    hostNoPerm: "YUE: Only Ref/Admin or current Host can use this command!",

    // --- BANCHO SERVICE ---
    matchFinishedRotating: "YUE: Match finished! Rotating Host to the next player...",

    // --- HELP COMMAND ---
    helpLines: [
        "YUE HELP (1/4) - MAP: .rnd [stars] [mins] [status] | .a [user] | .dl (Link) | .abort | .time <sec>",
        "YUE HELP (2/4) - HOST: .host <user> | .ah (On) | .ahoff (Off) | .next / .skip | .q (Queue)",
        "YUE HELP (3/4) - PLAYER & REF: .rs/.rc/.rm/.rt [user] (Recent) | .me [user] (Standing) | .tm (Top Multi) | .addref <user> | .refs",
        "YUE HELP (4/4) - AI & PM: .yue <question> | PM bot (/np, .r, .rec) | Guide: [https://github.com/faith01628/Yue GitHub]"
    ],
    helpLines247: [
        "YUE HELP 24/7 (1/3) - MAP: .rnd [stars] [mins] [status] | .a [user] | .dl (Link) | .abort | .time <sec>",
        "YUE HELP 24/7 (2/3) - HOST & PLAYER: .host <user> | .next/.skip | .q | .rs/.rc/.rm/.rt [user] | .me [user] | .tm",
        "YUE HELP 24/7 (3/3) - AI & PM: .yue <question> | PM (/np, .r, .rec) | Guide: [https://github.com/faith01628/Yue GitHub]"
    ],

    // --- PM ASSISTANT ---
    pm: {
        help: "PM Cmds: /np (map PP) | .r/.rs/.rc/.rm/.rt (recent) | .rec [stars] (map rec) | .map/.dl | .me/.tm | .yue <msg> | Guide: [https://github.com/faith01628/Yue GitHub]",
        noLastMap: "Please send /np on a beatmap first before using .map or .dl!",
        yueEmpty: (user) => `Hi ${user}, send ".yue <message>" anytime to chat with me!`,
        autoGreet: (user) => `Hi ${user}, Yue assistant is replying for now! Try /np for map PP, .r for recent, .rec for map rec, or .yue <msg> to chat. Type .help or check [https://github.com/faith01628/Yue GitHub] for full usage details!`,
        aiFallback: (user) => `Hi ${user}, I couldn't process that right now, please try again later!`,
        aiError: (user) => `Sorry ${user}, Yue is a bit busy right now, please try again shortly!`,
        abusiveRefusal: "Sorry, I must decline to respond to offensive, profane, or abusive messages.",
        spamWarning: "You are sending messages too fast! Please wait a few minutes before trying again.",
        recommendNotFound: (starsLabel) => `YUE: No matching beatmap found (${starsLabel || 'random'}), try another star rating!`
    },

    // --- PLAYER COMMANDS (EXTENDED) ---
    player: {
        tmEmpty: "YUE: No daily leaderboard records yet today in 24/7 rooms."
    },

    // --- STANDING (.me IRC) ---
    standing: {
        noData: (name) => `YUE: ${name} | No 24/7 lobby records in the last 30 days. Join and play to get on the leaderboard!`,
        renameTag: (oldName) => ` (Prev: ${oldName})`,
        prevMonth: (rank, medal, pp) => `Last month: #${rank} ${medal}(${pp}pp)`,
        onlyPrevMonth: (userLink, prevMonthPart, month) => `YUE: ${userLink} | Today: Not played | Week: -- | Month: -- | 🎖️ ${prevMonthPart} | Top ranked in ${month}!`,
        todayNotPlayed: "Today: Not played",
        todayRanked: (rank, pp, mapInfo) => `Today: #${rank} (${pp}pp${mapInfo})`,
        weekRanked: (rank, pp) => `Week: #${rank} (${pp}pp)`,
        weekEmpty: "Week: --",
        monthRanked: (rank, pp) => `Month: #${rank} (${pp}pp)`,
        monthEmpty: "Month: --",
        firstDay: "First day playing!",
        pastSingle: (rank, d, m, pp) => `Peak #${rank} on ${d}/${m} (${pp}pp)`,
        pastList: (list) => `Previously ${list}`,
        medalsInDays: (medalsStr, totalDays) => `🏆 ${medalsStr} in ${totalDays}d`,
        playedDaysBest: (totalDays, bestRank, bestPp) => `Played ${totalDays}d (Best: #${bestRank} ${bestPp}pp)`
    }
};
