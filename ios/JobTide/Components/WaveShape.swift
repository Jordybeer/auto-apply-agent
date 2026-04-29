import SwiftUI

struct WaveShape: Shape {
    var phase: CGFloat

    var animatableData: CGFloat {
        get { phase }
        set { phase = newValue }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let waveHeight: CGFloat = 18
        let wavelength = rect.width * 0.6
        let midY = rect.height * 0.45

        path.move(to: CGPoint(x: 0, y: midY))
        for x in stride(from: CGFloat(0), through: rect.width, by: 2) {
            let y = midY + waveHeight * sin((x / wavelength) * .pi * 2 + phase)
            path.addLine(to: CGPoint(x: x, y: y))
        }
        path.addLine(to: CGPoint(x: rect.width, y: rect.height))
        path.addLine(to: CGPoint(x: 0, y: rect.height))
        path.closeSubpath()
        return path
    }
}
