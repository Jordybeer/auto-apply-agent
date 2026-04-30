import SwiftUI
import WebKit
import SafariServices
import AuthenticationServices

private let nativeFlagScript = WKUserScript(
    source: "window.__JOBTIDE_NATIVE__ = true;",
    injectionTime: .atDocumentStart,
    forMainFrameOnly: true
)

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
final class MainWebCoordinator: NSObject, ObservableObject, WKNavigationDelegate, UIScrollViewDelegate, ASWebAuthenticationPresentationContextProviding {
    @Published var isOffline = false
    weak var webView: WKWebView?
    private var authSession: ASWebAuthenticationSession?

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
        guard let url = action.request.url, let host = url.host else {
            decisionHandler(.allow)
            return
        }
        guard action.targetFrame?.isMainFrame == true else {
            decisionHandler(.allow)
            return
        }
        if !host.contains("jobtide.jordy.beer") {
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated {
                // User tapped an external link — open in Safari sheet, not OAuth
                DispatchQueue.main.async {
                    let safari = SFSafariViewController(url: url)
                    self.webView?.window?.rootViewController?.present(safari, animated: true)
                }
            } else {
                // JS-driven navigation (window.location.href) — treat as OAuth redirect
                DispatchQueue.main.async { self.startOAuth(url: url) }
            }
        } else {
            decisionHandler(.allow)
        }
    }

    private func startOAuth(url: URL) {
        guard webView?.window != nil else { return }
        let session = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: "jobtide"
        ) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.webView?.load(URLRequest(url: Session.shared.baseURL))
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        authSession = session
        session.start()
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        webView?.window ?? UIWindow()
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
        config.userContentController.addUserScript(nativeFlagScript)

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
