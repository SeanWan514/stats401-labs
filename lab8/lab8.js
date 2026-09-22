const topicColors = new Map([
    ["Course Requirements and Subject Codes", "#7f1d4e"], ["Academic Rules, Credits, and Enrollment", "#b82e67"],
    ["China, Globalization, and Economics", "#d84f77"], ["Data, Computation, and Materials", "#93579d"],
    ["Language, Learning, and Communication", "#e8799d"], ["Health, Research, and Academic Programs", "#c9519f"],
    ["Culture, Media, and Humanities", "#f19a8b"], ["Big Questions and Civic Inquiry", "#653d86"],
    ["Society, Behavior, and Environment", "#a94d66"]
]);
const shortTopic = new Map([
    ["Course Requirements and Subject Codes", "Course requirements"], ["Academic Rules, Credits, and Enrollment", "Academic rules"],
    ["China, Globalization, and Economics", "China & globalization"], ["Data, Computation, and Materials", "Data & materials"],
    ["Language, Learning, and Communication", "Language & learning"], ["Health, Research, and Academic Programs", "Health & research"],
    ["Culture, Media, and Humanities", "Culture & media"], ["Big Questions and Civic Inquiry", "Civic inquiry"],
    ["Society, Behavior, and Environment", "Society & environment"]
]);
const tooltip = d3.select("#lab8-tooltip");
const matrixTooltip = d3.select("#matrix-tooltip");
let passages = [], passageById = new Map(), neighborsById = new Map(), matrixData = [];
let pointSelection, zoomBehavior, mapSvg, mapGroup, selectedPassage = null;

function compactSection(value) { return value.replace("Courses with Course Subject: ", "").replace(/\s*\([^)]*\)$/, ""); }
function showTooltip(event, html) { const box = d3.select("#semantic-map").node().getBoundingClientRect(); tooltip.html(html).style("left", `${event.clientX - box.left}px`).style("top", `${event.clientY - box.top}px`).classed("visible", true); }
function hideTooltip() { tooltip.classed("visible", false); }
function showMatrixTooltip(event, html) { const container = d3.select("#topic-section-matrix").node(), box = container.getBoundingClientRect(); matrixTooltip.html(html).style("left", `${event.clientX - box.left + container.scrollLeft}px`).style("top", `${event.clientY - box.top + container.scrollTop}px`).classed("visible", true); }
function hideMatrixTooltip() { matrixTooltip.classed("visible", false); }

