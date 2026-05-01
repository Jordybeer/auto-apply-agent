import SwiftUI
import WebKit
import AuthenticationServices

private let nativeFlagScript = WKUserScript(
    source: "window.__JOBTIDE_NATIVE__ = true;",
    injectionTime: .atDocumentStart,
    forMainFrameOnly: true
)

private let authFOUCScript = WKUserScript(
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

struct AuthWebView: View {
    @EnvironmentObject var appState: AppStateManager

    var body: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()
            VStack(spacing: 0) {
                navBar
                AuthWebViewRepresentable { step in
                    withAnimation(jtTransitionSpring) { appState.advance(from: step) }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    private var navBar: some View {
        ZStack {
            Text("Inloggen")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundColor(.jtTextPrimary)

            HStack {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(jtTransitionSpring) {
                        appState.screen = .onboarding(step: .notifications)
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.jt(18, .semibold))
                        .foregroundColor(.jtTextPrimary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                Spacer()
            }
            .padding(.horizontal, 8)
        }
        .frame(height: 48)
        .background(
            Color.jtBackground
                .overlay(
                    Rectangle()
                        .fill(Color.white.opacity(0.06))
                        .frame(height: 0.5),
                    alignment: .bottom
                )
        )
    }
}

private struct AuthWebViewRepresentable: UIViewRepresentable {
    var onAuthenticated: (OnboardingStep) -> Void

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController.addUserScript(nativeFlagScript)
        config.userContentController.addUserScript(authFOUCScript)
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.backgroundColor = UIColor(Color.jtBackground)
        webView.scrollView.backgroundColor = UIColor(Color.jtBackground)
        webView.isOpaque = false
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.allowsBackForwardNavigationGestures = false
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
            if host.contains("jobtide.jordy.beer") && url.path.hasPrefix("/auth/start") {
                decisionHandler(.cancel)
                DispatchQueue.main.async { self.launchAuthSession(url: url) }
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
    }
}
