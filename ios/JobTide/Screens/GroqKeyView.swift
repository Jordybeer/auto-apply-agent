import SwiftUI

struct GroqKeyView: View {
    @EnvironmentObject var appState: AppStateManager
    @State private var groqKey = ""
    @State private var loading = false
    @State private var errorMessage: String? = nil
    @State private var shakeTrigger: CGFloat = 0

    var body: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()
            GrainOverlay()

            VStack(spacing: 0) {
                Spacer()

                Image(systemName: "cpu.fill")
                    .font(.system(size: 56))
                    .foregroundColor(.jtAccent)
                    .padding(.bottom, 24)

                Text("Groq API Key")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(.jtTextPrimary)
                    .padding(.bottom, 6)

                Text("Stap 1 van 2 — vereist voor AI-scoring")
                    .font(.system(size: 14))
                    .foregroundColor(.jtTextSecondary)
                    .padding(.bottom, 28)

                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(steps.enumerated()), id: \.offset) { i, step in
                        HStack(alignment: .top, spacing: 10) {
                            Text("\(i + 1)")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.jtAccent)
                                .frame(width: 20)
                            Text(step)
                                .font(.system(size: 14))
                                .foregroundColor(.jtTextSecondary)
                        }
                    }
                }
                .padding(16)
                .background(Color.jtSurface)
                .cornerRadius(jtRadius)
                .padding(.horizontal, 24)
                .padding(.bottom, 20)

                HStack {
                    SecureField("gsk_••••••••••••••••", text: $groqKey)
                        .font(.system(size: 14, design: .monospaced))
                        .foregroundColor(.jtTextPrimary)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)

                    Button {
                        if let str = UIPasteboard.general.string {
                            groqKey = str
                        }
                    } label: {
                        Text("Plakken")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.jtAccent)
                    }
                }
                .padding(14)
                .background(Color.jtSurface)
                .cornerRadius(jtRadius)
                .padding(.horizontal, 24)
                .modifier(ShakeModifier(animatableData: shakeTrigger))

                if let err = errorMessage {
                    Text(err)
                        .font(.system(size: 13))
                        .foregroundColor(.red)
                        .padding(.top, 8)
                        .padding(.horizontal, 24)
                }

                Spacer()

                Button {
                    submit()
                } label: {
                    Group {
                        if loading {
                            ProgressView().tint(.white)
                        } else {
                            Text("Opslaan →")
                                .font(.system(size: 17, weight: .semibold))
                        }
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(Color.jtAccent)
                    .cornerRadius(jtRadius)
                }
                .disabled(loading)
                .padding(.horizontal, 24)
                .padding(.bottom, 48)
            }
        }
    }

    private let steps = [
        "Ga naar console.groq.com",
        "Maak een gratis account aan",
        "API Keys → Create API Key"
    ]

    private func submit() {
        guard !groqKey.trimmingCharacters(in: .whitespaces).isEmpty else {
            withAnimation(jtSpring) { shakeTrigger += 1 }
            return
        }
        loading = true
        errorMessage = nil
        Task {
            do {
                _ = try await APIClient.post(path: "/api/settings", json: ["groq_api_key": groqKey])
                await MainActor.run {
                    loading = false
                    withAnimation(jtTransitionSpring) { appState.advance(from: .groqKey) }
                }
            } catch {
                await MainActor.run {
                    loading = false
                    errorMessage = "Opslaan mislukt. Controleer je sleutel en probeer opnieuw."
                    withAnimation(jtSpring) { shakeTrigger += 1 }
                }
            }
        }
    }
}
