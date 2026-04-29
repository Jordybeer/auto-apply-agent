import SwiftUI
import WebKit
import SafariServices

struct MainWebView: View {
    @StateObject private var coordinator = MainWebCoordinator()

    var body: some View {
        ZStack {
            MainWebViewRepresentable(coordinator: coordinator)
                .ignoresSafeArea()

            if coordinator.isOffline {
                offlineView
            }
        }
    }

    private var offlineView: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 52))
                    .foregroundColor(.jtTextSecondary)
                Text("Geen verbinding")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.jtTextPrimary)
                Button {
                    coordinator.reload()
                } label: {
                    Text("Opnieuw proberen")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 28)
                        .padding(.vertical, 12)
                        .background(Color.jtAccent)
                        .cornerRadius(jtRadius)
                }
            }
        }
    }
}

@MainActor
final class MainWebCoordinator: NSObject, ObservableObject, WKNavigationDelegate, UIScrollViewDelegate {
    @Published var isOffline = false
    weak var webView: WKWebView?

    func reload() {
        isOffline = false
        webView?.reload()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isOffline = false
        webView.scrollView.refreshControl?.endRefreshing()
        Session.shared.syncCookies(from: webView.configuration.websiteDataStore.httpCookieStore)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        isOffline = true
        webView.scrollView.refreshControl?.endRefreshing()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        isOffline = true
        webView.scrollView.refreshControl?.endRefreshing()
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url,
              let host = url.host else {
            decisionHandler(.allow)
            return
        }

        if action.navigationType == .linkActivated && !host.contains("jobtide.jordy.beer") {
            decisionHandler(.cancel)
            DispatchQueue.main.async {
                let safari = SFSafariViewController(url: url)
                UIApplication.shared.connectedScenes
                    .compactMap { $0 as? UIWindowScene }
                    .first?.windows.first?.rootViewController?
                    .present(safari, animated: true)
            }
        } else {
            decisionHandler(.allow)
        }
    }

    @objc func handleRefresh(_ sender: UIRefreshControl) {
        webView?.reload()
    }
}

private struct MainWebViewRepresentable: UIViewRepresentable {
    let coordinator: MainWebCoordinator

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.backgroundColor = UIColor(Color.jtBackground)
        webView.isOpaque = false
        coordinator.webView = webView

        let refresh = UIRefreshControl()
        refresh.tintColor = UIColor(Color.jtAccent)
        refresh.addTarget(coordinator, action: #selector(MainWebCoordinator.handleRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        Task {
            await Session.shared.injectCookies(into: config.websiteDataStore.httpCookieStore)
            let req = URLRequest(url: Session.shared.baseURL)
            await MainActor.run { webView.load(req) }
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> MainWebCoordinator { coordinator }
}
