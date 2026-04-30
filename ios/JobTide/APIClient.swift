import Foundation

struct APIClient {
    private static let base = URL(string: "https://jobtide.jordy.beer")!

    static func get(path: String) async throws -> Data {
        let req = URLRequest(url: base.appendingPathComponent(path))
        let (data, _) = try await URLSession.shared.data(for: req)
        return data
    }

    static func post(path: String, json: [String: Any]) async throws -> Data {
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: json)
        let (data, _) = try await URLSession.shared.data(for: req)
        return data
    }

    static func postMultipart(path: String, fileData: Data, fileName: String) async throws -> Data {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()

        func append(_ string: String) {
            if let d = string.data(using: .utf8) { body.append(d) }
        }

        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"cv\"; filename=\"\(fileName)\"\r\n")
        append("Content-Type: application/pdf\r\n\r\n")
        body.append(fileData)
        append("\r\n--\(boundary)--\r\n")

        var req = URLRequest(url: base.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        let (data, _) = try await URLSession.shared.data(for: req)
        return data
    }
}
