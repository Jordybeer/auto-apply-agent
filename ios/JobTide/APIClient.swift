import Foundation

enum AppVersion {
    static let marketing: String = {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
    }()
    static let build: String = {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
    }()
    static let clientHeader = "ios/\(marketing)+\(build)"
}

struct APIClient {
    static let webBase = URL(string: "https://jobtide.jordy.beer")!
    private static let base = webBase

    private static func makeRequest(path: String) -> URLRequest {
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.setValue(AppVersion.clientHeader, forHTTPHeaderField: "X-JobTide-Client")
        return req
    }

    static func prewarm(paths: [String]) async {
        await withTaskGroup(of: Void.self) { group in
            for path in paths {
                group.addTask { _ = try? await get(path: path) }
            }
        }
    }

    static func get(path: String) async throws -> Data {
        let req = makeRequest(path: path)
        let (data, _) = try await URLSession.shared.data(for: req)
        return data
    }

    static func post(path: String, json: [String: Any]) async throws -> Data {
        var req = makeRequest(path: path)
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

        var req = makeRequest(path: path)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        let (data, _) = try await URLSession.shared.data(for: req)
        return data
    }
}
