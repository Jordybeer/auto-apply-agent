import SwiftUI

enum OnboardingStep: CaseIterable {
    case hero, notifications, auth, groqKey, cvUpload, done
}

enum AppScreen {
    case splash
    case onboarding(step: OnboardingStep)
    case main
}

extension Notification.Name {
    static let jtShowNativeOnboarding = Notification.Name("jtShowNativeOnboarding")
}

@MainActor
final class AppStateManager: ObservableObject {
    private static let onboardedKey = "ja_onboarded"

    @Published var screen: AppScreen = .splash

    init() {
        NotificationCenter.default.addObserver(
            forName: .jtShowNativeOnboarding,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                UserDefaults.standard.set(false, forKey: Self.onboardedKey)
                withAnimation(jtTransitionSpring) {
                    self.screen = .onboarding(step: .groqKey)
                }
            }
        }
    }

    func advance(from step: OnboardingStep) {
        switch step {
        case .hero:          screen = .onboarding(step: .notifications)
        case .notifications: screen = .onboarding(step: .auth)
        case .auth:          screen = .onboarding(step: .groqKey)
        case .groqKey:       screen = .onboarding(step: .cvUpload)
        case .cvUpload:      screen = .onboarding(step: .done)
        case .done:
            UserDefaults.standard.set(true, forKey: Self.onboardedKey)
            screen = .main
        }
    }

    func goToMain() {
        screen = .main
    }

    static var hasCompletedOnboarding: Bool {
        UserDefaults.standard.bool(forKey: onboardedKey)
    }
}

struct RootView: View {
    @EnvironmentObject var appState: AppStateManager

    var body: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()
            screenView
                .transition(.pageForward)
        }
        .animation(jtTransitionSpring, value: screenKey)
    }

    @ViewBuilder
    private var screenView: some View {
        switch appState.screen {
        case .splash:
            SplashView().id("splash")
        case .onboarding(let step):
            onboardingView(for: step).id("ob-\(step)")
        case .main:
            MainWebView().id("main")
        }
    }

    @ViewBuilder
    private func onboardingView(for step: OnboardingStep) -> some View {
        switch step {
        case .hero:          HeroView()
        case .notifications: NotificationsView()
        case .auth:          AuthWebView()
        case .groqKey:       GroqKeyView()
        case .cvUpload:      CVUploadView()
        case .done:          DoneView()
        }
    }

    private var screenKey: String {
        switch appState.screen {
        case .splash:              return "splash"
        case .onboarding(let s):   return "ob-\(s)"
        case .main:                return "main"
        }
    }
}
