const chartRoot = d3.select("#temporal-network");
const tooltip = d3.select("#temporal-tooltip");
const statusMessage = d3.select("#network-status");
const slider = d3.select("#time-slider");
const formatDate = d3.timeFormat("%B %-d, %Y");
const formatCurrency = d3.format("$,.2f");
const sectorOrder = ["Manufacturing", "Logistics", "Retail", "Food", "Technology", "Wholesale", "Materials"];
const regionOrder = ["Asia", "North America", "Europe"];
const transactionOrder = ["goods", "shipping", "components", "materials", "services"];
const sectorColors = new Map([
    ["Manufacturing", "#73a8d4"], ["Logistics", "#ff9f80"], ["Retail", "#c7a5e8"],
    ["Food", "#e6c86e"], ["Technology", "#8bd3b5"], ["Wholesale", "#9aa5b1"], ["Materials", "#e89ac7"]
]);
const regionDash = new Map([["Asia", null], ["North America", "16,7"], ["Europe", "0,7"]]);
const transactionColors = new Map([
    ["goods", "#d84b65"], ["shipping", "#2e7d8f"], ["components", "#7b4eb2"],
    ["materials", "#cf8b2f"], ["services", "#3b8c62"]
]);

let timer = null;
let currentDay = 1;
let companies = [];
let transactions = [];
let transactionsByDay = new Map();
let companyById = new Map();
let nodeSelection;
let linkLayer;
let volumeScale;
let amountScale;
let countScale;

function tooltipPosition(event, mark) {
    const box = chartRoot.node().getBoundingClientRect();
    const markBox = mark.getBoundingClientRect();
    const x = Number.isFinite(event.clientX) ? event.clientX : markBox.left + markBox.width / 2;
    const y = Number.isFinite(event.clientY) ? event.clientY : markBox.top;
    return {left: x - box.left, top: y - box.top};
}

function showTooltip(event, mark, content) {
    const position = tooltipPosition(event, mark);
    tooltip.html(content).style("left", `${position.left}px`).style("top", `${position.top}px`).classed("visible", true);
}

function hideTooltip() { tooltip.classed("visible", false); }

function pairKey(source, target) {
    return [typeof source === "object" ? source.id : source, typeof target === "object" ? target.id : target].sort().join("|");
}

function addLegend() {
    const legend = d3.select("#temporal-legend");
    const sectorRow = legend.append("div").attr("class", "legend-row");
    sectorRow.append("strong").text("Company Sector (Node Color)");
    sectorOrder.forEach(sector => {
        const item = sectorRow.append("span").attr("class", "legend-item");
        item.append("i").attr("class", "legend-swatch").style("background", sectorColors.get(sector));
        item.append("span").text(sector);
    });
    const regionRow = legend.append("div").attr("class", "legend-row");
    regionRow.append("strong").text("Company Region (Border Pattern)");
    regionOrder.forEach(region => {
        const item = regionRow.append("span").attr("class", "legend-item");
        const sample = item.append("svg").attr("class", "region-key").attr("viewBox", "0 0 24 24").attr("aria-hidden", "true");
        sample.append("circle").attr("cx", 12).attr("cy", 12).attr("r", 8).attr("fill", "#fff").attr("stroke", "#54122f").attr("stroke-width", 3).attr("stroke-dasharray", regionDash.get(region)).attr("stroke-linecap", region === "Europe" ? "round" : "butt");
        item.append("span").text(region);
    });
    const transactionRow = legend.append("div").attr("class", "legend-row");
    transactionRow.append("strong").text("Transaction Type (Link Color)");
    transactionOrder.forEach(type => {
        const item = transactionRow.append("span").attr("class", "legend-item");
        item.append("i").attr("class", "legend-line").style("border-top-color", transactionColors.get(type));
        item.append("span").text(type[0].toUpperCase() + type.slice(1));
    });
    legend.append("div").attr("class", "legend-row legend-scale-row").html('<strong>Current Volume (Node Area)</strong><span class="temporal-node-size temporal-node-small"></span><span>Lower daily volume</span><span class="temporal-node-size temporal-node-large"></span><span>Higher daily volume</span>');
    legend.append("div").attr("class", "legend-row legend-scale-row").html('<strong>Amount (Link Width)</strong><span class="link-width-example link-thin"></span><span>Lower amount</span><span class="link-width-example link-wide"></span><span>Higher amount</span>');
    legend.append("div").attr("class", "legend-note").text("More Opaque Links = Greater Transaction Counts · Fading Marks = Relationships Entering or Leaving the Selected Day");
}

