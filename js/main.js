async function createStudentScoreChart() {
    const chart = d3.select("#chart");

    try {
        const data = await d3.csv("../data/students.csv", d => ({
            name: d.name,
            score: +d.score
        }));

        const width = 880;
        const height = 500;
        const margin = { top: 30, right: 24, bottom: 110, left: 24 };
        const baseline = height - margin.bottom;

        const x = d3.scaleBand()
            .domain(data.map(d => d.name))
            .range([margin.left, width - margin.right])
            .padding(0.25);

        const y = d3.scaleLinear()
            .domain([0, 100])
            .range([baseline, margin.top]);

        const svg = chart
            .append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-labelledby", "chart-title chart-description");

        const tooltip = chart
            .append("div")
            .attr("class", "chart-tooltip")
            .attr("role", "tooltip")
            .attr("aria-hidden", "true");

        function showTooltip(event, d) {
            const chartBounds = chart.node().getBoundingClientRect();

            tooltip
                .html(`<strong>${d.name}</strong><span>Score: ${d.score}</span>`)
                .style("left", `${event.clientX - chartBounds.left + chart.node().scrollLeft}px`)
                .style("top", `${event.clientY - chartBounds.top + chart.node().scrollTop}px`)
                .attr("aria-hidden", "false")
                .classed("visible", true);
        }

        function hideTooltip() {
            tooltip
                .attr("aria-hidden", "true")
                .classed("visible", false);
        }

        function showFocusedTooltip(event, d) {
            const barBounds = event.currentTarget.getBoundingClientRect();

            showTooltip({
                clientX: barBounds.left + barBounds.width / 2,
                clientY: barBounds.top
            }, d);
        }

        svg.append("title")
            .attr("id", "chart-title")
            .text("Student Scores");

        svg.append("desc")
            .attr("id", "chart-description")
            .text("A bar chart of scores for Alice, Bob, Carol, David, Emma, Frank, Grace, and Henry.");

        svg.selectAll("rect")
            .data(data)
            .join("rect")
            .attr("class", "bar")
            .attr("tabindex", 0)
            .attr("aria-label", d => `${d.name}: ${d.score}`)
            .attr("x", d => x(d.name))
            .attr("y", d => y(d.score))
            .attr("width", x.bandwidth())
            .attr("height", d => baseline - y(d.score))
            .attr("rx", 4)
            .on("pointerenter", showTooltip)
            .on("pointermove", showTooltip)
            .on("pointerleave", hideTooltip)
            .on("focus", showFocusedTooltip)
            .on("blur", hideTooltip);

        svg.selectAll(".name-label")
            .data(data)
            .join("text")
            .attr("class", "name-label")
            .attr("x", d => x(d.name) + x.bandwidth() / 2)
            .attr("y", baseline + 34)
            .text(d => d.name);

        svg.selectAll(".score-label")
            .data(data)
            .join("text")
            .attr("class", "score-label")
            .attr("x", d => x(d.name) + x.bandwidth() / 2)
            .attr("y", baseline + 62)
            .text(d => d.score);
    } catch (error) {
        console.error("Unable to load student scores:", error);
        chart
            .append("p")
            .attr("class", "error-message")
            .text("The student score data could not be loaded.");
    }
}

createStudentScoreChart();
