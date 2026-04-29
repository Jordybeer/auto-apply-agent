import WebKit

@MainActor
final class Session: ObservableObject {
    static let shared = Session()
    private init() {}

    let baseURL = URL(string: "https://jobtide.jordy.beer")!

    func syncCookies(from store: WKHTTPCookieStore) {
        store.getAllCookies { cookies in
            for cookie in cookies {
                HTTPCookieStorage.shared.setCookie(cookie)
            }
        }
    }

    func injectCookies(into store: WKHTTPCookieStore) async {
        for cookie in HTTPCookieStorage.shared.cookies ?? [] {
            await store.setCookie(cookie)
        }
    }
}
