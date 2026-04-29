import SwiftUI
import UserNotifications

struct NotificationsView: View {
    @EnvironmentObject var appState: AppStateManager
    @State private var requesting = false

    var body: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()
            GrainOverlay()

            VStack(spacing: 0) {
                Spacer()

                Image(systemName: "bell.badge.fill")
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(Color.jtAccent, Color.jtTextPrimary)
                    .font(.system(size: 64))
                    .padding(.bottom, 28)

                Text("Blijf op de hoogte")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(.jtTextPrimary)
                    .padding(.bottom, 12)

                Text("Meldingen wanneer je pipeline sterke matches vindt.")
                    .font(.system(size: 16))
                    .foregroundColor(.jtTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Spacer()

                Button {
                    requesting = true
                    Task {
                        _ = try? await UNUserNotificationCenter.current()
                            .requestAuthorization(options: [.alert, .sound, .badge])
                        await MainActor.run {
                            requesting = false
                            withAnimation(jtTransitionSpring) { appState.advance(from: .notifications) }
                        }
                    }
                } label: {
                    Group {
                        if requesting {
                            ProgressView().tint(.white)
                        } else {
                            Text("Meldingen inschakelen")
                                .font(.system(size: 17, weight: .semibold))
                        }
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(Color.jtAccent)
                    .cornerRadius(jtRadius)
                }
                .disabled(requesting)
                .padding(.horizontal, 24)

                Button {
                    withAnimation(jtTransitionSpring) { appState.advance(from: .notifications) }
                } label: {
                    Text("Overslaan")
                        .font(.system(size: 15))
                        .foregroundColor(.jtTextSecondary)
                }
                .padding(.top, 16)
                .padding(.bottom, 48)
            }
        }
    }
}
