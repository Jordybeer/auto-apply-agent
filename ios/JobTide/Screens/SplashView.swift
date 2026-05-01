import SwiftUI

struct SplashView: View {
    @EnvironmentObject var appState: AppStateManager

    var body: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()

            RadialGradient(
                colors: [Color.jtAccent.opacity(0.35), .clear],
                center: .center,
                startRadius: 0,
                endRadius: 180
            )
            .blur(radius: 40)
            .ignoresSafeArea()

            PulsingCircle(diameter: 180)

            Text("JobTide")
                .font(.jt(48, .bold))
                .tracking(-0.5)
                .foregroundColor(.jtTextPrimary)

            GrainOverlay()
        }
        .task {
            async let minHold: () = Task.sleep(nanoseconds: 600_000_000)
            async let upgrade = AppStateManager.fetchForceUpgrade()
            async let _ = APIClient.prewarm(paths: ["/api/settings", "/api/saved"])
            _ = try? await minHold
            let mustUpgrade = await upgrade
            withAnimation(jtTransitionSpring) {
                if mustUpgrade {
                    appState.screen = .forceUpgrade
                } else if AppStateManager.hasCompletedOnboarding {
                    appState.screen = .main
                } else {
                    appState.screen = .onboarding(step: .hero)
                }
            }
        }
    }
}
