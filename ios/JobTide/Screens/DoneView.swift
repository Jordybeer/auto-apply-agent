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
                    .font(.system(size: 34, weight: .bold))
                    .foregroundColor(.jtTextPrimary)

                Text("Je wachtrij staat klaar.")
                    .font(.system(size: 17))
                    .foregroundColor(.jtTextSecondary)

                Spacer()
            }
        }
        .task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            withAnimation(jtTransitionSpring) { appState.goToMain() }
        }
    }
}
