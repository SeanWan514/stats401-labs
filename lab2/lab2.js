async function createCityScatterplot() {
    const container = d3.select("#city-scatterplot");

    try {
        const data = await d3.csv("../data/cities_multivariate.csv", d => ({
            city: d.city,
            population: +d.population,
            temp_c: +d.temp_c,
            development_level: d.development_level,
            region: d.region
        }));

        const expectedColumns = [
            "city",
            "population",
            "temp_c",
            "development_level",
            "region"
        ];

        if (data.length !== 12 || data.some(d => (
            !d.city ||
            !Number.isFinite(d.population) ||
            !Number.isFinite(d.temp_c) ||
            !d.development_level ||
            !d.region
        ))) {
            throw new Error(`Expected 12 complete rows with columns: ${expectedColumns.join(", ")}.`);
        }

        const width = 940;
        const height = 610;
        const margin = { top: 54, right: 230, bottom: 82, left: 86 };
        const regions = ["North", "South", "East", "West"];
        const developmentLevels = ["Low", "Medium", "High"];
        const regionColors = d3.scaleOrdinal(regions, [
            "#2f6f9f",
            "#d85d5d",
            "#2f8b68",
            "#8557a8"
        ]);
        const regionSymbols = d3.scaleOrdinal(regions, [
            d3.symbolCircle,
            d3.symbolTriangle,
            d3.symbolSquare,
            d3.symbolDiamond
        ]);
        const symbolArea = d3.scaleOrdinal(developmentLevels, [120, 300, 540]);
        const labelOffsets = new Map([
            ["Aurora", { x: -14, y: 18, anchor: "end" }],
            ["Kingston", { x: 14, y: -10, anchor: "start" }]
        ]);

        const x = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.population)])
            .nice()
            .range([margin.left, width - margin.right]);

        const y = d3.scaleLinear()
            .domain(d3.extent(data, d => d.temp_c))
            .nice()
            .range([height - margin.bottom, margin.top]);

        const svg = container
            .append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-labelledby", "city-scatter-title city-scatter-description");

        svg.append("title")
            .attr("id", "city-scatter-title")
            .text("Population and temperature across twelve cities");

        svg.append("desc")
            .attr("id", "city-scatter-description")
            .text("A scatterplot with population on the horizontal axis and temperature on the vertical axis. Symbol size represents development level, while color and shape represent region.");

        const tooltip = container
            .append("div")
            .attr("class", "city-tooltip")
            .attr("role", "tooltip")
            .attr("aria-hidden", "true");

        svg.append("g")
            .attr("class", "grid-lines")
            .attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).ticks(7).tickSize(-(height - margin.top - margin.bottom)).tickFormat(""));

        svg.append("g")
            .attr("class", "grid-lines")
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).ticks(7).tickSize(-(width - margin.left - margin.right)).tickFormat(""));

        svg.append("g")
            .attr("class", "plot-axis")
            .attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).ticks(7).tickFormat(d => d.toFixed(1)));

        svg.append("g")
            .attr("class", "plot-axis")
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).ticks(7).tickFormat(d => `${d}°`));

        svg.append("text")
            .attr("class", "axis-title")
            .attr("x", (margin.left + width - margin.right) / 2)
            .attr("y", height - 20)
            .attr("text-anchor", "middle")
            .text("Population (millions)");

        svg.append("text")
            .attr("class", "axis-title")
            .attr("transform", "rotate(-90)")
            .attr("x", -(margin.top + height - margin.bottom) / 2)
            .attr("y", 22)
            .attr("text-anchor", "middle")
            .text("Average temperature (°C)");

        function showTooltip(event, d) {
            const bounds = container.node().getBoundingClientRect();

            tooltip
                .html(`
                    <strong>${d.city}</strong>
                    <span>Population: ${d.population.toFixed(1)} million</span>
                    <span>Temperature: ${d.temp_c.toFixed(1)}&deg;C</span>
                    <span>Development: ${d.development_level}</span>
                    <span>Region: ${d.region}</span>
                `)
                .style("left", `${event.clientX - bounds.left + container.node().scrollLeft}px`)
                .style("top", `${event.clientY - bounds.top + container.node().scrollTop}px`)
                .attr("aria-hidden", "false")
                .classed("visible", true);
        }

        function showFocusedTooltip(event, d) {
            const markBounds = event.currentTarget.getBoundingClientRect();
            showTooltip({
                clientX: markBounds.left + markBounds.width / 2,
                clientY: markBounds.top
            }, d);
        }

        function hideTooltip() {
            tooltip
                .attr("aria-hidden", "true")
                .classed("visible", false);
        }

        const marks = svg.append("g")
            .attr("class", "city-marks")
            .selectAll("g")
            .data(data, d => d.city)
            .join("g")
            .attr("class", "city-mark")
            .attr("transform", d => `translate(${x(d.population)}, ${y(d.temp_c)})`)
            .attr("tabindex", 0)
            .attr("role", "graphics-symbol")
            .attr("aria-label", d => `${d.city}: population ${d.population} million, temperature ${d.temp_c} degrees Celsius, ${d.development_level} development, ${d.region} region`)
            .on("pointerenter", showTooltip)
            .on("pointermove", showTooltip)
            .on("pointerleave", hideTooltip)
            .on("focus", showFocusedTooltip)
            .on("blur", hideTooltip);

        marks.append("path")
            .attr("class", "city-point")
            .attr("d", d => d3.symbol()
                .type(regionSymbols(d.region))
                .size(symbolArea(d.development_level))())
            .attr("fill", d => regionColors(d.region))
            .attr("stroke", "#ffffff")
            .attr("stroke-width", 2.5);

        marks.append("text")
            .attr("class", "city-label")
            .attr("x", d => labelOffsets.get(d.city)?.x ?? Math.sqrt(symbolArea(d.development_level)) / 2 + 9)
            .attr("y", d => labelOffsets.get(d.city)?.y ?? -8)
            .attr("text-anchor", d => labelOffsets.get(d.city)?.anchor ?? "start")
            .text(d => d.city);

        const regionLegend = svg.append("g")
            .attr("class", "region-legend")
            .attr("transform", `translate(${width - margin.right + 52}, ${margin.top + 12})`);

        regionLegend.append("text")
            .attr("class", "legend-title")
            .text("Region");

        const regionItems = regionLegend.selectAll("g")
            .data(regions)
            .join("g")
            .attr("class", "region-legend-item")
            .attr("transform", (d, i) => `translate(8, ${38 + i * 42})`);

        regionItems.append("path")
            .attr("d", d => d3.symbol().type(regionSymbols(d)).size(150)())
            .attr("fill", d => regionColors(d));

        regionItems.append("text")
            .attr("class", "legend-label")
            .attr("x", 24)
            .attr("dy", "0.35em")
            .text(d => d);

        const sizeLegend = svg.append("g")
            .attr("class", "development-legend")
            .attr("transform", `translate(${width - margin.right + 52}, ${margin.top + 250})`);

        sizeLegend.append("text")
            .attr("class", "legend-title")
            .text("Development level");

        const sizeItems = sizeLegend.selectAll("g")
            .data(developmentLevels)
            .join("g")
            .attr("class", "development-legend-item")
            .attr("transform", (d, i) => `translate(8, ${42 + i * 58})`);

        sizeItems.append("circle")
            .attr("r", d => Math.sqrt(symbolArea(d) / Math.PI))
            .attr("class", "size-legend-circle");

        sizeItems.append("text")
            .attr("class", "legend-label")
            .attr("x", 30)
            .attr("dy", "0.35em")
            .text(d => d);
    } catch (error) {
        console.error("Unable to create the Lab 2 city visualization:", error);
        container
            .append("p")
            .attr("class", "error-message")
            .text("The city dataset could not be loaded. Please try refreshing the page.");
    }
}

createCityScatterplot();