function drawHorizontalBars(container, rows, label, value, color) {
    const width = 620, rowHeight = 30, margin = {top: 10, right: 45, bottom: 22, left: 230};
    const height = margin.top + margin.bottom + rows.length * rowHeight;
    const x = d3.scaleLinear().domain([0, d3.max(rows, value)]).nice().range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(rows.map(label)).range([margin.top, height - margin.bottom]).padding(.2);
    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img");
    svg.selectAll("rect").data(rows).join("rect").attr("x", margin.left).attr("y", d => y(label(d))).attr("height", y.bandwidth()).attr("width", d => x(value(d)) - margin.left).attr("rx", 4).attr("fill", typeof color === "function" ? color : color);
    svg.selectAll(".bar-label").data(rows).join("text").attr("class", "bar-label").attr("x", margin.left - 8).attr("y", d => y(label(d)) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").text(d => compactSection(label(d)));
    svg.selectAll(".bar-value").data(rows).join("text").attr("class", "bar-value").attr("x", d => x(value(d)) + 6).attr("y", d => y(label(d)) + y.bandwidth() / 2 + 4).text(d => value(d));
}

function populateControls() {
    const sections = [...new Set(passages.map(d => d.section))].sort(d3.ascending), topics = [...new Set(passages.map(d => d.cluster_name))].sort(d3.ascending);
    d3.select("#section-filter").selectAll("option.section-option").data(sections).join("option").attr("class", "section-option").attr("value", d => d).text(d => d);
    d3.select("#topic-filter").selectAll("option.topic-option").data(topics).join("option").attr("class", "topic-option").attr("value", d => d).text(d => d);
    const legend = d3.select("#topic-legend");
    topics.forEach(topic => { const item = legend.append("span"); item.append("i").style("background", topicColors.get(topic)); item.append("span").text(topic); });
}

function currentMatches(d) {
    const query = d3.select("#passage-search").property("value").trim().toLowerCase(), section = d3.select("#section-filter").property("value"), topic = d3.select("#topic-filter").property("value");
    return (!query || d.text_clean.toLowerCase().includes(query)) && (section === "all" || d.section === section) && (topic === "all" || d.cluster_name === topic);
}
function updateMapFilters() { const matches = passages.filter(currentMatches); pointSelection.classed("filtered-out", d => !currentMatches(d)); d3.select("#map-status").text(`${matches.length.toLocaleString()} of ${passages.length.toLocaleString()} passages highlighted.`).classed("ready", true); }

function selectPassage(passage) {
    selectedPassage = passage;
    const nearest = neighborsById.get(passage.passage_id) || [], neighborIds = new Set(nearest.map(item => item.neighbor_id));
    pointSelection.classed("selected", d => d.passage_id === passage.passage_id).classed("neighbor", d => neighborIds.has(d.passage_id));
    const panel = d3.select("#passage-details"); panel.html("");
    panel.append("p").attr("class", "section-label").text(passage.passage_id); panel.append("h3").text(passage.section);
    panel.append("dl").html(`<div><dt>Chapter</dt><dd>${passage.chapter}</dd></div><div><dt>Subsection</dt><dd>${passage.subsection}</dd></div><div><dt>Page</dt><dd>${passage.page}</dd></div><div><dt>Topic</dt><dd>${passage.cluster_name}</dd></div><div><dt>Length</dt><dd>${passage.word_count} words</dd></div>`);
    panel.append("p").attr("class", "passage-text").text(passage.text); panel.append("h4").text("Five nearest semantic neighbors");
    const list = panel.append("ol").attr("class", "neighbor-list");
    nearest.forEach(item => { const neighbor = passageById.get(item.neighbor_id), button = list.append("li").append("button").attr("type", "button").on("click", () => selectPassage(neighbor)); button.append("strong").text(`${neighbor.passage_id} · ${compactSection(neighbor.section)}`); button.append("span").text(`Similarity ${(+item.similarity).toFixed(3)} · ${neighbor.text.slice(0, 110)}…`); });
    highlightMatrixCell(passage.section, passage.cluster_name);
}

function drawSemanticMap() {
    const width = 1120, height = 720, margin = 35, x = d3.scaleLinear().domain(d3.extent(passages, d => d.x)).nice().range([margin, width - margin]), y = d3.scaleLinear().domain(d3.extent(passages, d => d.y)).nice().range([height - margin, margin]), radius = d3.scaleSqrt().domain(d3.extent(passages, d => d.word_count)).range([2.8, 8.5]);
    mapSvg = d3.select("#semantic-map").append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-labelledby", "map-svg-title map-svg-desc");
    mapSvg.append("title").attr("id", "map-svg-title").text("Semantic map of bulletin passages"); mapSvg.append("desc").attr("id", "map-svg-desc").text("Each point is a bulletin passage. Nearby points tend to have similar semantic embeddings. Color indicates topic and area indicates word count.");
    mapSvg.append("rect").attr("class", "map-background").attr("width", width).attr("height", height); mapGroup = mapSvg.append("g");
    pointSelection = mapGroup.selectAll("circle").data(passages, d => d.passage_id).join("circle").attr("class", "semantic-point").attr("cx", d => x(d.x)).attr("cy", d => y(d.y)).attr("r", d => radius(d.word_count)).attr("fill", d => topicColors.get(d.cluster_name)).attr("tabindex", 0).attr("role", "button").attr("aria-label", d => `${d.passage_id}, ${d.cluster_name}, ${d.section}, page ${d.page}, ${d.word_count} words`).on("pointerenter focus", (event, d) => showTooltip(event, `<strong>${d.passage_id}</strong><span>${d.cluster_name}</span><span>${d.section}</span><span>Page ${d.page} · ${d.word_count} words</span>`)).on("pointerleave blur", hideTooltip).on("click keydown", (event, d) => { if (event.type === "click" || event.key === "Enter" || event.key === " ") { event.preventDefault(); selectPassage(d); } });
    zoomBehavior = d3.zoom().scaleExtent([.8, 14]).on("zoom", event => mapGroup.attr("transform", event.transform)); mapSvg.call(zoomBehavior); updateMapFilters();
}

function highlightMatrixCell(section, topic) { d3.selectAll(".matrix-cell").classed("selected", d => d.section === section && d.cluster_name === topic); }
function drawMatrix() {
    const sectionTotals = d3.rollups(passages, values => values.length, d => d.section).sort((a, b) => d3.descending(a[1], b[1])), sections = sectionTotals.slice(0, 30).map(d => d[0]), topics = [...topicColors.keys()], lookup = new Map(matrixData.map(d => [`${d.section}\u0000${d.cluster_name}`, d.count])), cells = sections.flatMap(section => topics.map(topic => ({section, cluster_name: topic, count: lookup.get(`${section}\u0000${topic}`) || 0})));
    const cell = 22, margin = {top: 210, right: 25, bottom: 25, left: 330}, width = margin.left + topics.length * cell + margin.right, height = margin.top + sections.length * cell + margin.bottom, color = d3.scaleSequentialSqrt(d3.interpolateRgb("#fff5f9", "#8a164d")).domain([0, d3.max(cells, d => d.count)]);
    const svg = d3.select("#topic-section-matrix").append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height).attr("role", "img");
    svg.selectAll(".matrix-cell").data(cells).join("rect").attr("class", "matrix-cell").attr("x", d => margin.left + topics.indexOf(d.cluster_name) * cell).attr("y", d => margin.top + sections.indexOf(d.section) * cell).attr("width", cell - 1).attr("height", cell - 1).attr("fill", d => d.count ? color(d.count) : "#fffafd").attr("tabindex", 0).on("pointerenter focus", (event, d) => showMatrixTooltip(event, `<strong>${compactSection(d.section)}</strong><span>${d.cluster_name}</span><span>${d.count} passage${d.count === 1 ? "" : "s"}</span>`)).on("pointerleave blur", hideMatrixTooltip).on("click keydown", (event, d) => { if (event.type !== "click" && event.key !== "Enter" && event.key !== " ") return; d3.select("#section-filter").property("value", d.section); d3.select("#topic-filter").property("value", d.cluster_name); updateMapFilters(); highlightMatrixCell(d.section, d.cluster_name); document.querySelector("#semantic-map").scrollIntoView({behavior: "smooth", block: "center"}); });
    svg.selectAll(".matrix-row-label").data(sections).join("text").attr("class", "matrix-row-label").attr("x", margin.left - 8).attr("y", d => margin.top + sections.indexOf(d) * cell + 15).attr("text-anchor", "end").text(compactSection);
    svg.selectAll(".matrix-column-label").data(topics).join("text").attr("class", "matrix-column-label").attr("transform", d => `translate(${margin.left + topics.indexOf(d) * cell + 15},${margin.top - 8}) rotate(-55)`).text(d => shortTopic.get(d));
    d3.select("#matrix-status").text("Showing the 30 largest of 165 formal sections across all nine semantic topics. Darker cells contain more passages.").classed("ready", true);
}

