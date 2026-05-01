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
            try? await Task.sleep(nanoseconds: 600_000_000)
            withAnimation(jtTransitionSpring) {
                if AppStateManager.hasCompletedOnboarding {
                    appState.screen = .main
                } else {
                    appState.screen = .onboarding(step: .hero)
                }
            }
        }
    }
}
