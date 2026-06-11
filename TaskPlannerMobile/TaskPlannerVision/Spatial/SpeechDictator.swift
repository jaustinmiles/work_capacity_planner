import Foundation
import Speech
import AVFoundation

/// On-device live dictation for the voice-first chat (Speech framework). Streams partial
/// transcripts via `onText`; auto-stops on the final result. Self-contained for the Vision target
/// (the iOS VoiceInputButton is not in this target). The NSMicrophone / NSSpeechRecognition usage
/// strings are set in the target's Info build settings.
@MainActor
final class SpeechDictator {
    private let recognizer = SFSpeechRecognizer()
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var onStop: (() -> Void)?

    private(set) var isRecording = false

    /// Request permission, start the engine, and stream partial transcripts to `onText`. `onFinish`
    /// fires whenever recording ends (final result, error, or `stop()`), so the UI can reset.
    func start(
        onText: @escaping (String) -> Void,
        onError: @escaping (String) -> Void,
        onFinish: @escaping () -> Void
    ) {
        onStop = onFinish
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            Task { @MainActor in
                guard let self else { return }
                guard status == .authorized else {
                    onError("Speech recognition isn't authorized — enable it in Settings.")
                    self.finish()
                    return
                }
                // Microphone permission is separate from speech recognition; request it before we
                // touch the audio engine (otherwise the engine accesses the mic with no grant).
                guard await Self.requestMicPermission() else {
                    onError("Microphone access is needed for voice — enable it in Settings.")
                    self.finish()
                    return
                }
                do { try self.beginSession(onText: onText) }
                catch { onError(error.localizedDescription); self.finish() }
            }
        }
    }

    private static func requestMicPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    private func beginSession(onText: @escaping (String) -> Void) throws {
        guard let recognizer, recognizer.isAvailable else {
            throw NSError(domain: "Speech", code: 0,
                          userInfo: [NSLocalizedDescriptionKey: "Speech recognizer is unavailable."])
        }

        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        self.request = request

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        // The Simulator (and any route without a usable mic) reports a 0-rate / 0-channel format;
        // installing a tap with that format is an UNCATCHABLE crash, so fail gracefully instead.
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw NSError(domain: "Speech", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Microphone input isn't available here — try a real device.",
            ])
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak request] buffer, _ in
            request?.append(buffer)
        }
        audioEngine.prepare()
        try audioEngine.start()
        isRecording = true

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor in
                if let result { onText(result.bestTranscription.formattedString) }
                if error != nil || (result?.isFinal ?? false) { self?.stop() }
            }
        }
    }

    func stop() {
        guard isRecording else { return }
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        // Release the shared session so other apps stop being ducked / the .record category clears.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        finish()
    }

    private func finish() {
        isRecording = false
        let cb = onStop
        onStop = nil
        cb?()
    }
}
