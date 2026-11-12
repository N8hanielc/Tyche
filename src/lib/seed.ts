import type { Challenge, DB, Entry, Message, Notification, User } from "./types";
import { HOUR, MIN, buildExact, buildOverUnder, computePayouts } from "./utils";

const av = (n: number) => `https://i.pravatar.cc/240?img=${n}`;

function user(id: string, username: string, name: string, img: number, hue: number, extra: Partial<User> = {}): User {
  return {
    id, username, name, avatar: av(img), hue,
    followers: 120, following: 140, baseWins: 8, baseLosses: 6, points: 1000, ...extra,
  };
}

export const ME = "u_nate";

export function seed(): DB {
  const T = Date.now();
  const users: User[] = [
    user(ME, "n8haniel", "Nate", 12, 268, {
      bio: "If you can disagree about it, I’ll put it on Tyche. ATL ✈️ DC",
      followers: 482, following: 311, baseWins: 23, baseLosses: 14, points: 1250,
      badges: ["early", "streak", "host", "road"],
    }),
    user("u_marcus", "marcus.eats", "Marcus Bell", 13, 20, { bio: "Undefeated at buffets. Questionable at Spades.", followers: 903, following: 220, baseWins: 31, baseLosses: 29 }),
    user("u_jordan", "jordyy", "Jordan Ellis", 33, 190, { bio: "UNDER merchant. Always.", followers: 611, following: 402, baseWins: 27, baseLosses: 18 }),
    user("u_mya", "myamyamya", "Mya Thompson", 45, 320, { bio: "Spades queen 👑 brunch organizer", followers: 1204, following: 380, baseWins: 35, baseLosses: 16 }),
    user("u_chris", "chris.ok", "Chris Okafor", 59, 150, { bio: "no cap.", followers: 388, following: 295, baseWins: 14, baseLosses: 21 }),
    user("u_dani", "danirae", "Dani Rae", 47, 0, { bio: "Professional over-thinker. Amateur predictor.", followers: 540, following: 512 }),
    user("u_kev", "kevonthego", "Kevin Park", 68, 45, { bio: "Road trip DJ. Bad at directions.", followers: 276, following: 260 }),
    user("u_hoops", "hoopsoracle", "Hoops Oracle", 14, 30, { bio: "Daily NBA lines. Points only, vibes always.", followers: 18400, following: 90, baseWins: 212, baseLosses: 160 }),
    user("u_sol", "djsol", "DJ Sol", 15, 290, { bio: "Resident @ Ember ATL. Requests go through Tyche now.", followers: 7300, following: 410 }),
    user("u_tess", "tessreviews", "Tess Morgan", 44, 340, { bio: "Finales, ratings, and hot takes.", followers: 5200, following: 610 }),
    user("u_tariq", "tariqtravels", "Tariq Hassan", 52, 210, { bio: "200 flights a year. Betting on all of them.", followers: 9100, following: 330 }),
  ];
  const crowdNames = [
    ["kayla.b", "Kayla B", 9], ["andre_3", "Andre", 11], ["sofiaxo", "Sofia", 16], ["bigmike", "Mike", 53], ["lena.k", "Lena", 20],
    ["t.wright", "Tasha", 23], ["omar.j", "Omar", 51], ["prii", "Priya", 25], ["jaylen23", "Jaylen", 60], ["rosie", "Rosie", 32],
    ["deshawn", "Deshawn", 3], ["camille", "Camille", 49], ["nico.v", "Nico", 8], ["amaraa", "Amara", 5], ["benji", "Ben", 57], ["zoe.m", "Zoe", 29],
  ] as const;
  crowdNames.forEach(([u, n, img], i) => users.push(user(`c${i + 1}`, u, n, img, (i * 37) % 360, { followers: 40 + i * 13, following: 80 })));

  const db: DB = {
    version: 2,
    meId: ME,
    users: Object.fromEntries(users.map((u) => [u.id, u])),
    following: ["u_marcus", "u_jordan", "u_mya", "u_chris", "u_dani", "u_kev", "u_hoops", "u_sol"],
    challenges: [],
    messages: [],
    notifications: [],
    groups: [
      { id: "g_squad", ownerId: ME, name: "The Squad", emoji: "🃏", memberIds: [ME, "u_marcus", "u_jordan", "u_mya", "u_chris", "u_dani", "u_kev"], createdAt: T - 40 * 24 * HOUR },
      { id: "g_brunch", ownerId: ME, name: "Brunch Club", emoji: "🥂", memberIds: [ME, "u_mya", "u_dani", "u_chris"], createdAt: T - 12 * 24 * HOUR },
    ],
    lastRead: {},
  };

  const E = (userId: string, optionId: string, points: number, minsAgo: number): Entry => ({ userId, optionId, points, at: T - minsAgo * MIN });

  const base = {
    stakeMode: "even" as const, tieRule: "refund" as const, verifier: "group" as const, status: "open" as const,
    likes: [] as string[], shares: 0, resolution: "Creator submits, group confirms.",
  };
  const likes = (n: number) => ["u_marcus", "u_jordan", "u_mya", "u_chris", "u_dani", "u_kev", ...users.filter((u) => u.id.startsWith("c")).map((u) => u.id)].slice(0, n);

  const C: Challenge[] = [
    {
      ...base, id: "ch_roadtrip", creatorId: ME, createdAt: T - 42 * MIN, category: "Road Trip",
      question: "How long will it take us to drive from ATL to DC?", title: "ATL → DC Road Trip",
      description: "Leaving from my place at 10. Google says 9h 36m. Google has never met Kevin’s bladder.",
      format: "over_under", line: 576, unit: "time", options: buildOverUnder(576, "time"),
      entries: [
        E(ME, "over", 50, 42), E("u_marcus", "over", 25, 38), E("u_jordan", "under", 25, 37), E("u_chris", "over", 20, 30),
        E("u_mya", "under", 30, 28), E("u_kev", "over", 15, 22), E("u_dani", "under", 20, 18), E("c1", "over", 10, 15),
        E("c2", "over", 15, 12), E("c4", "under", 15, 10), E("c3", "over", 10, 8), E("c5", "under", 20, 5),
      ],
      visibility: "group", groupId: "g_squad", closesAt: T + 2 * HOUR + 14 * MIN, startsAt: T + 2 * HOUR + 30 * MIN,
      resolution: "Timer starts when we pull out of Nate’s driveway and stops in the DC hotel garage.",
      likes: likes(9), shares: 4,
    },
    {
      ...base, id: "ch_spades", creatorId: "u_mya", createdAt: T - 2 * HOUR, category: "Game Night",
      question: "Which team will win Spades?", title: "Spades: Game Night",
      description: "First to 500. Renege = automatic loss, don’t try it Chris.",
      format: "pick_one", options: [{ id: "t1", label: "Nate & Mya" }, { id: "t2", label: "Chris & Jordan" }],
      entries: [E(ME, "t1", 40, 110), E("u_mya", "t1", 40, 118), E("u_chris", "t2", 40, 100), E("u_jordan", "t2", 40, 95), E("u_marcus", "t2", 20, 80), E("u_dani", "t1", 15, 70)],
      visibility: "group", groupId: "g_squad", closesAt: T - 40 * MIN, status: "live", live: { startedAt: T - 38 * MIN },
      likes: likes(6), shares: 1,
    },
    {
      ...base, id: "ch_plates", creatorId: "u_jordan", createdAt: T - 25 * MIN, category: "Dinner",
      question: "How many plates will Marcus eat?", title: "Marcus vs. The Buffet",
      description: "Golden Corral, Saturday. Desserts count as half a plate.",
      format: "over_under", line: 3.5, unit: "plates", options: buildOverUnder(3.5, "plates"),
      entries: [E("u_jordan", "over", 30, 25), E("u_chris", "over", 20, 20), E("u_mya", "under", 15, 18), E("u_marcus", "under", 50, 15), E("u_kev", "over", 10, 9), E("u_dani", "over", 20, 4)],
      visibility: "friends", closesAt: T + 52 * MIN, likes: likes(11), shares: 3,
    },
    {
      ...base, id: "ch_drunkest", creatorId: "u_chris", createdAt: T - 70 * MIN, category: "Night Out",
      question: "Who will be the drunkest tonight?", title: "Night Out Superlative",
      format: "pick_one", options: ([["Marcus", "u_marcus"], ["Jordan", "u_jordan"], ["Nate", ME], ["Chris", "u_chris"]] as const).map(([l, u], i) => ({ id: `p${i}`, label: l, subjects: [u] })),
      entries: [E("u_chris", "p0", 25, 70), E("u_jordan", "p0", 20, 60), E("u_mya", "p3", 25, 55), E("u_kev", "p1", 10, 40), E("u_dani", "p0", 15, 33), E("u_marcus", "p3", 30, 20), E(ME, "p1", 50, 62)],
      verifier: "vote", resolution: "Everyone votes at the end of the night. Most votes wins. You can’t bet or vote on yourself.", tieRule: "rematch", visibility: "friends", closesAt: T - 50 * MIN, lockedAt: T - 50 * MIN,
      status: "live", live: { startedAt: T - 48 * MIN }, likes: likes(14), shares: 2,
    },
    {
      ...base, id: "ch_club", creatorId: "u_marcus", createdAt: T - 3 * HOUR, category: "Nightlife",
      question: "Will everyone make it to the club tonight?", format: "yes_no",
      options: [{ id: "yes", label: "YES" }, { id: "no", label: "NO" }], stakeMode: "bragging", forfeit: "Whoever’s wrong buys the first round 🍻",
      entries: [E("u_marcus", "yes", 0, 180), E("u_jordan", "no", 0, 170), E("u_chris", "no", 0, 150), E("u_mya", "yes", 0, 120), E("u_kev", "no", 0, 90)],
      visibility: "friends", closesAt: T + 4 * HOUR, likes: likes(5),
    },
    {
      ...base, id: "ch_steph", creatorId: "u_hoops", createdAt: T - 95 * MIN, category: "Sports",
      question: "How many three-pointers will Steph Curry make tonight?", title: "Steph 3PM line",
      format: "over_under", line: 4.5, unit: "threes", options: buildOverUnder(4.5, "threes"),
      entries: Array.from({ length: 16 }, (_, i) => E(`c${i + 1}`, i % 5 === 1 || i % 3 === 2 ? "under" : "over", [10, 25, 50, 20, 15, 40][i % 6], 90 - i * 5)).concat([E("u_marcus", "over", 30, 12)]),
      verifier: "source", resolution: "Official NBA box score.", visibility: "public", closesAt: T + 5 * HOUR, likes: likes(22), shares: 31,
    },
    {
      ...base, id: "ch_food", creatorId: "u_dani", createdAt: T - 12 * MIN, category: "Dinner",
      question: "Will the food arrive before 8:30 PM?", format: "yes_no",
      options: [{ id: "yes", label: "YES" }, { id: "no", label: "NO" }], stakeMode: "odds", odds: { yes: 2.4, no: 1.5 },
      description: "Ordered at 7:52. App says 25–35 min. The app lies.",
      entries: [E("u_dani", "no", 20, 12), E("u_mya", "yes", 10, 9), E("u_chris", "no", 25, 6)],
      visibility: "group", groupId: "g_brunch", closesAt: T + 18 * MIN, verifier: "creator", likes: likes(3),
    },
    {
      ...base, id: "ch_last", creatorId: "u_kev", createdAt: T - 4 * HOUR, category: "Night Out",
      question: "Who will be the last person to arrive?", format: "pick_one",
      options: ([["Marcus", "u_marcus"], ["Jordan", "u_jordan"], ["Chris", "u_chris"], ["Mya", "u_mya"]] as const).map(([l, u], i) => ({ id: `l${i}`, label: l, subjects: [u] })),
      entries: [E("u_kev", "l2", 20, 230), E(ME, "l2", 30, 200), E("u_mya", "l1", 15, 160), E("u_dani", "l2", 10, 120), E("u_jordan", "l0", 20, 60)],
      visibility: "friends", closesAt: T + 90 * MIN, likes: likes(7),
    },
    {
      ...base, id: "ch_nocap", creatorId: "u_mya", createdAt: T - 5 * HOUR, category: "Custom",
      question: "How many times will Chris say “no cap” at brunch?", format: "exact", options: buildExact(0, 6),
      entries: [E("u_mya", "n4", 15, 290), E("u_dani", "n6", 20, 250), E("u_jordan", "n3", 10, 200), E("u_chris", "n0", 25, 100)],
      visibility: "group", groupId: "g_brunch", closesAt: T + 20 * HOUR, likes: likes(12), shares: 2,
    },
    {
      ...base, id: "ch_dj", creatorId: "u_sol", createdAt: T - 6 * HOUR, category: "Music",
      question: "Will I play “Before I Let Go” before midnight?", title: "Ember ATL — Saturday set",
      format: "yes_no", options: [{ id: "yes", label: "YES" }, { id: "no", label: "NO" }],
      entries: Array.from({ length: 11 }, (_, i) => E(`c${i + 4}`, i % 3 === 0 ? "no" : "yes", [15, 20, 10, 30][i % 4], 300 - i * 20)),
      verifier: "creator", visibility: "public", closesAt: T + 7 * HOUR, likes: likes(18), shares: 12,
    },
    {
      ...base, id: "ch_finale", creatorId: "u_tess", createdAt: T - 8 * HOUR, category: "Entertainment",
      question: "Will Sunday’s finale score above 9.0 on IMDb?", format: "yes_no",
      options: [{ id: "yes", label: "YES" }, { id: "no", label: "NO" }],
      entries: Array.from({ length: 9 }, (_, i) => E(`c${i + 2}`, i % 2 ? "no" : "yes", [20, 15, 25][i % 3], 400 - i * 30)),
      verifier: "source", resolution: "IMDb episode rating 48 hours after airing.", visibility: "public", closesAt: T + 2 * 24 * HOUR, likes: likes(9), shares: 6,
    },
    {
      ...base, id: "ch_flight", creatorId: "u_tariq", createdAt: T - 3 * HOUR, category: "Travel",
      question: "Will our JFK → LAX flight land early?", format: "yes_no",
      options: [{ id: "yes", label: "YES" }, { id: "no", label: "NO" }],
      entries: Array.from({ length: 8 }, (_, i) => E(`c${i + 8}`, i % 3 ? "yes" : "no", [10, 25, 15][i % 3], 170 - i * 10)),
      verifier: "source", resolution: "Gate arrival time vs. scheduled 1:42 PM PT.", visibility: "public", closesAt: T - 70 * MIN,
      status: "live", live: { startedAt: T - 65 * MIN }, likes: likes(6), shares: 3,
    },
    {
      ...base, id: "ch_kart", creatorId: "u_jordan", createdAt: T - 3 * 24 * HOUR, category: "Game Night",
      question: "Who wins the Mario Kart tournament?", format: "pick_one",
      options: ["Nate", "Jordan", "Marcus", "Chris"].map((l, i) => ({ id: `k${i}`, label: l })),
      entries: [E(ME, "k0", 60, 4300), E("u_jordan", "k1", 50, 4310), E("u_marcus", "k1", 25, 4290), E("u_chris", "k3", 30, 4280), E("u_mya", "k0", 20, 4270)],
      visibility: "group", groupId: "g_squad", closesAt: T - 71 * HOUR, status: "settled", live: { startedAt: T - 71 * HOUR, endedAt: T - 70 * HOUR },
      likes: likes(10), shares: 2,
    },
    {
      ...base, id: "ch_wings", creatorId: "u_chris", createdAt: T - 6 * 24 * HOUR, category: "Dinner",
      question: "Will Chris actually finish the 5-alarm wings?", format: "yes_no",
      options: [{ id: "yes", label: "YES" }, { id: "no", label: "NO" }],
      entries: [E(ME, "yes", 40, 8600), E("u_chris", "yes", 30, 8610), E("u_marcus", "no", 35, 8590), E("u_jordan", "no", 25, 8580)],
      visibility: "friends", closesAt: T - 143 * HOUR, status: "settled", live: { startedAt: T - 143 * HOUR, endedAt: T - 142 * HOUR },
      likes: likes(15), shares: 5,
    },
  ];

  // settle the historical ones
  const settle = (c: Challenge, optionId: string, at: number) => {
    c.result = { optionId, submittedBy: c.creatorId, submittedAt: at, confirmations: c.entries.slice(0, 3).map((e) => e.userId), disputes: [], settledAt: at + 20 * MIN };
    c.result.payouts = computePayouts(c, optionId);
  };
  settle(C.find((c) => c.id === "ch_kart")!, "k0", T - 70 * HOUR);
  settle(C.find((c) => c.id === "ch_wings")!, "no", T - 142 * HOUR);
  db.challenges = C;

  // ---------- Messages ----------
  const msgs: Message[] = [];
  const chat = (challengeId: string, userId: string, text: string, minsAgo: number, extra: Partial<Message> = {}) =>
    msgs.push({ id: `m_${msgs.length}`, challengeId, kind: "chat", userId, text, at: T - minsAgo * MIN, reactions: {}, ...extra });
  const sys = (challengeId: string, icon: string, text: string, minsAgo: number) =>
    msgs.push({ id: `m_${msgs.length}`, challengeId, kind: "system", icon, text, at: T - minsAgo * MIN, reactions: {} });

  sys("ch_roadtrip", "✨", "Nate created the challenge · Line set at 9h 36m", 42);
  sys("ch_roadtrip", "🟣", "Nate joined OVER with 50 points", 42);
  sys("ch_roadtrip", "🟣", "Marcus joined OVER with 25 points", 38);
  sys("ch_roadtrip", "🔵", "Jordan joined UNDER with 25 points", 37);
  chat("ch_roadtrip", "u_jordan", "Nate we’re definitely getting there before 9:36 😂", 36, { reactions: { "😂": ["u_mya", "u_dani"] } });
  chat("ch_roadtrip", ME, "Wait until we hit Virginia traffic.", 35, { reactions: { "💯": ["u_marcus", "u_chris"], "🔥": ["u_kev"] } });
  sys("ch_roadtrip", "🔵", "Mya joined UNDER with 30 points", 28);
  chat("ch_roadtrip", "u_marcus", "OVER looking real good right now.", 27);
  chat("ch_roadtrip", "u_jordan", "nahhhh 💀", 26, { replyTo: "m_7" });
  sys("ch_roadtrip", "❤️", "Chris reacted to Nate’s prediction", 24);
  chat("ch_roadtrip", "u_kev", "I’m on aux. That’s at least 20 extra minutes of Waffle House stops", 21, { reactions: { "😂": ["u_marcus", ME, "u_chris"] } });
  chat("ch_roadtrip", "u_mya", "We are NOT stopping at every Waffle House Kevin", 19);
  sys("ch_roadtrip", "🔵", "Dani joined UNDER with 20 points", 18);
  chat("ch_roadtrip", "u_dani", "Leaving at 10 sharp or I’m switching to OVER", 16);
  chat("ch_roadtrip", "u_chris", "Nate driving or Marcus? that changes everything", 9);

  sys("ch_spades", "✨", "Mya created the challenge", 120);
  chat("ch_spades", "u_chris", "Y’all already lost and we haven’t dealt", 100);
  chat("ch_spades", "u_mya", "Say less. Deal the cards.", 98, { reactions: { "👑": [ME, "u_dani"] } });
  sys("ch_spades", "🔒", "Challenge locked · 6 participants · 195 pts in the pool", 40);
  sys("ch_spades", "▶️", "Event started", 38);
  sys("ch_spades", "🃏", "Score update: Nate & Mya 210 · Chris & Jordan 160", 14);
  chat("ch_spades", "u_jordan", "that last book was robbery", 12);
  chat("ch_spades", ME, "Bags on bags. Keep it up Jordan 😭", 11, { reactions: { "😂": ["u_mya", "u_marcus"] } });
  chat("ch_spades", "u_marcus", "I put 20 on Chris & Jordan and I’m regretting it already", 6);

  sys("ch_plates", "✨", "Jordan created the challenge · Line set at 3.5 plates", 25);
  chat("ch_plates", "u_marcus", "Y’all underestimating me. I took UNDER to throw you off.", 14);
  chat("ch_plates", "u_jordan", "He’s sandbagging. Hammer the OVER.", 13, { reactions: { "💯": ["u_chris", "u_kev"] } });
  chat("ch_plates", "u_mya", "Does a dessert plate count as a full plate? Need a ruling", 8);
  chat("ch_plates", "u_jordan", "Half. It’s in the description. Read 🙄", 7);

  sys("ch_drunkest", "✨", "Chris created the challenge", 70);
  sys("ch_drunkest", "🔒", "Challenge locked · 7 participants · 175 pts in the pool", 48);
  sys("ch_drunkest", "▶️", "Event started — the night is on", 48);
  chat("ch_drunkest", "u_marcus", "Voting myself out of this one. I’m DD.", 30);
  chat("ch_drunkest", "u_chris", "That’s what you said last time 😭", 28, { reactions: { "😂": ["u_jordan", "u_mya", "u_dani", ME] } });

  sys("ch_food", "✨", "Dani created the challenge · Custom odds YES 2.4x / NO 1.5x", 12);
  chat("ch_food", "u_dani", "Driver has been ‘arriving in 3 min’ for 9 minutes", 4);

  sys("ch_nocap", "✨", "Mya created the challenge", 300);
  chat("ch_nocap", "u_chris", "I’m taking 0. I can control myself.", 100);
  chat("ch_nocap", "u_mya", "no cap?", 99, { reactions: { "💀": ["u_dani", "u_jordan", ME] } });

  sys("ch_steph", "✨", "Hoops Oracle posted the line · 4.5 threes", 95);
  chat("ch_steph", "c2", "He’s 9 for his last 20 from deep. OVER all day.", 60);
  chat("ch_steph", "u_marcus", "Back-to-back though. Legs gonna be dead", 12);

  sys("ch_flight", "✈️", "Wheels up — 10:12 AM ET", 65);
  sys("ch_flight", "📍", "Over Kansas · tailwind 60 mph", 15);
  chat("ch_flight", "c9", "Tailwind is doing the lord’s work", 13);

  sys("ch_dj", "✨", "DJ Sol created the challenge", 360);
  chat("ch_dj", "c6", "If you play it before midnight I’m losing my mind (and my points)", 200);

  sys("ch_last", "✨", "Kevin created the challenge", 240);
  chat("ch_last", "u_chris", "Why is everyone picking me 😐", 190);
  chat("ch_last", "u_mya", "History, Chris. History.", 188, { reactions: { "😂": [ME, "u_kev"] } });

  sys("ch_kart", "🏁", "Result submitted: Nate", 4200);
  sys("ch_kart", "✅", "Result confirmed by Jordan, Marcus, Chris", 4180);
  sys("ch_kart", "🏆", "Winner announced: Nate · 185 pts paid out", 4180);
  chat("ch_kart", "u_jordan", "Blue shell on the final lap. I want a rematch.", 4170);

  sys("ch_wings", "🏁", "Result submitted: NO", 8500);
  sys("ch_wings", "🏆", "Winner announced: NO · Marcus & Jordan split 130 pts", 8490);
  chat("ch_wings", "u_chris", "my soul left my body at wing 7", 8480);

  db.messages = msgs;

  const N = (kind: Notification["kind"], text: string, minsAgo: number, actorId?: string, challengeId?: string, read = false): Notification => ({
    id: `n_${kind}_${minsAgo}`, kind, text, at: T - minsAgo * MIN, actorId, challengeId, read,
  });
  db.notifications = [
    N("joined", "joined UNDER on ATL → DC Road Trip with 20 pts", 5, "c5", "ch_roadtrip"),
    N("reply", "replied: “Nate driving or Marcus? that changes everything”", 9, "u_chris", "ch_roadtrip"),
    N("closing", "Will the food arrive before 8:30 PM? closes in 18 minutes", 11, "u_dani", "ch_food"),
    N("created", "created a new challenge: How many plates will Marcus eat?", 25, "u_jordan", "ch_plates"),
    N("started", "Spades: Game Night is live", 38, "u_mya", "ch_spades", true),
    N("follow", "started following you", 180, "u_tess", undefined, true),
    N("invite", "accepted your invite to The Squad", 600, "u_kev", undefined, true),
    N("won", "You won Who wins the Mario Kart tournament? · +79 pts", 4180, undefined, "ch_kart", true),
    N("confirmed", "Result confirmed: Will Chris actually finish the 5-alarm wings?", 8490, undefined, "ch_wings", true),
  ];
  db.lastRead = { ch_kart: T, ch_wings: T, ch_spades: T - 13 * MIN, ch_plates: T - 10 * MIN, ch_roadtrip: T - 30 * MIN };
  return db;
}
