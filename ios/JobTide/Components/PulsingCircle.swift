import SwiftUI

struct PulsingCircle: View {
    var diameter: CGFloat = 160
    @State private var pulsing = false

    var body: some View {
        Circle()
            .fill(Color.jtAccent.opacity(0.18))
            .frame(width: diameter, height: diameter)
            .scaleEffect(pulsing ? 1.18 : 1.0)
            .opacity(pulsing ? 0.45 : 1.0)
            .animation(.easeInOut(duration: 1.3).repeatForever(autoreverses: true), value: pulsing)
            .onAppear { pulsing = true }
    }
}
