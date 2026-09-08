const networkRoot = d3.select("#network-chart");
const matrixRoot = d3.select("#matrix-chart");
const networkTooltip = d3.select("#network-tooltip");
const matrixTooltip = d3.select("#matrix-tooltip");
const districtOrder = ["Central", "North", "South", "East", "West"];
const stationTypeOrder = ["Terminal", "Transfer", "Local"];
const routeTypeOrder = ["Metro", "Express", "Shuttle"];
const districtColors = new Map([["Central", "#8f1d4d"], ["North", "#b72f69"], ["South", "#d94f7e"], ["East", "#ee82a2"], ["West", "#a45a84"]]);
const routeColors = new Map([["Metro", "#7f234f"], ["Express", "#df5c78"], ["Shuttle", "#9b668d"]]);
const shapeTypes = new Map([["Local", d3.symbolCircle], ["Transfer", d3.symbolSquare], ["Terminal", d3.symbolTriangle]]);

function tooltipPosition(event, root, mark) {
    const box = root.node().getBoundingClientRect();
    const markBox = mark.getBoundingClientRect();
    const x = Number.isFinite(event.clientX) ? event.clientX : markBox.left + markBox.width / 2;
    const y = Number.isFinite(event.clientY) ? event.clientY : markBox.top;
    return {left: x - box.left, top: y - box.top};
}

function showTooltip(tooltip, root, event, mark, content) {
    const position = tooltipPosition(event, root, mark);
    tooltip.html(content).style("left", `${position.left}px`).style("top", `${position.top}px`).classed("visible", true);
}

function hideTooltip(tooltip) { tooltip.classed("visible", false); }

function addLegend() {
    const legend = d3.select("#network-legend");
    const districts = legend.append("div").attr("class", "legend-group");
    districts.append("strong").text("District / node color");
    districtOrder.forEach(district => {
        const item = districts.append("span").attr("class", "legend-item");
        item.append("i").attr("class", "legend-swatch").style("background", districtColors.get(district));
        item.append("span").text(district);
    });
    const stations = legend.append("div").attr("class", "legend-group");
    stations.append("strong").text("Station type / shape");
    stationTypeOrder.forEach(type => {
        const item = stations.append("span").attr("class", "legend-item");
        item.append("span").attr("class", `shape-key shape-${type.toLowerCase()}`).attr("aria-hidden", "true");
        item.append("span").text(type);
    });
    const routes = legend.append("div").attr("class", "legend-group");
    routes.append("strong").text("Route type / link color");
    routeTypeOrder.forEach(type => {
        const item = routes.append("span").attr("class", "legend-item");
        item.append("i").attr("class", "legend-line").style("background", routeColors.get(type));
        item.append("span").text(type);
    });
    legend.append("div").attr("class", "legend-note").html("Larger node = more daily passengers &nbsp;&middot;&nbsp; Wider link = longer travel time");

    const matrixLegend = d3.select("#matrix-legend");
    const matrixRoutes = matrixLegend.append("div").attr("class", "legend-group");
    matrixRoutes.append("strong").text("Connected cell / route type");
    routeTypeOrder.forEach(type => {
        const item = matrixRoutes.append("span").attr("class", "legend-item");
        item.append("i").attr("class", "legend-swatch matrix-swatch").style("background", routeColors.get(type));
        item.append("span").text(type);
    });
    matrixLegend.append("div").attr("class", "legend-note").text("Darker cell = longer travel time · Label strip = district");
}

