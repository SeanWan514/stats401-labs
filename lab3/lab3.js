const tableContainer = d3.select("#book-table-container");
const statusMessage = d3.select("#table-status");
const searchForm = d3.select("#book-search-form");
const searchInput = d3.select("#book-search");

const columnDefinitions = [
    { key: "record_id", label: "ID", sortHint: "0001–1200", type: "text", sortable: true },
    { key: "title", label: "Title", sortHint: "A–Z / Z–A", type: "text", sortable: true },
    { key: "author", label: "Author", sortHint: "A–Z / Z–A", type: "text", sortable: true },
    { key: "language", label: "Language", sortHint: "A–Z / Z–A", type: "text", sortable: true },
    { key: "download_count", label: "Downloads", sortHint: "Low / High", type: "number", sortable: true },
    { key: "popularity_stars", label: "Popularity", sortHint: "1–5 stars", type: "number", sortable: true },
    { key: "book_url", label: "Source", sortHint: "Book page", type: "text", sortable: false }
];

function normalizeRow(row) {
    return {
        record_id: row.record_id,
        gutenberg_id: +row.gutenberg_id,
        title: row.title,
        author: row.author,
        language: row.language,
        download_count: +row.download_count,
        popularity_stars: +row.popularity_stars,
        book_url: row.book_url
    };
}

function directionLabel(column, direction) {
    if (column.type === "text") {
        return direction === "ascending" ? "A–Z" : "Z–A";
    }
    return direction === "ascending" ? "low to high" : "high to low";
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

        const uniqueRecordIds = new Set(books.map(book => book.record_id));
        const uniqueGutenbergIds = new Set(books.map(book => book.gutenberg_id));

        if (
            books.length !== 1200 ||
            uniqueRecordIds.size !== 1200 ||
            uniqueGutenbergIds.size !== 1200 ||
            books.some(book => (
            !/^\d{4}$/.test(book.record_id) ||
            !Number.isInteger(book.gutenberg_id) ||
            !book.title ||
            !book.author ||
            !book.language ||
            !Number.isFinite(book.download_count) ||
            !Number.isInteger(book.popularity_stars) ||
            book.popularity_stars < 1 ||
            book.popularity_stars > 5 ||
            !book.book_url
            ))
        ) {
            throw new Error("The dataset must contain 1,200 complete, unique book records.");
        }

        let visibleBooks = [...books];
        let activeSort = { key: null, direction: null };

        const table = tableContainer
            .append("table")
            .attr("id", "book-table")
            .attr("class", "data-table");

        table.append("caption")
            .text("Twelve hundred book records acquired from the Gutendex API");

        const headerCells = table
            .append("thead")
            .append("tr")
            .selectAll("th")
            .data(columnDefinitions)
            .join("th")
            .attr("scope", "col")
            .attr("aria-sort", column => column.sortable ? "none" : null);

        headerCells.each(function(column) {
            const heading = d3.select(this);

            if (!column.sortable) {
                const label = heading.append("span")
                    .attr("class", "static-column-heading");
                label.append("span").text(column.label);
                label.append("small").text(column.sortHint);
                return;
            }

            const button = heading.append("button")
                .attr("type", "button")
                .attr("class", "sort-button")
                .attr("aria-label", `Sort ${column.label}: ${column.sortHint}`)
                .on("click", function() {
                    const direction = activeSort.key === column.key &&
                        activeSort.direction === "ascending"
                        ? "descending"
                        : "ascending";

                    activeSort = { key: column.key, direction };
                    visibleBooks.sort(comparisonFor(column, direction));

                    headerCells.attr("aria-sort", headingColumn => {
                        if (!headingColumn.sortable) return null;
                        return headingColumn.key === column.key ? direction : "none";
                    });

                    table.selectAll(".sort-button")
                        .classed("active", headingColumn => headingColumn.key === column.key)
                        .select(".sort-indicator")
                        .text(headingColumn => {
                            if (headingColumn.key !== column.key) return "⇅";
                            return direction === "ascending" ? "▲" : "▼";
                        });

                    renderRows();
                });

            const text = button.append("span")
                .attr("class", "sort-label");
            text.append("span").text(column.label);
            text.append("small").text(column.sortHint);

            button.append("span")
                .attr("class", "sort-indicator")
                .attr("aria-hidden", "true")
                .text("⇅");
        });

        const tableBody = table.append("tbody");

        function renderRows() {
            const rows = tableBody
                .selectAll("tr")
                .data(visibleBooks, book => book.record_id)
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
                            .text("View book");
                    } else if (cell.column.key === "download_count") {
                        tableCell.text(cell.book.download_count.toLocaleString());
                    } else if (cell.column.key === "popularity_stars") {
                        const stars = cell.book.popularity_stars;
                        tableCell.append("span")
                            .attr("class", "popularity-stars")
                            .attr("aria-label", `${stars} out of 5 popularity stars`)
                            .text(`${"★".repeat(stars)}${"☆".repeat(5 - stars)}`);
                    } else {
                        tableCell.text(cell.book[cell.column.key]);
                    }
                });

            const sortText = activeSort.key
                ? (() => {
                    const column = columnDefinitions.find(
                        definition => definition.key === activeSort.key
                    );
                    return ` Sorted by ${column.label}, ${directionLabel(column, activeSort.direction)}.`;
                })()
                : "";

            statusMessage.text(
                `Showing ${visibleBooks.length.toLocaleString()} of ${books.length.toLocaleString()} records.${sortText}`
            );
        }

        searchForm.on("submit", function(event) {
            event.preventDefault();
            const query = searchInput.property("value").trim().toLocaleLowerCase();

            visibleBooks = books.filter(book => (
                book.record_id.includes(query) ||
                book.title.toLocaleLowerCase().includes(query) ||
                book.author.toLocaleLowerCase().includes(query) ||
                book.language.toLocaleLowerCase().includes(query)
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
