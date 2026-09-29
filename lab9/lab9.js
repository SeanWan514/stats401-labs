const WIDTH = 1200;
const MAP_HEIGHT = 650;
const CARTOGRAM_HEIGHT = 650;
const tooltip = d3.select("#lab9-tooltip");
const readout = d3.select("#country-readout");
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
    const info = datum.gdp || datum.data;
    const name = info ? info.country : datum.properties.name;
    const content = info
        ? `<strong>${name}</strong><span>2025 GDP: ${formatGDP(info.gdp_2025_billion_usd)} billion</span><span>Global rank: ${info.rank}</span><span>ISO-3: ${info.iso3}</span>`
        : `<strong>${name}</strong><span>GDP: missing from the provided top-50 dataset</span><span>Not encoded as zero</span>`;
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
    cartogramMarks.classed("linked-active", d => d.iso3 === active)
        .classed("linked-muted", d => Boolean(active) && d.iso3 !== active);
    if (active) {
        const mark = cartogramMarks.data().find(d => d.iso3 === active);
        if (mark) readout.html(`<strong>${mark.country}</strong> &middot; ${formatGDP(mark.gdp_2025_billion_usd)} billion &middot; rank ${mark.rank} &middot; ISO-3 ${mark.iso3}`);
    } else {
        readout.html("<strong>Linked inspection:</strong> Hover, focus, or click a country in either view.");
    }
}

function interactionHandlers(selection, isoAccessor) {
    selection
        .on("mouseenter focus", function(event, d) {
            setHighlight(isoAccessor(d));
            showTooltip(event, this, d);
        })
        .on("mousemove", function(event, d) { showTooltip(event, this, d); })
        .on("mouseleave blur", function() {
            hideTooltip();
            setHighlight(null);
        })
        .on("click", function(event, d) {
            event.stopPropagation();
            setHighlight(isoAccessor(d), true);
        })
        .on("keydown", function(event, d) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setHighlight(isoAccessor(d), true);
            }
        });
}

