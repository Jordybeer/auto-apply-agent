import SwiftUI

struct GrainOverlay: View {
    private let points: [(CGFloat, CGFloat)] = {
        var rng = SeededRNG(seed: 42)
        return (0..<4000).map { _ in (rng.next(), rng.next()) }
    }()

    var body: some View {
        GeometryReader { geo in
            Canvas { context, size in
                for (nx, ny) in points {
                    let x = nx * size.width
                    let y = ny * size.height
                    let rect = CGRect(x: x, y: y, width: 1.5, height: 1.5)
                    context.fill(Path(ellipseIn: rect), with: .color(.white))
                }
            }
        }
        .opacity(0.03)
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }
}

private struct SeededRNG {
    private var state: UInt64

    init(seed: UInt64) { state = seed }

    mutating func next() -> CGFloat {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return CGFloat((state >> 33)) / CGFloat(UInt32.max)
    }
}
