import SwiftUI
import WebKit
import AuthenticationServices

private let nativeFlagScript = WKUserScript(
    source: "window.__JOBTIDE_NATIVE__ = true;",
    injectionTime: .atDocumentStart,
    forMainFrameOnly: true
)

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
        config.userContentController.addUserScript(nativeFlagScript)
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

    final class Coordinator: NSObject, WKNavigationDelegate, ASWebAuthenticationPresentationContextProviding {
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
            guard webView?.window != nil else { return }
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: "jobtide"
            ) { [weak self] callbackURL, _ in
                guard let query = callbackURL?.query,
                      let target = URL(string: "https://jobtide.jordy.beer/auth/callback?\(query)")
                else { return }
                DispatchQueue.main.async { self?.webView?.load(URLRequest(url: target)) }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            authSession = session
            session.start()
        }

        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
            webView?.window ?? UIWindow()
        }
    }
}
