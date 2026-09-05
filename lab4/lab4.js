const chartRoot = d3.select("#lab4-chart");
const tooltip = d3.select("#lab4-tooltip");
const sentimentOrder = ["Negative", "Neutral", "Positive"];
const categoryOrder = ["Hate speech", "Offensive language", "Neither"];
const colors = new Map([["Negative", "#8f1d4d"], ["Neutral", "#e69ab6"], ["Positive", "#d94f7e"]]);

async function createVisualization() {
    try {
        const rows = await d3.csv("../data/lab4_sentiment_by_category.csv", row => ({...row, count: +row.count, average_score: +row.average_score, proportion: +row.proportion}));
        if (!rows.length || rows.some(row => !Number.isFinite(row.count) || !Number.isFinite(row.proportion))) throw new Error("Incomplete aggregate data.");
        const width = 900, height = 500, margin = {top: 72, right: 36, bottom: 92, left: 90};
        const x = d3.scaleBand().domain(categoryOrder).range([margin.left, width - margin.right]).padding(0.28);
        const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);
        const grouped = d3.group(rows, row => row.annotation_category);
        const input = categoryOrder.map(category => {
            const values = new Map((grouped.get(category) || []).map(row => [row.sentiment, row]));
            return {category, ...Object.fromEntries(sentimentOrder.map(sentiment => [sentiment, values.get(sentiment)?.proportion || 0]))};
        });
        const stacked = d3.stack().keys(sentimentOrder)(input);
        const svg = chartRoot.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-labelledby", "lab4-chart-title lab4-chart-desc");
        svg.append("title").attr("id", "lab4-chart-title").text("RoBERTa sentiment distribution by annotation category");
        svg.append("desc").attr("id", "lab4-chart-desc").text("One hundred percent stacked bars compare negative, neutral, and positive model sentiment across three human annotation categories.");
        svg.append("g").attr("class", "grid-lines").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(width-margin.left-margin.right)).tickFormat(""));
        svg.append("g").attr("class", "plot-axis").attr("transform", `translate(0,${height-margin.bottom})`).call(d3.axisBottom(x));
        svg.append("g").attr("class", "plot-axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));
        svg.append("text").attr("class", "axis-title").attr("x", width/2).attr("y", height-24).attr("text-anchor", "middle").text("Human annotation category");
        svg.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("x", -240).attr("y", 24).attr("text-anchor", "middle").text("Share of tweets");
        const lookup = new Map(rows.map(row => [`${row.annotation_category}|${row.sentiment}`, row]));
        svg.selectAll("g.sentiment-layer").data(stacked).join("g").attr("fill", layer => colors.get(layer.key)).selectAll("rect")
            .data(layer => layer.map(value => ({value, sentiment: layer.key}))).join("rect").attr("class", "sentiment-segment").attr("tabindex", 0)
            .attr("x", item => x(item.value.data.category)).attr("width", x.bandwidth()).attr("y", item => y(item.value[1])).attr("height", item => y(item.value[0])-y(item.value[1]))
            .attr("aria-label", item => { const row=lookup.get(`${item.value.data.category}|${item.sentiment}`); return `${item.value.data.category}, ${item.sentiment}: ${row.count} tweets, ${d3.format(".1%")(row.proportion)}`; })
            .on("pointerenter focus", function(event,item) { const row=lookup.get(`${item.value.data.category}|${item.sentiment}`), box=chartRoot.node().getBoundingClientRect(), mark=this.getBoundingClientRect(), pointerX=Number.isFinite(event.clientX)?event.clientX:mark.left+mark.width/2, pointerY=Number.isFinite(event.clientY)?event.clientY:mark.top; tooltip.html(`<strong>${item.value.data.category}</strong><span>${item.sentiment}: ${row.count.toLocaleString()} tweets</span><span>Share: ${d3.format(".1%")(row.proportion)}</span><span>Mean score: ${d3.format("+.3f")(row.average_score)}</span>`).style("left",`${pointerX-box.left}px`).style("top",`${pointerY-box.top}px`).classed("visible",true); })
            .on("pointerleave blur", () => tooltip.classed("visible",false));
        const legend=svg.append("g").attr("class","sentiment-legend").attr("transform",`translate(${margin.left},28)`);
        const items=legend.selectAll("g").data(sentimentOrder).join("g").attr("transform",(_,i)=>`translate(${i*150},0)`);
        items.append("rect").attr("width",18).attr("height",18).attr("rx",3).attr("fill",sentiment=>colors.get(sentiment));
        items.append("text").attr("x",26).attr("y",14).text(sentiment=>sentiment);
    } catch (error) {
        console.error("Unable to create the Lab 4 visualization:", error);
        chartRoot.append("p").attr("class", "error-message").text("The sentiment visualization could not be loaded. Please refresh the page.");
    }
}
createVisualization();
