import SwiftUI
import UniformTypeIdentifiers

struct CVUploadView: View {
    @EnvironmentObject var appState: AppStateManager
    @State private var pickedURL: URL? = nil
    @State private var pickedData: Data? = nil
    @State private var pickedSize: String = ""
    @State private var showPicker = false
    @State private var loading = false
    @State private var errorMessage: String? = nil

    var body: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()
            GrainOverlay()

            ScrollView {
                VStack(spacing: 24) {
                    OnboardingProgress(current: 1, total: 2)
                        .padding(.top, 20)

                    OnboardingHero(
                        symbol: "doc.text.fill",
                        title: "Voeg je CV toe",
                        subtitle: "We schrijven motivatiebrieven die echt bij jou passen."
                    )

                    pickerCard
                        .padding(.horizontal, 20)

                    privacyNote
                        .padding(.horizontal, 24)

                    if let err = errorMessage {
                        Text(err)
                            .font(.jt(13, .medium))
                            .foregroundColor(.red)
                            .padding(.horizontal, 24)
                            .transition(.opacity)
                    }
                }
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            PrimaryActionButton(
                title: "CV opslaan & starten",
                loading: loading,
                enabled: pickedData != nil,
                action: upload
            )
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 16)
            .background(
                LinearGradient(
                    colors: [Color.jtBackground.opacity(0), Color.jtBackground],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea(edges: .bottom)
                .allowsHitTesting(false)
            )
        }
        .sheet(isPresented: $showPicker) {
            DocumentPicker { url in loadFile(url: url) }
        }
    }

    private var pickerCard: some View {
        Button { showPicker = true } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .strokeBorder(
                                pickedData != nil
                                    ? Color.jtAccent
                                    : Color.jtAccent.opacity(0.4),
                                style: StrokeStyle(lineWidth: 1.5, dash: pickedData == nil ? [6] : [])
                            )
                    )

                if let name = pickedURL?.lastPathComponent, pickedData != nil {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(Color.green.opacity(0.18))
                                .frame(width: 44, height: 44)
                            Image(systemName: "checkmark")
                                .font(.jt(18, .bold))
                                .foregroundColor(.green)
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            Text(name)
                                .font(.jt(15, .semibold))
                                .foregroundColor(.jtTextPrimary)
                                .lineLimit(1)
                            Text(pickedSize)
                                .font(.jt(13))
                                .foregroundColor(.jtTextSecondary)
                        }
                        Spacer()
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.jt(14))
                            .foregroundColor(.jtTextSecondary)
                    }
                    .padding(.horizontal, 18)
                } else {
                    VStack(spacing: 10) {
                        Image(systemName: "tray.and.arrow.up.fill")
                            .font(.jt(32))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [Color.jtAccent, Color.jtAccent.opacity(0.6)],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )
                        Text("Tik om PDF te kiezen")
                            .font(.jt(15, .medium))
                            .foregroundColor(.jtTextPrimary)
                        Text("Max 5 MB")
                            .font(.jt(12))
                            .foregroundColor(.jtTextSecondary)
                    }
                }
            }
            .frame(height: 130)
        }
        .buttonStyle(.plain)
    }

    private var privacyNote: some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "lock.fill")
                    .font(.jt(11))
                Text("Versleuteld opgeslagen, alleen jij kunt het lezen.")
                    .font(.jt(12))
            }
            .foregroundColor(.jtTextSecondary)

            HStack(spacing: 6) {
                Link("Voorwaarden", destination: APIClient.webBase.appendingPathComponent("legal/terms"))
                Text("·").opacity(0.4)
                Link("Privacy", destination: APIClient.webBase.appendingPathComponent("legal/privacy"))
                Text("·").opacity(0.4)
                Link("GDPR", destination: APIClient.webBase.appendingPathComponent("legal/gdpr"))
            }
            .font(.jt(11))
            .foregroundColor(.jtTextSecondary)
        }
    }

    private func loadFile(url: URL) {
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }
        guard let data = try? Data(contentsOf: url) else { return }
        pickedURL = url
        pickedData = data
        let mb = Double(data.count) / 1_048_576
        pickedSize = String(format: "%.1f MB", mb)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    private func upload() {
        guard let data = pickedData, let name = pickedURL?.lastPathComponent else { return }
        loading = true
        errorMessage = nil
        Task {
            do {
                _ = try await APIClient.postMultipart(path: "/api/cv", fileData: data, fileName: name)
                _ = try await APIClient.post(path: "/api/settings", json: ["is_onboarded": true])

                // Verify the flag actually flipped server-side before advancing — otherwise
                // MainWebView lands on /, middleware bounces to /onboarding, the WKWebView
                // intercept fires jtShowNativeOnboarding, and the user is yanked back to
                // groqKey for an apparent infinite loop.
                let onboarded = await AppStateManager.fetchIsOnboarded()
                if !onboarded {
                    await MainActor.run {
                        loading = false
                        errorMessage = "Opslaan niet bevestigd. Probeer opnieuw."
                        UINotificationFeedbackGenerator().notificationOccurred(.error)
                    }
                    return
                }

                await MainActor.run {
                    loading = false
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    withAnimation(jtTransitionSpring) { appState.advance(from: .cvUpload) }
                }
            } catch {
                await MainActor.run {
                    loading = false
                    errorMessage = "Upload mislukt. Probeer opnieuw."
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                }
            }
        }
    }

}

private struct DocumentPicker: UIViewControllerRepresentable {
    var onPick: (URL) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.pdf])
        picker.allowsMultipleSelection = false
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        var onPick: (URL) -> Void
        init(onPick: @escaping (URL) -> Void) { self.onPick = onPick }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            guard let url = urls.first else { return }
            onPick(url)
        }
    }
}
