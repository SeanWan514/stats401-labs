const tableContainer = d3.select("#book-table-container");
const statusMessage = d3.select("#table-status");
const searchForm = d3.select("#book-search-form");
const searchInput = d3.select("#book-search");

const columnDefinitions = [
    { key: "record_id", label: "ID (0001–1000)", type: "text", sortable: true },
    { key: "title", label: "Title (A–Z / Z–A)", type: "text", sortable: true },
    { key: "price_gbp", label: "Price (£, low / high)", type: "number", sortable: true },
    { key: "rating", label: "Rating (1–5 stars)", type: "number", sortable: true },
    { key: "availability", label: "Availability (A–Z / Z–A)", type: "text", sortable: true },
    { key: "page", label: "Catalogue Page (low / high)", type: "number", sortable: true },
    { key: "book_url", label: "Source", type: "text", sortable: false }
];

function normalizeRow(row) {
    return {
        record_id: row.record_id,
        title: row.title,
        price_gbp: +row.price_gbp,
        rating: +row.rating,
        availability: row.availability,
        page: +row.page,
        book_url: row.book_url
    };
}

function displayValue(row, column) {
    if (column.key === "price_gbp") {
        return `£${row.price_gbp.toFixed(2)}`;
    }
    if (column.key === "book_url") {
        return "View book";
    }
    return row[column.key];
}

function comparisonFor(column, direction) {
    const multiplier = direction === "ascending" ? 1 : -1;

    return (a, b) => {
        const comparison = column.type === "number"
            ? d3.ascending(a[column.key], b[column.key])
            : d3.ascending(
                a[column.key].toLocaleLowerCase(),
                b[column.key].toLocaleLowerCase()
            );

        return comparison * multiplier;
    };
}

async function createBookTable() {
    try {
        const books = await d3.csv("../data/lab3_data.csv", normalizeRow);

        if (books.length < 1000 || books.some(book => (
            !/^\d{4}$/.test(book.record_id) ||
            !book.title ||
            !Number.isFinite(book.price_gbp) ||
            !Number.isFinite(book.rating) ||
            !book.availability ||
            !Number.isFinite(book.page) ||
            !book.book_url
        ))) {
            throw new Error("The dataset must contain at least 1,000 complete book records.");
        }

        let visibleBooks = [...books];
        let activeSort = { key: null, direction: null };

        const table = tableContainer
            .append("table")
            .attr("id", "book-table")
            .attr("class", "data-table");

        table.append("caption")
            .text("One thousand book records acquired from Books to Scrape");

        const headerCells = table
            .append("thead")
            .append("tr")
            .selectAll("th")
            .data(columnDefinitions)
            .join("th")
            .attr("scope", "col")
            .attr("aria-sort", column => column.sortable ? "none" : null);

        const headerButtons = headerCells.filter(column => column.sortable)
            .append("button")
            .attr("type", "button")
            .attr("class", "sort-button")
            .attr("aria-label", column => `Sort by ${column.label}`)
            .on("click", function(event, column) {
                const direction = activeSort.key === column.key &&
                    activeSort.direction === "ascending"
                    ? "descending"
                    : "ascending";

                activeSort = { key: column.key, direction };
                visibleBooks.sort(comparisonFor(column, direction));

                headerCells.attr("aria-sort", heading => heading.sortable ? (
                    heading.key === column.key ? direction : "none"
                ) : null);

                headerButtons
                    .classed("active", heading => heading.key === column.key)
                    .select(".sort-indicator")
                    .text(heading => {
                        if (heading.key !== column.key) return "⇅";
                        return direction === "ascending" ? "▲" : "▼";
                    });

                renderRows();
            });

        headerButtons.append("span")
            .text(column => column.label);

        headerButtons.append("span")
            .attr("class", "sort-indicator")
            .attr("aria-hidden", "true")
            .text("⇅");

        headerCells.filter(column => !column.sortable)
            .append("span")
            .attr("class", "static-column-heading")
            .text(column => column.label);

        const tableBody = table.append("tbody");

        function renderRows() {
            const rows = tableBody
                .selectAll("tr")
                .data(visibleBooks, book => book.book_url)
                .join("tr");

            rows.selectAll("td")
                .data(book => columnDefinitions.map(column => ({ book, column })))
                .join("td")
                .each(function(cell) {
                    const tableCell = d3.select(this);
                    tableCell.selectAll("*").remove();

                    if (cell.column.key === "book_url") {
                        tableCell.append("a")
                            .attr("href", cell.book.book_url)
                            .attr("target", "_blank")
                            .attr("rel", "noopener noreferrer")
                            .text(displayValue(cell.book, cell.column));
                    } else if (cell.column.key === "rating") {
                        const stars = cell.book.rating;
                        tableCell.append("span")
                            .attr("class", "popularity-stars")
                            .attr("aria-label", `${stars} out of 5 stars`)
                            .text(`${"★".repeat(stars)}${"☆".repeat(5 - stars)}`);
                    } else {
                        tableCell.text(displayValue(cell.book, cell.column));
                    }
                });

            statusMessage.text(
                `Showing ${visibleBooks.length.toLocaleString()} of ${books.length.toLocaleString()} records`
            );
        }

        searchForm.on("submit", function(event) {
                event.preventDefault();
                const query = searchInput.property("value").trim().toLocaleLowerCase();
                visibleBooks = books.filter(book => (
                    book.record_id.includes(query) ||
                    book.title.toLocaleLowerCase().includes(query) ||
                    book.availability.toLocaleLowerCase().includes(query)
                ));

                if (activeSort.key) {
                    const column = columnDefinitions.find(
                        definition => definition.key === activeSort.key
                    );
                    visibleBooks.sort(comparisonFor(column, activeSort.direction));
                }

                renderRows();
            });

        searchInput.property("disabled", false);
        searchForm.select("button").property("disabled", false);
        renderRows();
    } catch (error) {
        console.error("Unable to create the Lab 3 data table:", error);
        statusMessage.text("The acquired book dataset could not be loaded.");
        tableContainer
            .append("p")
            .attr("class", "error-message")
            .text("The book records are unavailable. Please refresh the page.");
    }
}

createBookTable();