function drawColorLegend(color, domain) {
    const holder = d3.select("#choropleth-legend");
    holder.append("strong").text("2025 GDP (billions of current US$) · logarithmic color scale");
    const svg = holder.append("svg").attr("viewBox", "0 0 560 62").attr("role", "img").attr("aria-label", "Logarithmic color scale from 300 to 30,616 billion dollars");
    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient").attr("id", "gdp-gradient");
    d3.range(0, 1.001, 0.05).forEach(t => gradient.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", color(domain[0] * Math.pow(domain[1] / domain[0], t))));
    svg.append("rect").attr("x", 12).attr("y", 7).attr("width", 460).attr("height", 16).attr("rx", 4).attr("fill", "url(#gdp-gradient)");
    const scale = d3.scaleLog().domain(domain).range([12, 472]);
    const axis = d3.axisBottom(scale).tickValues([300, 500, 1000, 5000, 10000, 30000]).tickFormat(d => d3.format("~s")(d).replace("k", "k"));
    svg.append("g").attr("transform", "translate(0,23)").call(axis).call(g => g.select(".domain").remove());
    svg.append("rect").attr("x", 495).attr("y", 7).attr("width", 18).attr("height", 16).attr("fill", "#e6e1e4").attr("stroke", "#c5b9bf");
    svg.append("text").attr("x", 520).attr("y", 20).attr("font-size", 11).text("Missing");
}

function drawAreaLegend(radius) {
    const values = [500, 5000, 30000];
    const holder = d3.select("#cartogram-legend");
    holder.append("strong").text("Circle area = 2025 GDP (billions of current US$)");
    const svg = holder.append("svg").attr("viewBox", "0 0 700 150").attr("role", "img").attr("aria-label", "Cartogram area examples for 500, 5,000, and 30,000 billion dollars");
    const baseline = 125;
    const x = [75, 265, 535];
    values.forEach((value, i) => {
        const r = radius(value);
        svg.append("circle").attr("cx", x[i]).attr("cy", baseline - r).attr("r", r).attr("fill", "#f5b3c7").attr("fill-opacity", .72).attr("stroke", "#971649").attr("stroke-width", 2);
        svg.append("text").attr("x", x[i]).attr("y", 146).attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 800).text(`$${d3.format(",")(value)}B`);
    });
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
    const matched = new Set(world.features.filter(d => d.gdp).map(d => featureIso(d)));
    const unmatched = gdp.filter(d => !matched.has(d.iso3));
    if (unmatched.length) throw new Error(`Unmatched GDP ISO-3 identifiers: ${unmatched.map(d => d.iso3).join(", ")}`);

    const domain = d3.extent(gdp, d => d.gdp_2025_billion_usd);
    const color = d3.scaleSequentialLog(d3.interpolateRgbBasis(["#fde8ef", "#f598b5", "#d94778", "#7b143e", "#35101f"])).domain(domain);
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
        .attr("fill", d => d.gdp ? color(d.gdp.gdp_2025_billion_usd) : "#e6e1e4")
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", d => d.gdp ? `${d.gdp.country}, 2025 GDP ${formatGDP(d.gdp.gdp_2025_billion_usd)} billion dollars, rank ${d.gdp.rank}` : `${d.properties.name}, GDP missing from the provided top-50 dataset`);

    const zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", event => mapLayer.attr("transform", event.transform));
    mapSvg.call(zoom).on("dblclick.zoom", null).on("click", () => { selectedIso = null; setHighlight(null); });
    d3.select("#reset-map-zoom").on("click", () => mapSvg.transition().duration(500).call(zoom.transform, d3.zoomIdentity));

    const radius = value => Math.sqrt(value / domain[1]) * 82;
    drawAreaLegend(radius);
    const rawNodes = gdp.map(d => {
        const feature = world.features.find(f => featureIso(f) === d.iso3);
        const centroid = path.centroid(feature);
        return {...d, feature, rawX: centroid[0], rawY: centroid[1], r: radius(d.gdp_2025_billion_usd)};
    });
    const cartX = d3.scaleLinear().domain(d3.extent(rawNodes, d => d.rawX)).range([90, WIDTH - 90]);
    const cartY = d3.scaleLinear().domain(d3.extent(rawNodes, d => d.rawY)).range([85, CARTOGRAM_HEIGHT - 85]);
    const nodes = rawNodes.map(d => ({...d, anchorX: cartX(d.rawX), anchorY: cartY(d.rawY), x: cartX(d.rawX), y: cartY(d.rawY)}));
    const simulation = d3.forceSimulation(nodes)
        .force("x", d3.forceX(d => d.anchorX).strength(.18))
        .force("y", d3.forceY(d => d.anchorY).strength(.18))
        .force("collide", d3.forceCollide(d => d.r + 2).iterations(5))
        .stop();
    for (let i = 0; i < 600; i += 1) simulation.tick();
    nodes.forEach(d => {
        d.x = Math.max(d.r + 8, Math.min(WIDTH - d.r - 8, d.x));
        d.y = Math.max(d.r + 8, Math.min(CARTOGRAM_HEIGHT - d.r - 8, d.y));
        d.data = d;
    });

    const cartSvg = d3.select("#cartogram").append("svg")
        .attr("viewBox", `0 0 ${WIDTH} ${CARTOGRAM_HEIGHT}`)
        .attr("role", "img")
        .attr("aria-label", "Dorling cartogram where country circle area is directly proportional to 2025 GDP");
    const markGroup = cartSvg.selectAll("g.cartogram-country").data(nodes).join("g")
        .attr("class", "cartogram-country")
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", d => `${d.country}, circle area represents ${formatGDP(d.gdp_2025_billion_usd)} billion dollars, rank ${d.rank}`);
    markGroup.append("circle")
        .attr("r", d => d.r)
        .attr("fill", d => color(d.gdp_2025_billion_usd));
    markGroup.filter(d => d.r >= 15).append("text")
        .attr("class", "cartogram-label")
        .attr("text-anchor", "middle")
        .attr("dy", ".32em")
        .text(d => d.iso3);
    cartogramMarks = markGroup;
    cartSvg.on("click", () => { selectedIso = null; setHighlight(null); });

    interactionHandlers(worldPaths, featureIso);
    interactionHandlers(cartogramMarks, d => d.iso3);
    d3.select("#choropleth-status").text(`Ready: all ${gdp.length} GDP records joined to GeoJSON by ISO-3; ${world.features.length - gdp.length} other geographic features are displayed as missing data.`);
}).catch(error => {
    console.error(error);
    d3.select("#choropleth-status").text(`The maps could not load: ${error.message}`);
});
