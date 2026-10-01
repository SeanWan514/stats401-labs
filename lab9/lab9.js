const WIDTH = 1200;
const MAP_HEIGHT = 650;
const CARTOGRAM_HEIGHT = 700;
const tooltip = d3.select("#lab9-tooltip");
const formatGDP = d3.format("$,.3f");
let selectedIso = null;
let worldPaths;
let cartogramMarks;

function featureIso(feature) {
    return feature.properties.iso3;
}

function tooltipPosition(event, mark) {
    const markBox = mark.getBoundingClientRect();
    const clientX = Number.isFinite(event.clientX) && event.clientX !== 0 ? event.clientX : markBox.left + markBox.width / 2;
    const clientY = Number.isFinite(event.clientY) && event.clientY !== 0 ? event.clientY : markBox.top;
    return {left: clientX, top: clientY};
}

function showTooltip(event, mark, datum) {
    const info = datum.gdp;
    const name = info ? info.country : datum.properties.name;
    const content = info
        ? `<strong>${name}</strong><span>2025 GDP: ${formatGDP(info.gdp_2025_billion_usd)} billion</span><span>Global rank: ${info.rank}</span><span>ISO-3: ${info.iso3}</span>`
        : `<strong>${name}</strong><span>GDP: missing from the provided top-50 dataset</span>`;
    const position = tooltipPosition(event, mark);
    tooltip.html(content).style("left", `${position.left}px`).style("top", `${position.top}px`).classed("visible", true);
}

function hideTooltip() {
    tooltip.classed("visible", false);
}

function setHighlight(iso, persistent = false) {
    if (persistent) selectedIso = selectedIso === iso ? null : iso;
    const active = persistent ? selectedIso : (iso || selectedIso);
    worldPaths.classed("linked-active", d => featureIso(d) === active)
        .classed("linked-muted", d => Boolean(active) && featureIso(d) !== active);
    cartogramMarks.classed("linked-active", d => featureIso(d) === active)
        .classed("linked-muted", d => Boolean(active) && featureIso(d) !== active);
}

function interactionHandlers(selection) {
    selection
        .on("mouseenter focus", function(event, d) {
            setHighlight(featureIso(d));
            showTooltip(event, this, d);
        })
        .on("mousemove", function(event, d) { showTooltip(event, this, d); })
        .on("mouseleave blur", function() {
            hideTooltip();
            setHighlight(null);
        })
        .on("click", function(event, d) {
            event.stopPropagation();
            setHighlight(featureIso(d), true);
        })
        .on("keydown", function(event, d) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setHighlight(featureIso(d), true);
            }
        });
}

function drawColorLegend(color, domain) {
    const holder = d3.select("#choropleth-legend");
    holder.append("strong").text("2025 GDP (billions of current US$) · logarithmic color scale");
    const svg = holder.append("svg").attr("viewBox", "0 0 560 62").attr("role", "img").attr("aria-label", "Logarithmic yellow-to-purple color scale from 300 to 30,616 billion dollars");
    const gradient = svg.append("defs").append("linearGradient").attr("id", "gdp-gradient");
    d3.range(0, 1.001, 0.05).forEach(t => gradient.append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", color(domain[0] * Math.pow(domain[1] / domain[0], t))));
    svg.append("rect").attr("x", 12).attr("y", 7).attr("width", 460).attr("height", 16).attr("rx", 4).attr("fill", "url(#gdp-gradient)");
    const scale = d3.scaleLog().domain(domain).range([12, 472]);
    const axis = d3.axisBottom(scale).tickValues([300, 500, 1000, 5000, 10000, 30000]).tickFormat(d => d3.format("~s")(d));
    svg.append("g").attr("transform", "translate(0,23)").call(axis).call(g => g.select(".domain").remove());
    svg.append("rect").attr("x", 495).attr("y", 7).attr("width", 18).attr("height", 16).attr("fill", "#d8d8d4").attr("stroke", "#aaa9a3");
    svg.append("text").attr("x", 520).attr("y", 20).attr("font-size", 11).text("Missing");
}

function drawAreaLegend(color, maxGDP) {
    const values = [500, 5000, 30000];
    const holder = d3.select("#cartogram-legend");
    holder.append("strong").text("Displayed country area = 2025 GDP (billions of current US$)");
    const svg = holder.append("svg").attr("viewBox", "0 0 700 125").attr("role", "img").attr("aria-label", "Cartogram country-area examples for 500, 5,000, and 30,000 billion dollars");
    const x = [60, 235, 500];
    values.forEach((value, i) => {
        const side = Math.sqrt(value / maxGDP) * 92;
        svg.append("rect").attr("x", x[i] - side / 2).attr("y", 94 - side).attr("width", side).attr("height", side)
            .attr("fill", color(value)).attr("stroke", "#fff").attr("stroke-width", 2);
        svg.append("text").attr("x", x[i]).attr("y", 118).attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 800).text(`$${d3.format(",")(value)}B`);
    });
    svg.append("rect").attr("x", 620).attr("y", 76).attr("width", 18).attr("height", 18).attr("fill", "#d8d8d4").attr("stroke", "#aaa9a3");
    svg.append("text").attr("x", 646).attr("y", 90).attr("font-size", 11).text("Missing");
}

