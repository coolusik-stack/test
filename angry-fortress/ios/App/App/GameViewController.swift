import UIKit
import WebKit
import AVFoundation
import CoreHaptics
import Capacitor

/// Root view controller: Capacitor's web view plus what a full-screen touch game wants.
class GameViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        // registered before the page loads, so `Capacitor.Plugins.DotoriHaptics` exists from the first frame
        bridge?.registerPluginInstance(DotoriHapticsPlugin())
        webView?.allowsLinkPreview = false
        // game sound follows the silent switch and mixes with the player's own music
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [])
    }

    override var prefersStatusBarHidden: Bool { true }

    // no home bar in the way, and a swipe near the edges while aiming stays in the game
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { [.bottom, .top] }
}

/// Core Haptics patterns for the game's "손맛": the web layer describes a short pattern of taps
/// (transient) and buzzes (continuous) with intensity and sharpness, and this plays it.
///
///   Capacitor.Plugins.DotoriHaptics.play({ events: [{ t: 0, i: 1, s: 0.6 }, { t: 0.02, i: 0.7, s: 0.2, d: 0.15 }] })
///     t = start (s), i = intensity 0...1, s = sharpness 0...1, d = duration (s, continuous when > 0)
@objc(DotoriHapticsPlugin)
public class DotoriHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DotoriHapticsPlugin"
    public let jsName = "DotoriHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "supported", returnType: CAPPluginReturnPromise)
    ]

    private var engine: CHHapticEngine?
    private let supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics

    @objc func supported(_ call: CAPPluginCall) {
        call.resolve(["value": supportsHaptics])
    }

    @objc func play(_ call: CAPPluginCall) {
        guard supportsHaptics else {
            call.resolve(["played": false])
            return
        }
        let raw = call.getArray("events", JSObject.self) ?? []
        var events: [CHHapticEvent] = []
        for e in raw.prefix(24) {
            let t = max(0, min(2, number(e["t"], 0)))
            let i = Float(max(0, min(1, number(e["i"], 0.5))))
            let s = Float(max(0, min(1, number(e["s"], 0.5))))
            let d = max(0, min(2, number(e["d"], 0)))
            let params = [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: i),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: s)
            ]
            if d > 0 {
                events.append(CHHapticEvent(eventType: .hapticContinuous, parameters: params, relativeTime: t, duration: d))
            } else {
                events.append(CHHapticEvent(eventType: .hapticTransient, parameters: params, relativeTime: t))
            }
        }
        DispatchQueue.main.async {
            guard !events.isEmpty, let engine = self.readyEngine() else {
                call.resolve(["played": false])
                return
            }
            do {
                let pattern = try CHHapticPattern(events: events, parameters: [])
                let player = try engine.makePlayer(with: pattern)
                try player.start(atTime: CHHapticTimeImmediate)
                call.resolve(["played": true])
            } catch {
                call.resolve(["played": false])
            }
        }
    }

    private func number(_ value: JSValue?, _ fallback: Double) -> Double {
        if let n = value as? NSNumber { return n.doubleValue }
        if let d = value as? Double { return d }
        return fallback
    }

    // One engine for the app's lifetime; it idles itself and is restarted on demand.
    private func readyEngine() -> CHHapticEngine? {
        if engine == nil {
            guard let e = try? CHHapticEngine() else { return nil }
            e.playsHapticsOnly = true
            e.isAutoShutdownEnabled = true
            e.resetHandler = { [weak self] in
                try? self?.engine?.start()
            }
            engine = e
        }
        guard let e = engine else { return nil }
        do {
            try e.start()
        } catch {
            return nil
        }
        return e
    }
}
