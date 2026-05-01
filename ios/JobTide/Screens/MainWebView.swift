import SwiftUI
import WebKit
import SafariServices
import AuthenticationServices

private let nativeFlagScript = WKUserScript(
    source: "window.__JOBTIDE_NATIVE__ = true;",
    injectionTime: .atDocumentStart,
    forMainFrameOnly: true
)

private let antiFOUCScript = WKUserScript(
    source: """
    (function() {
        var s = document.createElement('style');
        s.textContent = 'html,body{background:#0A0A0A!important;color-scheme:dark}';
        (document.head || document.documentElement).appendChild(s);
    })();
    """,
    injectionTime: .atDocumentStart,
    forMainFrameOnly: true
)

struct MainWebView: View {
    @StateObject private var coordinator = MainWebCoordinator()

    var body: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()

            MainWebViewRepresentable(coordinator: coordinator)
                .ignoresSafeArea()
                .opacity(coordinator.firstPaintDone ? 1 : 0)
                .animation(.easeOut(duration: 0.3), value: coordinator.firstPaintDone)

            if !coordinator.firstPaintDone && !coordinator.isOffline {
                skeletonView
                    .transition(.opacity)
            }

            if coordinator.isOffline {
                offlineView
            }
        }
    }

    private var skeletonView: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()
            PulsingCircle(diameter: 140)
            Image(systemName: "briefcase.fill")
                .font(.jt(36, .semibold))
                .foregroundColor(.jtAccent)
        }
    }

    private var offlineView: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "wifi.slash")
                    .font(.jt(52))
                    .foregroundColor(.jtTextSecondary)
                Text("Geen verbinding")
                    .font(.jt(20, .semibold))
                    .foregroundColor(.jtTextPrimary)
                Button {
                    coordinator.reload()
                } label: {
                    Text("Opnieuw proberen")
                        .font(.jt(16, .medium))
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
    @Published var firstPaintDone = false
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
        if !firstPaintDone {
            firstPaintDone = true
        }
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
        if host.contains("jobtide.jordy.beer") && url.path.hasPrefix("/auth/start") {
            decisionHandler(.cancel)
            DispatchQueue.main.async { self.launchAuthSession(url: url) }
            return
        }
        if host.contains("jobtide.jordy.beer") && url.path.hasPrefix("/onboarding") {
            decisionHandler(.cancel)
            NotificationCenter.default.post(name: .jtShowNativeOnboarding, object: nil)
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
        guard let wv = webView, wv.window != nil else { return }
        // Bridge WKWebView cookies → HTTPCookieStorage.shared so ASWebAuthenticationSession
        // (which uses Safari's store) receives the Supabase PKCE code-verifier cookie.
        wv.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
            cookies.forEach { HTTPCookieStorage.shared.setCookie($0) }
            DispatchQueue.main.async { self?.launchAuthSession(url: url) }
        }
    }

    private func launchAuthSession(url: URL) {
        guard let wv = webView, wv.window != nil else { return }
        let session = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: "jobtide"
        ) { [weak self] callbackURL, _ in
            DispatchQueue.main.async {
                let dest = Self.nativeDoneURL(from: callbackURL) ?? Session.shared.baseURL
                self?.webView?.load(URLRequest(url: dest))
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

    private static func nativeDoneURL(from callbackURL: URL?) -> URL? {
        guard let cb = callbackURL,
              let comps = URLComponents(url: cb, resolvingAgainstBaseURL: false),
              let at = comps.queryItems?.first(where: { $0.name == "at" })?.value,
              let rt = comps.queryItems?.first(where: { $0.name == "rt" })?.value,
              var dest = URLComponents(string: "https://jobtide.jordy.beer/auth/native-done")
        else { return nil }
        dest.queryItems = [URLQueryItem(name: "at", value: at),
                           URLQueryItem(name: "rt", value: rt)]
        return dest.url
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
        config.userContentController.addUserScript(antiFOUCScript)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = coordinator
        webView.allowsBackForwardNavigationGestures = false
        webView.backgroundColor = UIColor(Color.jtBackground)
        webView.scrollView.backgroundColor = UIColor(Color.jtBackground)
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
