import SwiftUI
import StoreKit

private let productIDs = ["be.jobtide.weekly", "be.jobtide.monthly"]

@MainActor
final class SubscriptionStore: ObservableObject {
    @Published var products: [Product] = []
    @Published var purchasing = false
    @Published var error: String?
    @Published var purchased = false

    func load() async {
        do {
            products = try await Product.products(for: productIDs)
                .sorted { $0.price < $1.price }
        } catch {
            self.error = "Producten laden mislukt."
        }
    }

    func purchase(_ product: Product) async {
        purchasing = true
        error = nil
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                switch verification {
                case .verified(let transaction):
                    await transaction.finish()
                    purchased = true
                    await notifyServer(transactionID: String(transaction.id))
                case .unverified:
                    error = "Aankoop kon niet worden geverifieerd."
                }
            case .userCancelled:
                break
            case .pending:
                error = "Aankoop in behandeling."
            @unknown default:
                break
            }
        } catch {
            self.error = "Aankoop mislukt. Probeer opnieuw."
        }
        purchasing = false
    }

    private func notifyServer(transactionID: String) async {
        guard let url = URL(string: "\(APIClient.webBase)/api/webhooks/apple") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONEncoder().encode(["transactionID": transactionID])
        _ = try? await URLSession.shared.data(for: req)
    }
}

struct PaywallView: View {
    @StateObject private var store = SubscriptionStore()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.jtBackground.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Image(systemName: "bolt.fill")
                            .font(.jt(44))
                            .foregroundColor(.jtAccent)
                        Text("JobTide Premium")
                            .font(.jt(28, .bold))
                            .tracking(-0.5)
                            .foregroundColor(.jtTextPrimary)
                        Text("Onbeperkt matchen, AI-brieven\nen automatisch solliciteren.")
                            .font(.jt(15))
                            .foregroundColor(.jtTextSecondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 32)

                    if store.products.isEmpty {
                        ProgressView()
                            .tint(.jtAccent)
                            .frame(height: 120)
                    } else {
                        VStack(spacing: 12) {
                            ForEach(store.products, id: \.id) { product in
                                ProductCard(
                                    product: product,
                                    isBestDeal: product.id == "be.jobtide.monthly",
                                    purchasing: store.purchasing,
                                    onTap: { Task { await store.purchase(product) } }
                                )
                            }
                        }
                        .padding(.horizontal, 20)
                    }

                    if let err = store.error {
                        Text(err)
                            .font(.jt(13))
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        FeatureRow(icon: "checkmark.circle.fill", text: "Onbeperkte AI-matching")
                        FeatureRow(icon: "checkmark.circle.fill", text: "Motivatiebrieven met Claude Sonnet")
                        FeatureRow(icon: "checkmark.circle.fill", text: "Automatisch solliciteren per e-mail")
                        FeatureRow(icon: "checkmark.circle.fill", text: "Dagelijkse vacaturescan")
                    }
                    .padding(.horizontal, 28)

                    Button("Niet nu") { dismiss() }
                        .font(.jt(14))
                        .foregroundColor(.jtTextSecondary)
                        .padding(.bottom, 32)
                }
            }

            if store.purchased {
                PurchasedOverlay { dismiss() }
            }
        }
        .task { await store.load() }
    }
}

private struct ProductCard: View {
    let product: Product
    let isBestDeal: Bool
    let purchasing: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(product.displayName)
                            .font(.jt(16, .semibold))
                            .foregroundColor(.jtTextPrimary)
                        if isBestDeal {
                            Text("BESTE DEAL")
                                .font(.jt(9, .bold))
                                .foregroundColor(.jtAccent)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.jtAccent.opacity(0.15))
                                .clipShape(Capsule())
                        }
                    }
                    Text(product.description)
                        .font(.jt(12))
                        .foregroundColor(.jtTextSecondary)
                }
                Spacer()
                Text(product.displayPrice)
                    .font(.jt(18, .bold))
                    .foregroundColor(.jtAccent)
            }
            .padding(16)
            .background(Color.jtTextPrimary.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: jtRadius))
            .overlay(
                RoundedRectangle(cornerRadius: jtRadius)
                    .stroke(isBestDeal ? Color.jtAccent : Color.clear, lineWidth: 1.5)
            )
        }
        .disabled(purchasing)
    }
}

private struct FeatureRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .foregroundColor(.jtAccent)
                .font(.jt(14))
            Text(text)
                .font(.jt(14))
                .foregroundColor(.jtTextPrimary)
        }
    }
}

private struct PurchasedOverlay: View {
    let onDismiss: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.jt(60))
                    .foregroundColor(.jtAccent)
                Text("Welkom bij Premium!")
                    .font(.jt(22, .bold))
                    .foregroundColor(.jtTextPrimary)
                Text("Je hebt nu onbeperkte toegang.")
                    .font(.jt(15))
                    .foregroundColor(.jtTextPrimary.opacity(0.8))
                Button("Aan de slag", action: onDismiss)
                    .font(.jt(16, .semibold))
                    .foregroundColor(.jtBackground)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 12)
                    .background(Color.jtAccent)
                    .clipShape(Capsule())
            }
        }
    }
}