function calculateActivity(dayLinks) {
    const activity = new Map(companies.map(company => [company.id, {volume: 0, count: 0, degree: 0}]));
    dayLinks.forEach(link => {
        [link.source, link.target].forEach(endpoint => {
            const id = typeof endpoint === "object" ? endpoint.id : endpoint;
            const entry = activity.get(id);
            entry.volume += link.amount_usd;
            entry.count += link.transaction_count;
            entry.degree += 1;
        });
    });
    return activity;
}

function updateSummary(dayLinks, activity) {
    d3.select("#active-companies").text([...activity.values()].filter(value => value.degree > 0).length);
    d3.select("#active-links").text(dayLinks.length);
    d3.select("#daily-value").text(formatCurrency(d3.sum(dayLinks, link => link.amount_usd)));
    d3.select("#daily-count").text(d3.sum(dayLinks, link => link.transaction_count).toLocaleString());
}

function endpointId(endpoint) { return typeof endpoint === "object" ? endpoint.id : endpoint; }

function bindNodeInteractions(activity) {
    nodeSelection.on("pointerenter focus", function(event, company) {
        const current = activity.get(company.id);
        const neighborIds = new Set([company.id]);
        linkLayer.selectAll("line").each(link => {
            const source = endpointId(link.source), target = endpointId(link.target);
            if (source === company.id) neighborIds.add(target);
            if (target === company.id) neighborIds.add(source);
        });
        nodeSelection.classed("dimmed", node => !neighborIds.has(node.id));
        linkLayer.selectAll("line").classed("dimmed", link => endpointId(link.source) !== company.id && endpointId(link.target) !== company.id);
        showTooltip(event, this, `<strong>${company.company_name}</strong><span>Sector: ${company.sector}</span><span>Region: ${company.region}</span><span>Current volume: ${formatCurrency(current.volume)}</span><span>Active relationships: ${current.degree}</span><span>Transactions represented: ${current.count}</span>`);
    }).on("pointerleave blur", () => {
        nodeSelection.classed("dimmed", false);
        linkLayer.selectAll("line").classed("dimmed", false);
        hideTooltip();
    });
}

function bindLinkInteractions() {
    linkLayer.selectAll("line").on("pointerenter focus", function(event, link) {
        const sourceId = endpointId(link.source), targetId = endpointId(link.target);
        d3.select(this).classed("emphasized", true);
        showTooltip(event, this, `<strong>${companyById.get(sourceId).company_name} &ndash; ${companyById.get(targetId).company_name}</strong><span>Type: ${link.transaction_type[0].toUpperCase() + link.transaction_type.slice(1)}</span><span>Amount: ${formatCurrency(link.amount_usd)}</span><span>Transactions represented: ${link.transaction_count}</span><span>Date: ${formatDate(link.date)}</span>`);
    }).on("pointerleave blur", function() {
        d3.select(this).classed("emphasized", false);
        hideTooltip();
    });
}

