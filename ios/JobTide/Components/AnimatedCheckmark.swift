import SwiftUI

struct AnimatedCheckmark: View {
    @State private var progress: CGFloat = 0
    @State private var circleScale: CGFloat = 0

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.jtAccent.opacity(0.2))
                .frame(width: 120, height: 120)
                .scaleEffect(circleScale)

            CheckmarkShape()
                .trim(from: 0, to: progress)
                .stroke(Color.jtAccent,
                        style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
                .frame(width: 60, height: 60)
        }
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                circleScale = 1
            }
            withAnimation(.easeOut(duration: 0.65).delay(0.2)) {
                progress = 1
            }
        }
    }
}

private struct CheckmarkShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to:    CGPoint(x: rect.width * 0.18, y: rect.height * 0.50))
        path.addLine(to: CGPoint(x: rect.width * 0.43, y: rect.height * 0.75))
        path.addLine(to: CGPoint(x: rect.width * 0.82, y: rect.height * 0.25))
        return path
    }
}
