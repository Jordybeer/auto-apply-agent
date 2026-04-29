import SwiftUI
import WebKit

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

        if let url = URL(string: "https://jobtide.jordy.beer/login") {
            webView.load(URLRequest(url: url))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onAuthenticated: onAuthenticated)
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var onAuthenticated: (OnboardingStep) -> Void
        private var didAdvance = false

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
            if let host = action.request.url?.host, !host.contains("jobtide.jordy.beer") {
                decisionHandler(.cancel)
                // External links silently dropped; auth flow doesn't need SFSafariVC
            } else {
                decisionHandler(.allow)
            }
        }
    }
}