function showDay(day, options = {}) {
    currentDay = Math.max(1, Math.min(60, day));
    const dayLinks = transactionsByDay.get(currentDay) || [];
    const activity = calculateActivity(dayLinks);
    const date = dayLinks[0]?.date || d3.timeDay.offset(new Date(2026, 0, 1), currentDay - 1);
    slider.property("value", currentDay);
    d3.select("#current-day").text(`Day ${currentDay} of 60`);
    d3.select("#current-date").text(formatDate(date));
    updateSummary(dayLinks, activity);

    nodeSelection.classed("inactive", company => activity.get(company.id).degree === 0)
        .attr("aria-label", company => {
            const current = activity.get(company.id);
            return `${company.company_name}, ${company.sector}, ${company.region}, ${formatCurrency(current.volume)} current volume, ${current.degree} active relationships`;
        });
    nodeSelection.select("circle").transition().duration(options.immediate ? 0 : 420).attr("r", company => volumeScale(activity.get(company.id).volume));
    nodeSelection.select("text").transition().duration(options.immediate ? 0 : 420).attr("y", company => -volumeScale(activity.get(company.id).volume) - 8);

    linkLayer.selectAll("line").data(dayLinks, link => pairKey(link.source, link.target)).join(
        enter => enter.append("line")
            .attr("class", "temporal-link entering")
            .attr("x1", link => companyById.get(endpointId(link.source)).x).attr("y1", link => companyById.get(endpointId(link.source)).y)
            .attr("x2", link => companyById.get(endpointId(link.target)).x).attr("y2", link => companyById.get(endpointId(link.target)).y)
            .attr("stroke", link => transactionColors.get(link.transaction_type)).attr("stroke-width", link => amountScale(link.amount_usd))
            .attr("stroke-opacity", 0).attr("tabindex", 0).attr("role", "button")
            .attr("aria-label", link => `${companyById.get(endpointId(link.source)).company_name} and ${companyById.get(endpointId(link.target)).company_name}, ${link.transaction_type}, ${formatCurrency(link.amount_usd)}, ${link.transaction_count} transactions`)
            .call(enter => enter.transition().duration(options.immediate ? 0 : 420).attr("stroke-opacity", link => countScale(link.transaction_count))),
        update => update.call(update => update.transition().duration(options.immediate ? 0 : 300)
            .attr("stroke", link => transactionColors.get(link.transaction_type)).attr("stroke-width", link => amountScale(link.amount_usd)).attr("stroke-opacity", link => countScale(link.transaction_count))),
        exit => exit.call(exit => exit.transition().duration(options.immediate ? 0 : 420).attr("stroke-opacity", 0).remove())
    );
    bindLinkInteractions();
    bindNodeInteractions(activity);
}

function play() {
    if (timer) return;
    if (currentDay >= 60) showDay(1);
    timer = d3.interval(() => {
        if (currentDay >= 60) { pause(); return; }
        showDay(currentDay + 1);
    }, 1000);
    d3.select("#play-button").attr("aria-pressed", "true");
}

function pause() {
    if (timer) { timer.stop(); timer = null; }
    d3.select("#play-button").attr("aria-pressed", "false");
}

function reset() { pause(); showDay(1); }