async function createLab8() {
    try {
        const [mapRows, neighborRows, matrixRows, sectionRows, topicRows] = await Promise.all([
            d3.csv("../data/lab8_embedding_map.csv", d => ({...d, page: +d.page, word_count: +d.word_count, cluster: +d.cluster, x: +d.x, y: +d.y})), d3.csv("../data/lab8_semantic_neighbors.csv", d => ({...d, rank: +d.rank, similarity: +d.similarity})), d3.csv("../data/lab8_topic_section_matrix.csv", d => ({...d, count: +d.count})), d3.csv("../data/lab8_section_summary.csv", d => ({...d, passage_count: +d.passage_count, average_word_count: +d.average_word_count, topic_count: +d.topic_count})), d3.csv("../data/lab8_topic_summary.csv", d => ({...d, cluster: +d.cluster, passage_count: +d.passage_count}))
        ]);
        passages = mapRows; matrixData = matrixRows; passageById = new Map(passages.map(d => [d.passage_id, d])); neighborsById = d3.group(neighborRows.sort((a, b) => d3.ascending(a.rank, b.rank)), d => d.passage_id);
        if (passages.length !== 1738 || passages.some(d => !Number.isFinite(d.x) || !Number.isFinite(d.y) || !d.section || !d.cluster_name)) throw new Error("The processed corpus is incomplete.");
        populateControls(); drawHorizontalBars("#section-summary-chart", sectionRows.slice(0, 12), d => d.section, d => d.passage_count, "#d84f77"); drawHorizontalBars("#topic-summary-chart", topicRows.sort((a, b) => d3.descending(a.passage_count, b.passage_count)), d => d.cluster_name, d => d.passage_count, d => topicColors.get(d.cluster_name));
        d3.select("#topic-term-body").selectAll("tr").data(topicRows).join("tr").html(d => `<th><span class="table-topic-dot" style="background:${topicColors.get(d.cluster_name)}"></span>${d.cluster_name}</th><td>${d.passage_count}</td><td>${d.top_terms.split("; ").join(", ")}</td>`);
        drawSemanticMap(); drawMatrix();
        d3.select("#passage-search").on("input", updateMapFilters); d3.select("#section-filter").on("change", updateMapFilters); d3.select("#topic-filter").on("change", updateMapFilters);
        d3.select("#clear-filters").on("click", () => { d3.select("#passage-search").property("value", ""); d3.select("#section-filter").property("value", "all"); d3.select("#topic-filter").property("value", "all"); updateMapFilters(); });
        d3.select("#reset-zoom").on("click", () => mapSvg.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity));
    } catch (error) { console.error("Unable to create Lab 8:", error); d3.select("#map-status").text("The bulletin data could not be loaded. Please refresh the page.").classed("error-message", true); }
}
createLab8();
