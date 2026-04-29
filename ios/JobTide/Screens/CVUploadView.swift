import SwiftUI
import UniformTypeIdentifiers

struct CVUploadView: View {
    @EnvironmentObject var appState: AppStateManager
    @State private var pickedURL: URL? = nil
    @State private var pickedData: Data? = nil
    @State private var pickedName: String = ""
    @State private var pickedSize: String = ""
    @State private var showPicker = false
    @State private var loading = false
    @State private var errorMessage: String? = nil

    var body: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()
            GrainOverlay()

            VStack(spacing: 0) {
                Spacer()

                Image(systemName: "doc.fill")
                    .font(.system(size: 56))
                    .foregroundColor(.jtAccent)
                    .padding(.bottom, 24)

                Text("Upload je CV")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(.jtTextPrimary)
                    .padding(.bottom, 6)

                Text("Stap 2 van 2 — voor gepersonaliseerde motivatiebrieven")
                    .font(.system(size: 14))
                    .foregroundColor(.jtTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.bottom, 24)

                Text("Veilig opgeslagen per account. Alleen PDF, max 5 MB.")
                    .font(.system(size: 13))
                    .foregroundColor(.jtTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 16)

                Button { showPicker = true } label: {
                    ZStack {
                        RoundedRectangle(cornerRadius: jtRadius)
                            .strokeBorder(
                                style: StrokeStyle(lineWidth: 1.5, dash: [6])
                            )
                            .foregroundColor(.jtAccent.opacity(0.6))
                            .background(Color.jtSurface.cornerRadius(jtRadius))

                        if let name = pickedURL?.lastPathComponent, pickedData != nil {
                            HStack(spacing: 10) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(name)
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundColor(.jtTextPrimary)
                                    Text(pickedSize)
                                        .font(.system(size: 12))
                                        .foregroundColor(.jtTextSecondary)
                                }
                            }
                        } else {
                            VStack(spacing: 8) {
                                Image(systemName: "doc.badge.plus")
                                    .font(.system(size: 28))
                                    .foregroundColor(.jtAccent)
                                Text("Tik om PDF te kiezen")
                                    .font(.system(size: 14))
                                    .foregroundColor(.jtTextSecondary)
                            }
                        }
                    }
                    .frame(height: 110)
                }
                .padding(.horizontal, 24)

                if let err = errorMessage {
                    Text(err)
                        .font(.system(size: 13))
                        .foregroundColor(.red)
                        .padding(.top, 8)
                        .padding(.horizontal, 24)
                }

                Spacer()

                Button { upload() } label: {
                    Group {
                        if loading {
                            ProgressView().tint(.white)
                        } else {
                            Text("CV opslaan & starten →")
                                .font(.system(size: 17, weight: .semibold))
                        }
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(pickedData != nil ? Color.jtAccent : Color.jtSurface)
                    .cornerRadius(jtRadius)
                }
                .disabled(loading || pickedData == nil)
                .padding(.horizontal, 24)

                Button {
                    withAnimation(jtTransitionSpring) { appState.advance(from: .cvUpload) }
                } label: {
                    Text("Overslaan (kan later worden ingesteld)")
                        .font(.system(size: 14))
                        .foregroundColor(.jtTextSecondary)
                }
                .padding(.top, 14)
                .padding(.bottom, 48)
            }
        }
        .sheet(isPresented: $showPicker) {
            DocumentPicker { url in
                loadFile(url: url)
            }
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
    }

    private func upload() {
        guard let data = pickedData, let name = pickedURL?.lastPathComponent else { return }
        loading = true
        errorMessage = nil
        Task {
            do {
                _ = try await APIClient.postMultipart(path: "/api/cv", fileData: data, fileName: name)
                _ = try? await APIClient.post(path: "/api/settings", json: ["is_onboarded": true])
                await MainActor.run {
                    loading = false
                    withAnimation(jtTransitionSpring) { appState.advance(from: .cvUpload) }
                }
            } catch {
                await MainActor.run {
                    loading = false
                    errorMessage = "Upload mislukt. Probeer opnieuw."
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
