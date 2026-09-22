import Foundation
import PDFKit

guard CommandLine.arguments.count == 3 else {
    fputs("Usage: swift extract_bulletin.swift input.pdf output.json\n", stderr)
    exit(1)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])

guard let document = PDFDocument(url: inputURL) else {
    fputs("Unable to open the bulletin PDF.\n", stderr)
    exit(1)
}

var pages: [[String: Any]] = []
for index in 0..<document.pageCount {
    let text = document.page(at: index)?.string ?? ""
    pages.append(["page": index + 1, "text": text])
}

let payload: [String: Any] = [
    "source_file": inputURL.lastPathComponent,
    "page_count": document.pageCount,
    "pages": pages
]
let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
try data.write(to: outputURL, options: .atomic)
print("Extracted \(document.pageCount) pages to \(outputURL.path)")
