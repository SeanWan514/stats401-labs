import Foundation
import NaturalLanguage

guard CommandLine.arguments.count == 3 else {
    fputs("Usage: swift embed_passages.swift passages.json embeddings.json\n", stderr)
    exit(1)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let inputData = try Data(contentsOf: inputURL)
guard let passages = try JSONSerialization.jsonObject(with: inputData) as? [[String: Any]],
      let embedding = NLEmbedding.sentenceEmbedding(for: .english) else {
    fputs("Unable to load passages or the macOS English sentence embedding.\n", stderr)
    exit(1)
}

var output: [[String: Any]] = []
for passage in passages {
    guard let passageID = passage["passage_id"] as? String,
          let text = passage["text_clean"] as? String else { continue }
    let vector = embedding.vector(for: text) ?? []
    output.append(["passage_id": passageID, "embedding": vector])
}

let outputData = try JSONSerialization.data(withJSONObject: output, options: [])
try outputData.write(to: outputURL, options: .atomic)
print("Generated \(output.count) semantic vectors with Apple's English sentence embedding.")
