import SwiftUI
import UIKit

struct ForceUpgradeView: View {
    var body: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()
            GrainOverlay()

            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "arrow.down.circle.fill")
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(Color.jtAccent, Color.jtTextPrimary.opacity(0.9))
                    .font(.jt(72))

                VStack(spacing: 10) {
                    Text("Update vereist")
                        .font(.jt(28, .bold))
                        .tracking(-0.5)
                        .foregroundColor(.jtTextPrimary)

                    Text("Je versie van JobTide is verouderd.\nWerk bij om verder te gaan.")
                        .font(.jt(15))
                        .foregroundColor(.jtTextSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                Spacer()

                Text("v\(AppVersion.marketing) (build \(AppVersion.build))")
                    .font(.jt(12))
                    .foregroundColor(.jtTextSecondary.opacity(0.7))
                    .padding(.bottom, 32)
            }
        }
    }
}