function initializeNetwork() {
    const width = 1180, height = 760;
    const allPairs = new Map();
    transactions.forEach(link => {
        const key = pairKey(link.source, link.target);
        if (!allPairs.has(key)) allPairs.set(key, {source: link.source, target: link.target});
    });
    const targetPositions = [
        {x: 135, y: 145}, {x: 435, y: 125}, {x: 745, y: 125}, {x: 1045, y: 145},
        {x: 135, y: 380}, {x: 435, y: 365}, {x: 745, y: 365}, {x: 1045, y: 380},
        {x: 135, y: 625}, {x: 435, y: 640}, {x: 745, y: 640}, {x: 1045, y: 625}
    ];
    const maximumDailyVolume = d3.max(d3.groups(transactions, link => link.day), ([, links]) => d3.max(calculateActivity(links).values(), value => value.volume));
    volumeScale = d3.scaleSqrt().domain([0, maximumDailyVolume]).range([8, 48]);
    amountScale = d3.scaleLinear().domain(d3.extent(transactions, link => link.amount_usd)).range([1, 14]);
    countScale = d3.scaleLinear().domain(d3.extent(transactions, link => link.transaction_count)).range([.42, .95]);

    const svg = chartRoot.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-labelledby", "temporal-svg-title temporal-svg-desc");
    svg.append("title").attr("id", "temporal-svg-title").text("Animated 60-day commercial transaction network");
    svg.append("desc").attr("id", "temporal-svg-desc").text("Twelve companies retain stable positions while daily commercial relationships appear and disappear. Node appearance encodes company attributes and current activity; link appearance encodes transaction attributes.");
    linkLayer = svg.append("g").attr("class", "temporal-links");
    nodeSelection = svg.append("g").attr("class", "temporal-nodes").selectAll("g").data(companies, company => company.id).join("g")
        .attr("class", "temporal-node").attr("tabindex", 0).attr("role", "button");
    nodeSelection.append("circle").attr("r", 8).attr("fill", company => sectorColors.get(company.sector)).attr("stroke-dasharray", company => regionDash.get(company.region)).attr("stroke-linecap", company => company.region === "Europe" ? "round" : "butt");
    nodeSelection.append("text").attr("class", "company-label").attr("text-anchor", "middle").attr("y", -18).text(company => company.company_name);

    const simulation = d3.forceSimulation(companies).randomSource(d3.randomLcg(401))
        .force("link", d3.forceLink([...allPairs.values()]).id(company => company.id).distance(190).strength(.035))
        .force("charge", d3.forceManyBody().strength(-850))
        .force("x", d3.forceX((company, index) => targetPositions[index].x).strength(.42))
        .force("y", d3.forceY((company, index) => targetPositions[index].y).strength(.42))
        .force("collision", d3.forceCollide(76)).stop();
    for (let index = 0; index < 500; index += 1) simulation.tick();
    companies.forEach(company => {
        company.x = Math.max(75, Math.min(width - 75, company.x));
        company.y = Math.max(70, Math.min(height - 70, company.y));
    });
    nodeSelection.attr("transform", company => `translate(${company.x},${company.y})`);
    nodeSelection.call(d3.drag()
        .on("start", function() { d3.select(this).classed("dragging", true); })
        .on("drag", function(event, company) {
            company.x = Math.max(50, Math.min(width - 50, event.x));
            company.y = Math.max(50, Math.min(height - 50, event.y));
            d3.select(this).attr("transform", `translate(${company.x},${company.y})`);
            linkLayer.selectAll("line")
                .attr("x1", link => companyById.get(endpointId(link.source)).x).attr("y1", link => companyById.get(endpointId(link.source)).y)
                .attr("x2", link => companyById.get(endpointId(link.target)).x).attr("y2", link => companyById.get(endpointId(link.target)).y);
        })
        .on("end", function() { d3.select(this).classed("dragging", false); }));
}

async function createLab7() {
    try {
        const parseDate = d3.timeParse("%Y-%m-%d");
        [companies, transactions] = await Promise.all([
            d3.csv("../data/lab7_assignment_companies.csv", company => ({...company})),
            d3.csv("../data/lab7_assignment_transactions_60days.csv", link => ({...link, date: parseDate(link.date), day: +link.day, amount_usd: +link.amount_usd, transaction_count: +link.transaction_count}))
        ]);
        if (companies.length !== 12 || d3.extent(transactions, link => link.day).join("|") !== "1|60") throw new Error("The required 12-company, 60-day assignment data are incomplete.");
        const ids = new Set(companies.map(company => company.id));
        if (ids.size !== companies.length || transactions.some(link => !ids.has(link.source) || !ids.has(link.target) || !link.date || !Number.isFinite(link.amount_usd) || !Number.isFinite(link.transaction_count))) throw new Error("The assignment data contain invalid company IDs, dates, or numeric values.");
        companyById = new Map(companies.map(company => [company.id, company]));
        transactionsByDay = d3.group(transactions, link => link.day);
        addLegend();
        initializeNetwork();
        showDay(1, {immediate: true});
        d3.select("#play-button").on("click", play);
        d3.select("#pause-button").on("click", pause);
        d3.select("#reset-button").on("click", reset);
        slider.on("input", function() { pause(); showDay(+this.value, {immediate: true}); });
        statusMessage.text("Network ready. All 60 days are available.").classed("ready", true);
    } catch (error) {
        console.error("Unable to create the Lab 7 temporal network:", error);
        statusMessage.text("The temporal network data could not be loaded. Please refresh the page.").classed("error-message", true);
    }
}

createLab7();