function drawNetwork(nodes, routes) {
    const width = 960, height = 650;
    const sizeScale = d3.scaleSqrt().domain(d3.extent(nodes, d => d.daily_passengers)).range([7, 19]);
    const linkWidth = d3.scaleLinear().domain(d3.extent(routes, d => d.travel_time_min)).range([1.5, 7]);
    const svg = networkRoot.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-labelledby", "network-svg-title network-svg-desc");
    svg.append("title").attr("id", "network-svg-title").text("Force-directed urban transit network");
    svg.append("desc").attr("id", "network-svg-desc").text("Fifty stations connected by fifty routes. Node color, size, and shape encode station attributes; link color and width encode route attributes.");
    const networkNodes = nodes.map(node => ({...node}));
    const networkRoutes = routes.map(route => ({...route}));
    const linked = new Set(routes.flatMap(route => [`${route.source}|${route.target}`, `${route.target}|${route.source}`]));
    const links = svg.append("g").attr("class", "network-links").selectAll("line").data(networkRoutes).join("line")
        .attr("stroke", d => routeColors.get(d.route_type)).attr("stroke-width", d => linkWidth(d.travel_time_min)).attr("tabindex", 0)
        .attr("aria-label", d => `${d.route_type} route from ${d.source} to ${d.target}, ${d.travel_time_min} minutes`);
    const nodeGroups = svg.append("g").attr("class", "network-nodes").selectAll("g").data(networkNodes).join("g")
        .attr("class", "network-node").attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", d => `${d.station_name}, ${d.district}, ${d.station_type}, ${d.daily_passengers.toLocaleString()} daily passengers`);
    nodeGroups.append("path").attr("d", d => d3.symbol().type(shapeTypes.get(d.station_type)).size(Math.PI * sizeScale(d.daily_passengers) ** 2)()).attr("fill", d => districtColors.get(d.district));
    nodeGroups.append("text").attr("class", "node-number").attr("dy", "0.35em").text(d => d.id.slice(1));

    function emphasize(focus) {
        const neighbors = new Set(networkNodes.filter(node => node.id === focus.id || linked.has(`${focus.id}|${node.id}`)).map(node => node.id));
        nodeGroups.classed("dimmed", node => !neighbors.has(node.id));
        links.classed("dimmed", link => link.source.id !== focus.id && link.target.id !== focus.id).classed("emphasized", link => link.source.id === focus.id || link.target.id === focus.id);
    }
    function restore() { nodeGroups.classed("dimmed", false); links.classed("dimmed", false).classed("emphasized", false); }
    nodeGroups.on("pointerenter focus", function(event, d) {
        emphasize(d);
        showTooltip(networkTooltip, networkRoot, event, this, `<strong>${d.station_name}</strong><span>District: ${d.district}</span><span>Type: ${d.station_type}</span><span>Daily passengers: ${d.daily_passengers.toLocaleString()}</span>`);
    }).on("pointerleave blur", () => { restore(); hideTooltip(networkTooltip); });
    links.on("pointerenter focus", function(event, d) {
        d3.select(this).classed("emphasized", true);
        showTooltip(networkTooltip, networkRoot, event, this, `<strong>${d.source.station_name} – ${d.target.station_name}</strong><span>Route: ${d.route_type}</span><span>Travel time: ${d.travel_time_min} minutes</span>`);
    }).on("pointerleave blur", function() { d3.select(this).classed("emphasized", false); hideTooltip(networkTooltip); });

    const simulation = d3.forceSimulation(networkNodes).randomSource(d3.randomLcg(401))
        .force("link", d3.forceLink(networkRoutes).id(d => d.id).distance(d => 70 + d.travel_time_min * 5).strength(0.65))
        .force("charge", d3.forceManyBody().strength(-190)).force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(d => sizeScale(d.daily_passengers) + 9));
    nodeGroups.call(d3.drag()
        .on("start", (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (event, d) => { d.fx = Math.max(24, Math.min(width - 24, event.x)); d.fy = Math.max(24, Math.min(height - 24, event.y)); })
        .on("end", (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));
    simulation.on("tick", () => {
        networkNodes.forEach(d => { const r = sizeScale(d.daily_passengers) + 6; d.x = Math.max(r, Math.min(width - r, d.x)); d.y = Math.max(r, Math.min(height - r, d.y)); });
        links.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        nodeGroups.attr("transform", d => `translate(${d.x},${d.y})`);
    });
}

function drawMatrix(nodes, routes) {
    const ordered = [...nodes].sort((a, b) => d3.ascending(districtOrder.indexOf(a.district), districtOrder.indexOf(b.district)) || d3.ascending(stationTypeOrder.indexOf(a.station_type), stationTypeOrder.indexOf(b.station_type)) || d3.ascending(+a.id.slice(1), +b.id.slice(1)));
    const ids = ordered.map(d => d.id), byId = new Map(nodes.map(d => [d.id, d])), linkMap = new Map();
    routes.forEach(route => { linkMap.set(`${route.source}|${route.target}`, route); linkMap.set(`${route.target}|${route.source}`, route); });
    const matrix = ids.flatMap(row => ids.map(col => ({row, col, route: linkMap.get(`${row}|${col}`) || null})));
    const width = 820, height = 820, margin = {top: 140, right: 26, bottom: 26, left: 140};
    const x = d3.scaleBand().domain(ids).range([margin.left, width - margin.right]).paddingInner(0.06);
    const y = d3.scaleBand().domain(ids).range([margin.top, height - margin.bottom]).paddingInner(0.06);
    const opacity = d3.scaleLinear().domain(d3.extent(routes, d => d.travel_time_min)).range([0.34, 1]);
    const svg = matrixRoot.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-labelledby", "matrix-svg-title matrix-svg-desc");
    svg.append("title").attr("id", "matrix-svg-title").text("Urban transit adjacency matrix");
    svg.append("desc").attr("id", "matrix-svg-desc").text("Rows and columns are stations ordered by district. Colored cells show direct routes, with route type shown by color and travel time by opacity.");
    svg.selectAll("rect.matrix-cell").data(matrix).join("rect").attr("class", d => `matrix-cell${d.route ? " connected" : ""}`)
        .attr("x", d => x(d.col)).attr("y", d => y(d.row)).attr("width", x.bandwidth()).attr("height", y.bandwidth())
        .attr("fill", d => d.route ? routeColors.get(d.route.route_type) : "#fff8fa").attr("fill-opacity", d => d.route ? opacity(d.route.travel_time_min) : 1)
        .attr("tabindex", d => d.route ? 0 : null).attr("aria-label", d => d.route ? `${byId.get(d.row).station_name} and ${byId.get(d.col).station_name}: ${d.route.route_type}, ${d.route.travel_time_min} minutes` : null)
        .on("pointerenter focus", function(event, d) { if (d.route) showTooltip(matrixTooltip, matrixRoot, event, this, `<strong>${byId.get(d.row).station_name} – ${byId.get(d.col).station_name}</strong><span>Route: ${d.route.route_type}</span><span>Travel time: ${d.route.travel_time_min} minutes</span>`); })
        .on("pointerleave blur", () => hideTooltip(matrixTooltip));
    svg.selectAll("text.row-label").data(ordered).join("text").attr("class", "matrix-label row-label").attr("x", margin.left - 12).attr("y", d => y(d.id) + y.bandwidth() / 2).attr("dy", "0.32em").attr("text-anchor", "end").text(d => d.id.slice(1));
    svg.selectAll("text.column-label").data(ordered).join("text").attr("class", "matrix-label column-label").attr("transform", d => `translate(${x(d.id) + x.bandwidth() / 2},${margin.top - 12}) rotate(-55)`).attr("text-anchor", "start").text(d => d.id.slice(1));
    svg.selectAll("rect.row-district").data(ordered).join("rect").attr("class", "matrix-district-strip").attr("x", margin.left - 8).attr("y", d => y(d.id)).attr("width", 5).attr("height", y.bandwidth()).attr("fill", d => districtColors.get(d.district));
    svg.selectAll("rect.column-district").data(ordered).join("rect").attr("class", "matrix-district-strip").attr("x", d => x(d.id)).attr("y", margin.top - 8).attr("width", x.bandwidth()).attr("height", 5).attr("fill", d => districtColors.get(d.district));
    svg.append("text").attr("class", "matrix-axis-title").attr("x", (margin.left + width - margin.right) / 2).attr("y", 25).attr("text-anchor", "middle").text("Column station ID");
    svg.append("text").attr("class", "matrix-axis-title").attr("transform", "rotate(-90)").attr("x", -(margin.top + height - margin.bottom) / 2).attr("y", 24).attr("text-anchor", "middle").text("Row station ID");
}

async function createLab5() {
    try {
        const [nodes, routes] = await Promise.all([
            d3.csv("../data/lab5_assignment_stations.csv", d => ({...d, daily_passengers: +d.daily_passengers})),
            d3.csv("../data/lab5_assignment_routes.csv", d => ({...d, travel_time_min: +d.travel_time_min}))
        ]);
        if (nodes.length !== 50 || routes.length !== 50) throw new Error("The assignment requires exactly 50 stations and 50 routes.");
        const ids = new Set(nodes.map(d => d.id));
        if (ids.size !== nodes.length || routes.some(d => !ids.has(d.source) || !ids.has(d.target))) throw new Error("Invalid station IDs or route endpoints.");
        addLegend(); drawNetwork(nodes, routes); drawMatrix(nodes, routes);
    } catch (error) {
        console.error("Unable to create the Lab 5 visualizations:", error);
        networkRoot.append("p").attr("class", "error-message").text("The network data could not be loaded. Please refresh the page.");
        matrixRoot.append("p").attr("class", "error-message").text("The adjacency matrix could not be loaded. Please refresh the page.");
    }
}

createLab5();
