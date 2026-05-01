import SwiftUI

@main
struct JobTideApp: App {
    @StateObject private var appState = AppStateManager()

    init() {
        URLCache.shared = URLCache(
            memoryCapacity: 10 * 1024 * 1024,
            diskCapacity: 50 * 1024 * 1024,
            diskPath: "jobtide_cache"
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .preferredColorScheme(.dark)
        }
    }
}
