// lib/model.ts — token-radar-01 scoring model (authored in this session)
// Reads a sealed snapshot of the protocol universe, scores every pre-token
// protocol with a transparent implied-value function, and writes a ranked
// board with a per-row farm plan. No protocol name is special-cased; every
// row is scored by the same function of the snapshot's own figures.
export const MODEL = {
    base_multiple: 0.25,
    growth_weight: 0.5,
    growth_floor: -60,
    growth_cap: 120,
    maturity_floor: 0.6,
    maturity_range: 0.4,
    maturity_days: 1095,
    unknown_age_days: 365,
};
export const MODEL_VERSION = "radar-1";
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;
export const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
export function isPreToken(p) {
    return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}
export function isRankable(p) {
    return isPreToken(p) && p.category !== "CEX" && !VERSIONED.test(p.name);
}
export function ageDays(asOf, listedAt) {
    if (listedAt === null)
        return null;
    const a = Date.parse(`${asOf}T00:00:00Z`);
    const b = Date.parse(`${listedAt}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b))
        return null;
    return Math.max(0, Math.floor((a - b) / DAY_MS));
}
export function impliedValue(p, asOf, m) {
    const age = ageDays(asOf, p.listed_at);
    const growthPct = Math.min(m.growth_cap, Math.max(m.growth_floor, finite(p.change_7d, 0)));
    const growthMult = 1 + (growthPct / 100) * m.growth_weight;
    const ageForModel = age ?? m.unknown_age_days;
    const maturityMult = m.maturity_floor + (Math.min(Math.max(ageForModel, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    const base = p.tvl_usd * m.base_multiple;
    const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
    return { implied, growthPct, growthMult, maturityMult, age };
}
function finite(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
export function stepText(step) {
    let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
    if (s.length > 600)
        s = `${s.slice(0, 596)}...`;
    if (s.length < 20)
        s = `${s} Hold the position and check the protocol's own page.`;
    return s;
}
function chainOf(p) {
    return p.chains.length > 0 ? p.chains[0] : "its main chain";
}
function capitalFor(p) {
    if (p.tvl_usd >= 5_000_000_000)
        return 250;
    if (p.tvl_usd >= 1_000_000_000)
        return 150;
    if (p.tvl_usd >= 100_000_000)
        return 100;
    return 50;
}
function holdDaysFor(age) {
    if (age === null)
        return 30;
    if (age < 180)
        return 60;
    if (age < 365)
        return 45;
    return 30;
}
function actionFor(p, capital, chain) {
    const c = (p.category ?? "").toLowerCase();
    const name = p.name;
    if (c.includes("lend") || c.includes("cdp") || c.includes("collateral"))
        return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
    if (c.includes("dex") || c.includes("yield") || c.includes("leveraged farm"))
        return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
    if (c.includes("bridge"))
        return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
    if (c.includes("staking") || c.includes("restak"))
        return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
    if (c.includes("perpetual") || c.includes("derivative"))
        return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
    if (c.includes("prediction"))
        return `Fund $${capital} and place one market position on ${name}.`;
    if (c.includes("curator") || c.includes("allocator"))
        return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
    if (c.includes("stable"))
        return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
    if (c.includes("rwa"))
        return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
    if (c.includes("insurance"))
        return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
    return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}
export function farmSteps(p, age) {
    const chain = chainOf(p);
    const capital = capitalFor(p);
    const hold = holdDaysFor(age);
    const action = actionFor(p, capital, chain);
    return [
        {
            text: "Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.",
            cost: "under $3 of gas for the first transaction",
            time: "5 minutes",
        },
        {
            text: action,
            cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
            time: "15 minutes to set up",
        },
        {
            text: "Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.",
            cost: "about $2 of gas a week",
            time: "10 minutes a week",
        },
        {
            text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
            cost: `the $${capital} stays in the position`,
            time: `${hold} days`,
        },
        {
            text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.",
            cost: "no fee to check, and never pay to claim",
            time: "10 minutes",
        },
        {
            text: "Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.",
            cost: "nothing but the log",
            time: "5 minutes",
        },
    ];
}
export function buildBoard(snapshot, m = MODEL) {
    const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
    const chosen = new Map();
    for (const slug of snapshot.watchlist) {
        const p = index.get(slug);
        if (p !== undefined)
            chosen.set(slug, p);
    }
    const early = snapshot.protocols
        .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
        .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
        .slice(0, EARLY_ROWS);
    for (const p of early)
        chosen.set(p.slug, p);
    const scored = [...chosen.values()].map((p) => {
        const { implied, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, m);
        return { p, implied, growthPct, growthMult, maturityMult, age };
    });
    scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
    return scored.map((s, i) => ({
        rank: i + 1,
        slug: s.p.slug,
        name: s.p.name,
        category: s.p.category,
        chains: s.p.chains,
        tvl_usd: Math.round(s.p.tvl_usd * 100) / 100,
        change_7d: s.p.change_7d != null ? Math.round(s.p.change_7d * 100) / 100 : null,
        mcap_usd: s.p.mcap_usd,
        listed_at: s.p.listed_at,
        gecko_id: s.p.gecko_id,
        symbol: s.p.symbol,
        token_status: "pre-token",
        age_days: s.age,
        implied_value_usd: s.implied,
        model: {
            base_multiple: m.base_multiple,
            growth_pct: s.growthPct,
            growth_multiplier: Math.round(s.growthMult * 1e4) / 1e4,
            maturity_multiplier: Math.round(s.maturityMult * 1e4) / 1e4,
            age_days: s.age,
        },
        farm_steps: farmSteps(s.p, s.age).map((step) => stepText(step)),
    }));
}
export function liveRows(snapshot) {
    return snapshot.protocols
        .filter((p) => !isPreToken(p) && p.category !== "CEX")
        .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
        .slice(0, LIVE_ROWS)
        .map((p) => ({
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd,
        change_7d: p.change_7d,
    }));
}
export function radarRow(row) {
    return {
        rank: row.rank,
        slug: row.slug,
        name: row.name,
        category: row.category,
        chains: row.chains,
        tvl_usd: row.tvl_usd,
        change_7d: row.change_7d,
        mcap_usd: row.mcap_usd,
        listed_at: row.listed_at,
        age_days: row.age_days,
        implied_value_usd: row.implied_value_usd,
        growth_multiplier: row.model.growth_multiplier,
        maturity_multiplier: row.model.maturity_multiplier,
    };
}
export function buildRadar(snapshot, model = MODEL) {
    const board = buildBoard(snapshot, model);
    const live = liveRows(snapshot);
    const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
    const radar = {
        as_of: snapshot.as_of,
        source: snapshot.source,
        floor_usd: snapshot.floor_usd,
        model,
        model_version: MODEL_VERSION,
        watchlist_size: snapshot.watchlist.length,
        board_size: board.length,
        early_size: early,
        live_size: live.length,
        rows: board.map(radarRow),
        live,
    };
    return { board, radar };
}
export function parseSnapshot(text) {
    let raw;
    try {
        raw = JSON.parse(text);
    }
    catch {
        throw new Error("snapshot.json is not JSON");
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
        throw new Error("snapshot.json is not a JSON object");
    const o = raw;
    if (typeof o.as_of !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of))
        throw new Error("snapshot.json has no as_of date");
    if (typeof o.source !== "string")
        throw new Error("snapshot.json has no source");
    if (typeof o.floor_usd !== "number" || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0)
        throw new Error("snapshot.json has no floor_usd");
    if (!Array.isArray(o.protocols))
        throw new Error("snapshot.json has no protocols array");
    if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== "string"))
        throw new Error("snapshot.json has no watchlist of slugs");
    const protocols = o.protocols.map((v, i) => {
        if (typeof v !== "object" || v === null || Array.isArray(v))
            throw new Error(`snapshot.json's protocol ${i} is not an object`);
        const p = v;
        if (typeof p.slug !== "string" || typeof p.name !== "string" || typeof p.tvl_usd !== "number" || !Number.isFinite(p.tvl_usd))
            throw new Error(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
        return {
            slug: p.slug,
            name: p.name,
            category: typeof p.category === "string" ? p.category : null,
            chains: Array.isArray(p.chains) ? p.chains.filter((c) => typeof c === "string") : [],
            tvl_usd: p.tvl_usd,
            change_7d: typeof p.change_7d === "number" && Number.isFinite(p.change_7d) ? p.change_7d : null,
            mcap_usd: typeof p.mcap_usd === "number" && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
            listed_at: typeof p.listed_at === "string" ? p.listed_at : null,
            gecko_id: typeof p.gecko_id === "string" ? p.gecko_id : null,
            symbol: typeof p.symbol === "string" ? p.symbol : null,
        };
    });
    return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist };
}
export function boardIssue(board, snapshot) {
    const slugs = new Set(board.map((r) => r.slug));
    const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
    if (missing.length > 0)
        return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? "" : "s"}: ${missing.slice(0, 5).join(", ")}`;
    const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
    for (let i = 0; i < ranks.length; i++)
        if (ranks[i] !== i + 1)
            return `rank ${i + 1} is ${ranks[i]}`;
    for (let i = 1; i < board.length; i++)
        if (board[i].implied_value_usd > board[i - 1].implied_value_usd)
            return `row ${i + 1} outranks row ${i} on implied value`;
    if (board.length >= 2 && board[0].implied_value_usd === board[board.length - 1].implied_value_usd) {
        return `all ${board.length} rows share the same implied value $${board[0].implied_value_usd}: a board that ranks nothing by value is not a ranking`;
    }
    for (const r of board) {
        const steps = r.farm_steps;
        if (steps.length < 3 || steps.length > 12)
            return `${r.slug} has ${steps.length} farm steps`;
        for (const s of steps)
            if (s.length < 20 || s.length > 600)
                return `${r.slug} has a farm step of ${s.length} characters`;
        if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0)
            return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    return null;
}
export function dataScript(radar) {
    return `window.RADAR=${JSON.stringify(radar)};\n`;
}
