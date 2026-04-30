import SwiftUI

struct GroqKeyView: View {
    @EnvironmentObject var appState: AppStateManager
    @State private var groqKey = ""
    @State private var loading = false
    @State private var errorMessage: String? = nil
    @State private var shakeTrigger: CGFloat = 0
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()
            GrainOverlay()

            ScrollView {
                VStack(spacing: 28) {
                    OnboardingProgress(current: 0, total: 2)
                        .padding(.top, 20)

                    OnboardingHero(
                        symbol: "cpu.fill",
                        title: "Verbind Groq",
                        subtitle: "Je persoonlijke AI-sleutel voor scoring en motivatiebrieven."
                    )

                    instructionsCard
                        .padding(.horizontal, 20)

                    inputField
                        .padding(.horizontal, 20)

                    if let err = errorMessage {
                        Text(err)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.red)
                            .padding(.horizontal, 24)
                            .transition(.opacity)
                    }

                    Spacer(minLength: 12)
                }
            }

            VStack {
                Spacer()
                PrimaryActionButton(
                    title: "Doorgaan",
                    loading: loading,
                    enabled: !groqKey.trimmingCharacters(in: .whitespaces).isEmpty,
                    action: submit
                )
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
        }
        .onTapGesture { focused = false }
    }

    private var instructionsCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Snel een sleutel ophalen")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.jtTextSecondary)
                .textCase(.uppercase)
                .tracking(0.5)

            ForEach(Array(steps.enumerated()), id: \.offset) { i, step in
                HStack(alignment: .center, spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(Color.jtAccent.opacity(0.15))
                            .frame(width: 26, height: 26)
                        Text("\(i + 1)")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .foregroundColor(.jtAccent)
                    }
                    Text(step)
                        .font(.system(size: 15))
                        .foregroundColor(.jtTextPrimary)
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(Color.white.opacity(0.06), lineWidth: 1)
                )
        )
    }

    private var inputField: some View {
        HStack(spacing: 10) {
            Image(systemName: "key.fill")
                .font(.system(size: 14))
                .foregroundColor(.jtTextSecondary)

            SecureField("gsk_••••••••••••", text: $groqKey)
                .font(.system(size: 15, design: .monospaced))
                .foregroundColor(.jtTextPrimary)
                .autocapitalization(.none)
                .disableAutocorrection(true)
                .focused($focused)
                .submitLabel(.go)
                .onSubmit(submit)

            if !groqKey.isEmpty {
                Button {
                    groqKey = ""
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundColor(.jtTextSecondary)
                }
            } else {
                Button {
                    if let s = UIPasteboard.general.string {
                        groqKey = s
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    }
                } label: {
                    Text("Plakken")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.jtAccent)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.jtSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(focused ? Color.jtAccent.opacity(0.6) : Color.white.opacity(0.05), lineWidth: 1.2)
                )
        )
        .modifier(ShakeModifier(animatableData: shakeTrigger))
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: focused)
    }

    private let steps = [
        "Open console.groq.com",
        "Maak een gratis account",
        "Kopieer een nieuwe API Key"
    ]

    private func submit() {
        guard !groqKey.trimmingCharacters(in: .whitespaces).isEmpty else {
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
            withAnimation(jtSpring) { shakeTrigger += 1 }
            return
        }
        loading = true
        errorMessage = nil
        focused = false
        Task {
            do {
                _ = try await APIClient.post(path: "/api/settings", json: ["groq_api_key": groqKey])
                await MainActor.run {
                    loading = false
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    withAnimation(jtTransitionSpring) { appState.advance(from: .groqKey) }
                }
            } catch {
                await MainActor.run {
                    loading = false
                    errorMessage = "Opslaan mislukt. Controleer je sleutel."
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                    withAnimation(jtSpring) { shakeTrigger += 1 }
                }
            }
        }
    }
}
