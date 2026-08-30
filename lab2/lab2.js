async function createCityMatrix() {
    const container = d3.select("#city-matrix");

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
        const height = 690;
        const margin = { top: 100, right: 34, bottom: 190, left: 120 };
        const regions = ["North", "South", "East", "West"];
        const developmentLevels = ["High", "Medium", "Low"];

        const x = d3.scaleBand()
            .domain(regions)
            .range([margin.left, width - margin.right])
            .paddingInner(0.08);

        const y = d3.scaleBand()
            .domain(developmentLevels)
            .range([margin.top, height - margin.bottom])
            .paddingInner(0.08);

        const radius = d3.scaleSqrt()
            .domain([0, d3.max(data, d => d.population)])
            .range([0, 31]);

        const temperature = d3.scaleSequential()
            .domain(d3.extent(data, d => d.temp_c))
            .interpolator(d3.interpolateRgbBasis([
                "#fce4ec",
                "#f59ab5",
                "#e45683",
                "#9b1b51"
            ]));

        const groupedCells = d3.group(
            data,
            d => `${d.region}|${d.development_level}`
        );

        groupedCells.forEach(cities => {
            cities.sort((a, b) => d3.ascending(a.city, b.city));
            cities.forEach((city, index) => {
                city.cellIndex = index;
                city.cellCount = cities.length;
            });
        });

        const svg = container
            .append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-labelledby", "city-matrix-title city-matrix-description");

        svg.append("title")
            .attr("id", "city-matrix-title")
            .text("City multivariate regional bubble matrix");

        svg.append("desc")
            .attr("id", "city-matrix-description")
            .text("Twelve cities grouped by region and development level. Bubble size represents population and color represents average temperature.");

        const tooltip = container
            .append("div")
            .attr("class", "city-tooltip")
            .attr("role", "tooltip")
            .attr("aria-hidden", "true");

        const cellData = d3.cross(regions, developmentLevels);

        svg.append("g")
            .attr("class", "matrix-cells")
            .selectAll("rect")
            .data(cellData)
            .join("rect")
            .attr("x", d => x(d[0]))
            .attr("y", d => y(d[1]))
            .attr("width", x.bandwidth())
            .attr("height", y.bandwidth())
            .attr("rx", 12)
            .attr("class", (d, i) => `matrix-cell ${i % 2 ? "alternate" : ""}`);

        svg.append("text")
            .attr("class", "matrix-axis-title")
            .attr("x", (margin.left + width - margin.right) / 2)
            .attr("y", 35)
            .attr("text-anchor", "middle")
            .text("Region");

        svg.append("g")
            .attr("class", "region-labels")
            .selectAll("text")
            .data(regions)
            .join("text")
            .attr("x", d => x(d) + x.bandwidth() / 2)
            .attr("y", margin.top - 24)
            .attr("text-anchor", "middle")
            .text(d => d);

        svg.append("text")
            .attr("class", "matrix-axis-title")
            .attr("transform", "rotate(-90)")
            .attr("x", -(margin.top + height - margin.bottom) / 2)
            .attr("y", 28)
            .attr("text-anchor", "middle")
            .text("Development Level");

        svg.append("g")
            .attr("class", "development-labels")
            .selectAll("text")
            .data(developmentLevels)
            .join("text")
            .attr("x", margin.left - 20)
            .attr("y", d => y(d) + y.bandwidth() / 2 + 5)
            .attr("text-anchor", "end")
            .text(d => d);

        function cityX(d) {
            const center = x(d.region) + x.bandwidth() / 2;
            const spacing = Math.min(66, x.bandwidth() / Math.max(d.cellCount, 1));
            return center + (d.cellIndex - (d.cellCount - 1) / 2) * spacing;
        }

        function cityY(d) {
            return y(d.development_level) + y.bandwidth() / 2;
        }

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
            .attr("transform", d => `translate(${cityX(d)}, ${cityY(d)})`)
            .attr("tabindex", 0)
            .attr("role", "graphics-symbol")
            .attr("aria-label", d => `${d.city}: population ${d.population} million, temperature ${d.temp_c} degrees Celsius, ${d.development_level} development, ${d.region} region`)
            .on("pointerenter", showTooltip)
            .on("pointermove", showTooltip)
            .on("pointerleave", hideTooltip)
            .on("focus", showFocusedTooltip)
            .on("blur", hideTooltip);

        marks.append("circle")
            .attr("r", d => radius(d.population))
            .attr("fill", d => temperature(d.temp_c))
            .attr("stroke", "#ffffff")
            .attr("stroke-width", 3);

        marks.append("text")
            .attr("class", "city-initial")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .text(d => d.city.slice(0, 1));

        const legendY = height - 135;
        const sizeLegend = svg.append("g")
            .attr("class", "size-legend")
            .attr("transform", `translate(${margin.left}, ${legendY})`);

        sizeLegend.append("text")
            .attr("class", "legend-title")
            .attr("y", -24)
            .text("Population (millions)");

        const sizeValues = [0.5, 1.8, 3.2];
        let sizeOffset = 0;

        sizeValues.forEach(value => {
            const r = radius(value);
            const item = sizeLegend.append("g")
                .attr("transform", `translate(${sizeOffset + r}, 4)`);

            item.append("circle")
                .attr("r", r)
                .attr("class", "size-legend-circle");

            item.append("text")
                .attr("class", "legend-label")
                .attr("x", 0)
                .attr("y", r + 20)
                .attr("text-anchor", "middle")
                .text(value.toFixed(1));

            sizeOffset += r * 2 + 42;
        });

        const colorLegendX = 570;
        const colorLegendWidth = 280;
        const gradientId = "temperature-gradient";
        const gradient = svg.append("defs")
            .append("linearGradient")
            .attr("id", gradientId)
            .attr("x1", "0%")
            .attr("x2", "100%");

        d3.range(0, 1.01, 0.1).forEach(stop => {
            const domain = temperature.domain();
            gradient.append("stop")
                .attr("offset", `${stop * 100}%`)
                .attr("stop-color", temperature(domain[0] + stop * (domain[1] - domain[0])));
        });

        const colorLegend = svg.append("g")
            .attr("class", "color-legend")
            .attr("transform", `translate(${colorLegendX}, ${legendY})`);

        colorLegend.append("text")
            .attr("class", "legend-title")
            .attr("y", -24)
            .text("Average temperature (°C)");

        colorLegend.append("rect")
            .attr("width", colorLegendWidth)
            .attr("height", 18)
            .attr("rx", 9)
            .attr("fill", `url(#${gradientId})`);

        const colorLegendScale = d3.scaleLinear()
            .domain(temperature.domain())
            .range([0, colorLegendWidth]);

        colorLegend.append("g")
            .attr("class", "legend-axis")
            .attr("transform", "translate(0, 20)")
            .call(d3.axisBottom(colorLegendScale).ticks(5).tickFormat(d => `${d}°`));
    } catch (error) {
        console.error("Unable to create the Lab 2 city visualization:", error);
        container
            .append("p")
            .attr("class", "error-message")
            .text("The city dataset could not be loaded. Please try refreshing the page.");
    }
}

createCityMatrix();
