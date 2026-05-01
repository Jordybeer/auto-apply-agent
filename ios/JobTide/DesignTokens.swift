import SwiftUI
import UIKit

extension Color {
    static let jtBackground    = Color(hex: "0A0A0A")
    static let jtAccent        = Color(hex: "6366F1")
    static let jtSurface       = Color(hex: "141414")
    static let jtTextPrimary   = Color(hex: "FFFFFF")
    static let jtTextSecondary = Color(hex: "8B8B8B")

    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8)  & 0xFF) / 255
        let b = Double(int         & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

extension Font {
    static func jt(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}

let jtRadius: CGFloat = 20
let jtSpring = Animation.spring(response: 0.5, dampingFraction: 0.8)
let jtTransitionSpring = Animation.spring(response: 0.4, dampingFraction: 0.85)

extension AnyTransition {
    static let pageForward = AnyTransition.asymmetric(
        insertion: .move(edge: .trailing).combined(with: .opacity),
        removal:   .move(edge: .leading).combined(with: .opacity)
    )

    static let splashReveal = AnyTransition.asymmetric(
        insertion: .opacity.combined(with: .scale(scale: 1.02)),
        removal:   .opacity.combined(with: .scale(scale: 0.98))
    )
}

@MainActor
var jtReduceMotion: Bool {
    UIAccessibility.isReduceMotionEnabled
}