Promise.all([
    d3.json("../data/lab9_world.geojson"),
    d3.csv("../data/lab9_gdp_2025_top50.csv", d => ({
        iso3: d.iso3,
        country: d.country,
        gdp_2025_billion_usd: +d.gdp_2025_billion_usd,
        rank: +d.rank
    }))
]).then(([world, gdp]) => {
    const gdpByIso = new Map(gdp.map(d => [d.iso3, d]));
    world.features.forEach(feature => { feature.gdp = gdpByIso.get(featureIso(feature)) || null; });
    const matched = new Set(world.features.filter(d => d.gdp).map(featureIso));
    const unmatched = gdp.filter(d => !matched.has(d.iso3));
    if (unmatched.length) throw new Error(`Unmatched GDP ISO-3 identifiers: ${unmatched.map(d => d.iso3).join(", ")}`);

    const domain = d3.extent(gdp, d => d.gdp_2025_billion_usd);
    const color = d3.scaleSequentialLog(d3.interpolateRgbBasis([
        "#fff7bc", "#e5f5a9", "#8bd49c", "#41b6c4", "#2c7fb8", "#253494", "#4a1486"
    ])).domain(domain);
    drawColorLegend(color, domain);

    const projection = d3.geoNaturalEarth1().fitExtent([[18, 18], [WIDTH - 18, MAP_HEIGHT - 18]], world);
    const path = d3.geoPath(projection);
    const mapSvg = d3.select("#choropleth").append("svg")
        .attr("viewBox", `0 0 ${WIDTH} ${MAP_HEIGHT}`)
        .attr("role", "img")
        .attr("aria-label", "World choropleth showing 2025 GDP for the 50 provided economies; other countries are missing data");
    const mapLayer = mapSvg.append("g");
    worldPaths = mapLayer.selectAll("path").data(world.features).join("path")
        .attr("class", d => `country-shape${d.gdp ? " has-gdp" : " missing-gdp"}`)
        .attr("d", path)
        .attr("fill", d => d.gdp ? color(d.gdp.gdp_2025_billion_usd) : "#d8d8d4")
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", d => d.gdp ? `${d.gdp.country}, 2025 GDP ${formatGDP(d.gdp.gdp_2025_billion_usd)} billion dollars, rank ${d.gdp.rank}` : `${d.properties.name}, GDP missing from the provided top-50 dataset`);

    const zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", event => mapLayer.attr("transform", event.transform));
    mapSvg.call(zoom).on("dblclick.zoom", null).on("click", () => { selectedIso = null; setHighlight(null); });
    d3.select("#reset-map-zoom").on("click", () => mapSvg.transition().duration(500).call(zoom.transform, d3.zoomIdentity));

    drawAreaLegend(color, domain[1]);
    const maximumTargetArea = 30000;
    const cartogramNodes = world.features.map(feature => {
        const centroid = path.centroid(feature);
        const originalArea = Math.max(path.area(feature), .01);
        const targetArea = feature.gdp
            ? (feature.gdp.gdp_2025_billion_usd / domain[1]) * maximumTargetArea
            : originalArea * .08;
        const scale = Math.sqrt(targetArea / originalArea);
        const collisionRadius = feature.gdp
            ? Math.sqrt(targetArea / Math.PI) * 1.08
            : Math.max(1.5, Math.sqrt(targetArea / Math.PI) * .65);
        return {feature, cx: centroid[0], cy: centroid[1], x: centroid[0], y: centroid[1], scale, targetArea, collisionRadius};
    });
    const matchedCartogramNodes = cartogramNodes.filter(d => d.feature.gdp);
    const simulation = d3.forceSimulation(matchedCartogramNodes)
        .force("x", d3.forceX(d => d.cx).strength(.38))
        .force("y", d3.forceY(d => d.cy).strength(.38))
        .force("collide", d3.forceCollide(d => d.collisionRadius + 2).iterations(5))
        .stop();
    for (let i = 0; i < 600; i += 1) simulation.tick();
    cartogramNodes.forEach(node => {
        node.x = Math.max(node.collisionRadius + 8, Math.min(WIDTH - node.collisionRadius - 8, node.x));
        node.y = Math.max(node.collisionRadius + 8, Math.min(CARTOGRAM_HEIGHT - node.collisionRadius - 8, node.y + 25));
        node.feature.cx = node.cx;
        node.feature.cy = node.cy;
        node.feature.x = node.x;
        node.feature.y = node.y;
        node.feature.scale = node.scale;
        node.feature.targetArea = node.targetArea;
    });

    const cartSvg = d3.select("#cartogram").append("svg")
        .attr("viewBox", `0 0 ${WIDTH} ${CARTOGRAM_HEIGHT}`)
        .attr("role", "img")
        .attr("aria-label", "Non-contiguous country-shape cartogram where displayed area represents 2025 GDP");
    const cartogramOrder = [...world.features].sort((a, b) => Number(Boolean(a.gdp)) - Number(Boolean(b.gdp)));
    cartogramMarks = cartSvg.selectAll("g.cartogram-country").data(cartogramOrder).join("g")
        .attr("class", d => `cartogram-country${d.gdp ? " has-gdp" : " missing-gdp"}`)
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", d => d.gdp ? `${d.gdp.country}, displayed country area represents ${formatGDP(d.gdp.gdp_2025_billion_usd)} billion dollars, rank ${d.gdp.rank}` : `${d.properties.name}, GDP missing from the provided top-50 dataset`);
    cartogramMarks.append("path")
        .attr("d", path)
        .attr("transform", d => `translate(${d.x},${d.y}) scale(${d.scale}) translate(${-d.cx},${-d.cy})`)
        .attr("fill", d => d.gdp ? color(d.gdp.gdp_2025_billion_usd) : "#d8d8d4");
    cartogramMarks.filter(d => d.gdp && d.gdp.rank <= 12).append("text")
        .attr("class", "cartogram-label")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("text-anchor", "middle")
        .attr("dy", ".32em")
        .text(d => featureIso(d));
    cartSvg.on("click", () => { selectedIso = null; setHighlight(null); });

    interactionHandlers(worldPaths);
    interactionHandlers(cartogramMarks);
    const missingCount = world.features.length - gdp.length;
    d3.select("#choropleth-status").text(`Choropleth: all ${gdp.length} GDP records joined to GeoJSON by ISO-3; ${missingCount} other geographic features are displayed as missing data.`);
    d3.select("#cartogram-status").text(`Cartogram: all ${gdp.length} GDP records joined to GeoJSON by ISO-3 and resized by GDP area; ${missingCount} other geographic features remain visible as missing data.`);
}).catch(error => {
    console.error(error);
    d3.select("#choropleth-status").text(`The maps could not load: ${error.message}`);
    d3.select("#cartogram-status").text(`The cartogram could not load: ${error.message}`);
});
