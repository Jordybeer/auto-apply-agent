import SwiftUI

struct HeroView: View {
    @EnvironmentObject var appState: AppStateManager
    @State private var wavePhase: CGFloat = 0

    private let totalSteps = 4

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.jtBackground.ignoresSafeArea()

            GeometryReader { geo in
                WaveShape(phase: wavePhase)
                    .fill(Color.jtAccent.opacity(0.12))
                    .frame(height: geo.size.height * 0.45)
                    .frame(maxHeight: .infinity, alignment: .bottom)
                    .ignoresSafeArea(edges: .bottom)
            }

            VStack(spacing: 0) {
                Spacer()

                Image(systemName: "briefcase.fill")
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(Color.jtAccent, Color.jtTextPrimary.opacity(0.9))
                    .font(.system(size: 72))
                    .padding(.bottom, 28)

                Text("JobTide")
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(.jtTextPrimary)
                    .padding(.bottom, 12)

                Text("Je persoonlijke hiring agent.\nScrape. Score. Solliciteer.")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundColor(.jtTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Spacer()

                Button {
                    withAnimation(jtTransitionSpring) { appState.advance(from: .hero) }
                } label: {
                    Text("Aan de slag →")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(Color.jtAccent)
                        .cornerRadius(jtRadius)
                }
                .padding(.horizontal, 24)

                PageDots(total: totalSteps, current: 0)
                    .padding(.top, 20)
                    .padding(.bottom, 48)
            }

            GrainOverlay()
        }
        .onAppear {
            withAnimation(.linear(duration: 6).repeatForever(autoreverses: false)) {
                wavePhase = .pi * 2
            }
        }
    }
}

private struct PageDots: View {
    let total: Int
    let current: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<total, id: \.self) { i in
                Circle()
                    .fill(i == current ? Color.jtAccent : Color.jtSurface)
                    .frame(width: i == current ? 8 : 6, height: i == current ? 8 : 6)
            }
        }
    }
}
