import SwiftUI

struct OnboardingProgress: View {
    let current: Int
    let total: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<total, id: \.self) { i in
                Capsule()
                    .fill(i <= current ? Color.jtAccent : Color.jtSurface)
                    .frame(width: i == current ? 28 : 18, height: 6)
                    .animation(.spring(response: 0.45, dampingFraction: 0.85), value: current)
            }
        }
    }
}

struct OnboardingHero: View {
    let symbol: String
    let title: String
    let subtitle: String

    @State private var pulse = false

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [Color.jtAccent.opacity(0.45), .clear],
                            center: .center,
                            startRadius: 0,
                            endRadius: 90
                        )
                    )
                    .frame(width: 180, height: 180)
                    .blur(radius: 14)
                    .scaleEffect(pulse ? 1.08 : 0.92)
                    .animation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true), value: pulse)

                Image(systemName: symbol)
                    .font(.system(size: 64, weight: .semibold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color.jtAccent, Color.jtAccent.opacity(0.6)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .symbolRenderingMode(.hierarchical)
            }
            .frame(height: 180)
            .onAppear { pulse = true }

            VStack(spacing: 8) {
                Text(title)
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundColor(.jtTextPrimary)
                    .multilineTextAlignment(.center)

                Text(subtitle)
                    .font(.system(size: 15))
                    .foregroundColor(.jtTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
        }
    }
}

struct PrimaryActionButton: View {
    let title: String
    let loading: Bool
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            action()
        } label: {
            ZStack {
                if loading {
                    ProgressView().tint(.white)
                } else {
                    Text(title)
                        .font(.system(size: 17, weight: .semibold, design: .rounded))
                }
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(
                LinearGradient(
                    colors: enabled
                        ? [Color.jtAccent, Color.jtAccent.opacity(0.85)]
                        : [Color.jtSurface, Color.jtSurface],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: enabled ? Color.jtAccent.opacity(0.35) : .clear, radius: 18, y: 8)
        }
        .disabled(loading || !enabled)
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: enabled)
    }
}
