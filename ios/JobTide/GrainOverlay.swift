import SwiftUI
import UIKit

struct GrainOverlay: View {
    var body: some View {
        Image(uiImage: GrainOverlay.noise)
            .resizable(resizingMode: .tile)
            .blendMode(.overlay)
            .opacity(0.05)
            .allowsHitTesting(false)
            .ignoresSafeArea()
    }

    private static let noise: UIImage = {
        let size = CGSize(width: 256, height: 256)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            UIColor.black.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))

            var rng = SeededRNG(seed: 42)
            let cg = ctx.cgContext
            for _ in 0..<6000 {
                let x = CGFloat(rng.next()) * size.width
                let y = CGFloat(rng.next()) * size.height
                let alpha = 0.15 + CGFloat(rng.next()) * 0.55
                cg.setFillColor(UIColor(white: 1.0, alpha: alpha).cgColor)
                cg.fill(CGRect(x: x, y: y, width: 1, height: 1))
            }
        }
    }()
}

private struct SeededRNG {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> Double {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return Double(state >> 33) / Double(UInt32.max)
    }
}
