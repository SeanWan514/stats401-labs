const statusOrder = ["Increase", "Unchanged", "Decrease"];
const statusColors = new Map([
    ["Increase", "#df668b"],
    ["Unchanged", "#f2b8ca"],
    ["Decrease", "#7d234f"]
]);

function topAncestor(node, depth) {
    let current = node;
    while (current.depth > depth) current = current.parent;
    return current;
}

function showTreemapTooltip(tooltip, root, event, mark, node) {
    const chartBox = root.node().getBoundingClientRect();
    const markBox = mark.getBoundingClientRect();
    const clientX = Number.isFinite(event.clientX) ? event.clientX : markBox.left + markBox.width / 2;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : markBox.top;
    const continent = topAncestor(node, 1).data.name;
    const area = node.parent.data.name;
    tooltip
        .html(`<strong>${node.data.name}</strong><span>Continent: ${continent}</span><span>Area: ${area}</span><span>GDP: $${d3.format(",.0f")(node.data.gdp)} billion</span><span>Status: ${node.data.status}</span>`)
        .style("left", `${clientX - chartBox.left}px`)
        .style("top", `${clientY - chartBox.top}px`)
        .classed("visible", true);
}

function hideTreemapTooltip(tooltip) {
    tooltip.classed("visible", false);
}

function drawLegend() {
    const legend = d3.select("#gdp-legend");
    statusOrder.forEach(status => {
        const item = legend.append("span").attr("class", "gdp-legend-item");
        item.append("i").style("background", statusColors.get(status));
        item.append("span").text(status);
    });
    legend.append("span").attr("class", "gdp-size-note").text("Larger rectangle = greater GDP");
}

function drawTreemap(data, selector, tooltipSelector, tile, title, description) {
    const width = 1080;
    const height = 650;
    const root = d3.hierarchy(data)
        .sum(node => node.gdp || 0)
        .sort((a, b) => b.value - a.value || d3.ascending(a.data.name, b.data.name));

    d3.treemap()
        .tile(tile)
        .size([width, height])
        .paddingOuter(5)
        .paddingTop(node => node.depth === 1 ? 25 : node.depth === 2 ? 19 : 0)
        .paddingInner(3)(root);

    const chart = d3.select(selector);
    const tooltip = d3.select(tooltipSelector);
    const svg = chart.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-labelledby", `${selector.slice(1)}-svg-title ${selector.slice(1)}-svg-desc`);

    svg.append("title").attr("id", `${selector.slice(1)}-svg-title`).text(title);
    svg.append("desc").attr("id", `${selector.slice(1)}-svg-desc`).text(description);

    const leaves = svg.append("g").selectAll("g.country-cell")
        .data(root.leaves())
        .join("g")
        .attr("class", "country-cell")
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", node => `${node.data.name}, ${node.parent.data.name}, ${topAncestor(node, 1).data.name}, GDP ${node.data.gdp} billion dollars, ${node.data.status}`)
        .attr("transform", node => `translate(${node.x0},${node.y0})`);

    leaves.append("rect")
        .attr("width", node => Math.max(0, node.x1 - node.x0))
        .attr("height", node => Math.max(0, node.y1 - node.y0))
        .attr("fill", node => statusColors.get(node.data.status));

    leaves.append("text")
        .attr("class", "country-label")
        .attr("x", 6)
        .attr("y", 17)
        .style("display", node => node.x1 - node.x0 > 58 && node.y1 - node.y0 > 26 ? null : "none")
        .text(node => node.data.name);

    leaves.append("text")
        .attr("class", "country-value")
        .attr("x", 6)
        .attr("y", 34)
        .style("display", node => node.x1 - node.x0 > 72 && node.y1 - node.y0 > 45 ? null : "none")
        .text(node => `$${d3.format(",.0f")(node.data.gdp)}B`);

    const containers = svg.append("g").attr("class", "hierarchy-containers")
        .selectAll("g.hierarchy-container")
        .data(root.descendants().filter(node => node.depth === 1 || node.depth === 2))
        .join("g").attr("class", node => `hierarchy-container depth-${node.depth}`);

    containers.append("rect")
        .attr("x", node => node.x0)
        .attr("y", node => node.y0)
        .attr("width", node => node.x1 - node.x0)
        .attr("height", node => node.y1 - node.y0);

    containers.append("text")
        .attr("x", node => node.x0 + 6)
        .attr("y", node => node.y0 + (node.depth === 1 ? 17 : 14))
        .style("display", node => {
            const availableWidth = node.x1 - node.x0;
            const availableHeight = node.y1 - node.y0;
            const estimatedLabelWidth = node.data.name.length * 6.5 + 12;
            return availableWidth >= estimatedLabelWidth && availableHeight >= 22 ? null : "none";
        })
        .text(node => node.data.name);

    leaves.on("pointerenter focus", function(event, node) {
        d3.select(this).classed("active", true);
        showTreemapTooltip(tooltip, chart, event, this, node);
    }).on("pointerleave blur", function() {
        d3.select(this).classed("active", false);
        hideTreemapTooltip(tooltip);
    });
}

async function createLab6() {
    try {
        const data = await d3.json("../data/lab6_assignment_gdp.json");
        drawLegend();
        drawTreemap(data, "#treemap-squarify", "#tooltip-squarify", d3.treemapSquarify, "Squarified GDP treemap", "Country rectangle area represents GDP and color represents GDP status in a squarified hierarchy.");
        drawTreemap(data, "#treemap-slice", "#tooltip-slice", d3.treemapSliceDice, "Slice-and-dice GDP treemap", "Country rectangle area represents GDP and color represents GDP status in a slice-and-dice hierarchy.");
    } catch (error) {
        console.error("Unable to create the Lab 6 treemaps:", error);
        d3.selectAll(".treemap-chart").append("p").attr("class", "error-message").text("The hierarchical GDP data could not be loaded. Please refresh the page.");
    }
}

createLab6();
