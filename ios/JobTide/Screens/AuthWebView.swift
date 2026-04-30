import SwiftUI
import WebKit
import AuthenticationServices
import SafariServices

struct AuthWebView: View {
    @EnvironmentObject var appState: AppStateManager

    var body: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()
            VStack(spacing: 0) {
                Text("Inloggen of registreren")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.jtTextSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)

                AuthWebViewRepresentable { step in
                    withAnimation(jtTransitionSpring) { appState.advance(from: step) }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}

private struct AuthWebViewRepresentable: UIViewRepresentable {
    var onAuthenticated: (OnboardingStep) -> Void

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.backgroundColor = UIColor(Color.jtBackground)
        webView.isOpaque = false
        webView.scrollView.showsVerticalScrollIndicator = false
        context.coordinator.webView = webView

        if let url = URL(string: "https://jobtide.jordy.beer/login") {
            webView.load(URLRequest(url: url))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onAuthenticated: onAuthenticated)
    }

    final class Coordinator: NSObject, WKNavigationDelegate, ASWebAuthenticationPresentationContextProviding, SFSafariViewControllerDelegate {
        var onAuthenticated: (OnboardingStep) -> Void
        private var didAdvance = false
        weak var webView: WKWebView?
        private var authSession: ASWebAuthenticationSession?

        init(onAuthenticated: @escaping (OnboardingStep) -> Void) {
            self.onAuthenticated = onAuthenticated
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Session.shared.syncCookies(from: webView.configuration.websiteDataStore.httpCookieStore)

            guard !didAdvance, let url = webView.url else { return }
            let path = url.path
            if path == "/" || path == "/onboarding" || (!path.contains("login") && !path.contains("auth")) {
                didAdvance = true
                DispatchQueue.main.async { self.onAuthenticated(.auth) }
            }
        }

        func webView(_ webView: WKWebView,
                     decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url, let host = url.host else {
                decisionHandler(.allow)
                return
            }
            // Only intercept top-level navigation; subresource loads (fonts, scripts, etc.)
            // must be allowed or the page won't render.
            guard action.targetFrame?.isMainFrame == true else {
                decisionHandler(.allow)
                return
            }
            if !host.contains("jobtide.jordy.beer") {
                decisionHandler(.cancel)
                DispatchQueue.main.async { self.startOAuth(url: url) }
            } else {
                decisionHandler(.allow)
            }
        }

        private func startOAuth(url: URL) {
            guard let anchor = webView?.window else { return }
            let session = ASWebAuthenticationSession(
                url: url,
                callback: .https(host: "jobtide.jordy.beer", path: "/auth/callback")
            ) { [weak self] callbackURL, error in
                if let callbackURL {
                    DispatchQueue.main.async {
                        self?.webView?.load(URLRequest(url: callbackURL))
                    }
                } else if error != nil {
                    // ASWebAuth failed or was cancelled — fall back to SFSafariViewController
                    DispatchQueue.main.async { self?.openInSafari(url: url, anchor: anchor) }
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            authSession = session
            if !session.start() {
                openInSafari(url: url, anchor: anchor)
            }
        }

        private func openInSafari(url: URL, anchor: UIWindow) {
            let safari = SFSafariViewController(url: url)
            safari.delegate = self
            anchor.rootViewController?.present(safari, animated: true)
        }

        // SFSafariViewControllerDelegate: when dismissed after auth, reload WKWebView so
        // didFinish can detect the authenticated state if cookies synced.
        func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
            webView?.reload()
        }

        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
            webView?.window ?? UIWindow()
        }
    }
}
