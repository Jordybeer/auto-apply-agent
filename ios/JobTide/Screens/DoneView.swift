import SwiftUI

struct DoneView: View {
    @EnvironmentObject var appState: AppStateManager

    var body: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()
            GrainOverlay()

            VStack(spacing: 20) {
                Spacer()
                AnimatedCheckmark()

                Text("Klaar!")
                    .font(.jt(34, .bold))
                    .tracking(-0.5)
                    .foregroundColor(.jtTextPrimary)

                Text("Je wachtrij staat klaar.")
                    .font(.jt(17))
                    .foregroundColor(.jtTextSecondary)

                Spacer()
            }
        }
        .task {
            try? await Task.sleep(nanoseconds: 700_000_000)
            withAnimation(jtTransitionSpring) { appState.goToMain() }
        }
    }
}
